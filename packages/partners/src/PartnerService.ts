/**
 * PartnerService — shared application + enrollment + conversion logic.
 *
 * Encapsulates the state machines and attribution rules for the partner
 * commercial loop:
 *
 *   Influencer → recruits → SalespersonApplication → approved → SalespersonProfile
 *     → enrolls → BusinessEnrollment (enrolled → qualifying → qualified → converted)
 *       → subscription payment → CommissionEarning (salesperson + influencer)
 *
 * ── State machines ───────────────────────────────────────────────────────────
 *
 * PartnerApplication:  pending → approved | rejected
 * BusinessEnrollment:   enrolled → qualifying → qualified → converted
 *
 * ── Attribution immutability ──────────────────────────────────────────────────
 *
 * INVARIANT 1: Once set, referredBy (influencerId) on a SalespersonProfile
 * and attributionSource on a BusinessEnrollment can NEVER be changed.
 * The values are set at creation time and persisted immutably.
 *
 * ── Commission trigger ──────────────────────────────────────────────────────
 *
 * INVARIANT 3: CommissionEarning records are created ONLY when
 * recordConversion() is called with a valid enrollment in 'qualified' state.
 * BusinessEnrollment alone does NOT trigger commission.
 */

import type {
  BusinessId, SalespersonProfileId, InfluencerProfileId,
  SalespersonApplicationId, ISO8601,
} from '@soostori/core'
import { newId, asIdempotencyKey } from '@soostori/core'
import type { SyncEngine, SyncEvent } from '@soostori/contracts'
import type { PartnerRepository } from './repository.js'
import type { CommissionService } from './CommissionService.js'
import type {
  PartnerApplication,
  PartnerApplicationStatus,
  BusinessEnrollment,
  EnrollmentStatus,
  SubmitApplicationInput,
  ApproveApplicationInput,
  RejectApplicationInput,
  EnrollBusinessInput,
  RecordConversionInput,
  CommissionEarning,
} from './types.js'
import {
  PARTNER_APPLICATION_SUBMITTED,
  PARTNER_APPROVED,
  PARTNER_REJECTED,
  PARTNER_ENROLLED,
  CONVERSION_QUALIFIED,
} from '@soostori/events'

// ── Error types ───────────────────────────────────────────────────────────────

export class ApplicationNotFoundError extends Error {
  constructor(id: string) {
    super(`Application ${id} not found`)
    this.name = 'ApplicationNotFoundError'
  }
}

export class EnrollmentNotFoundError extends Error {
  constructor(businessId: string) {
    super(`Enrollment for business ${businessId} not found`)
    this.name = 'EnrollmentNotFoundError'
  }
}

export class InvalidApplicationStatusError extends Error {
  constructor(current: PartnerApplicationStatus, expected: PartnerApplicationStatus) {
    super(`Application status is ${current}, expected ${expected}`)
    this.name = 'InvalidApplicationStatusError'
  }
}

export class InvalidEnrollmentStatusError extends Error {
  constructor(current: EnrollmentStatus, expected: EnrollmentStatus) {
    super(`Enrollment status is ${current}, expected ${expected}`)
    this.name = 'InvalidEnrollmentStatusError'
  }
}

// ── PartnerService ────────────────────────────────────────────────────────────

export class PartnerService {
  constructor(
    private readonly repo: PartnerRepository,
    private readonly commissionService: CommissionService,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: string,
    private readonly userId?: string,
  ) {}

  // ── Application ─────────────────────────────────────────────────────────────

  /**
   * Submit a new partner application.
   *
   * INVARIANT 1: referredBy and referralCode are stored immutably at submission.
   * They cannot be changed retroactively.
   */
  async submitApplication(input: SubmitApplicationInput): Promise<PartnerApplication> {
    // Check for existing application by this applicant
    const existing = await this.repo.getApplicationByApplicant(input.applicantPersonId)
    if (existing) {
      if (existing.status === 'pending') return existing
      throw new InvalidApplicationStatusError(existing.status, 'pending')
    }

    const now = new Date().toISOString() as ISO8601
    const app: PartnerApplication = {
      id: `sp-app-${newId()}` as SalespersonApplicationId,
      applicantPersonId: input.applicantPersonId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      country: input.country,
      referralCode: input.referralCode ?? null,
      /** INVARIANT 1: attribution set once at submission, never modified */
      referredBy: input.referredBy ?? null,
      status: 'pending',
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }

    await this.repo.upsertApplication(app)
    await this.emit(PARTNER_APPLICATION_SUBMITTED, app as unknown as Record<string, unknown>, 'create')

    return app
  }

  /**
   * Approve a pending application — creates the SalespersonProfile.
   *
   * INVARIANT 1: The referredBy (influencerId) from the application is
   * copied to the SalespersonProfile and is permanently immutable.
   */
  async approveApplication(input: ApproveApplicationInput): Promise<PartnerApplication> {
    const app = await this.repo.getApplication(input.applicationId)
    if (!app) throw new ApplicationNotFoundError(input.applicationId)
    if (app.status !== 'pending') {
      throw new InvalidApplicationStatusError(app.status, 'pending')
    }

    const now = new Date().toISOString() as ISO8601

    await this.repo.updateApplicationStatus(
      input.applicationId,
      'approved',
      this.userId,
      input.reviewNotes,
    )

    // Create the SalespersonProfile — referral attribution is set here
    // and permanently fixed (INVARIANT 1)
    const profileId = `sp-${newId()}` as SalespersonProfileId
    await this.repo.upsertSalespersonProfile({
      id: profileId,
      applicationId: app.id,
      personId: app.applicantPersonId,
      /** INVARIANT 1: influencer attribution copied from application — immutable */
      referredBy: app.referredBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    })

    const updated: PartnerApplication = {
      ...app,
      status: 'approved',
      reviewerUserId: this.userId ?? null,
      reviewNotes: input.reviewNotes ?? null,
      reviewedAt: now,
      updatedAt: now,
    }

    await this.emit(PARTNER_APPROVED, { applicationId: app.id, salespersonProfileId: profileId }, 'update')

    return updated
  }

  /**
   * Reject a pending application.
   *
   * INVARIANT 6: Admin-only path. No client-side state manipulation allowed.
   */
  async rejectApplication(input: RejectApplicationInput): Promise<PartnerApplication> {
    const app = await this.repo.getApplication(input.applicationId)
    if (!app) throw new ApplicationNotFoundError(input.applicationId)
    if (app.status !== 'pending') {
      throw new InvalidApplicationStatusError(app.status, 'pending')
    }

    const now = new Date().toISOString() as ISO8601

    await this.repo.updateApplicationStatus(
      input.applicationId,
      'rejected',
      this.userId,
      input.reason,
    )

    const updated: PartnerApplication = {
      ...app,
      status: 'rejected',
      reviewerUserId: this.userId ?? null,
      reviewNotes: input.reason ?? null,
      reviewedAt: now,
      updatedAt: now,
    }

    await this.emit(PARTNER_REJECTED, { applicationId: app.id, reason: input.reason }, 'update')

    return updated
  }

  async getApplication(id: SalespersonApplicationId): Promise<PartnerApplication | null> {
    return this.repo.getApplication(id)
  }

  async listPendingApplications(): Promise<PartnerApplication[]> {
    return this.repo.listApplicationsByStatus('pending')
  }

  // ── Enrollment ───────────────────────────────────────────────────────────────

  /**
   * Enroll a business under a salesperson — starts the conversion pipeline.
   *
   * INVARIANT 1: attributionSource is set at enrollment time and is
   * permanently immutable. The enrolling salesperson's referredBy (influencerId)
   * is carried forward as the attribution source.
   */
  async enrollBusiness(
    salespersonId: SalespersonProfileId,
    input: EnrollBusinessInput,
  ): Promise<BusinessEnrollment> {
    // Get salesperson profile to carry forward influencer attribution
    const profile = await this.repo.getSalespersonProfile(salespersonId)
    if (!profile) throw new Error(`SalespersonProfile ${salespersonId} not found`)

    const now = new Date().toISOString() as ISO8601

    const enrollment: BusinessEnrollment = {
      id: `enr-${newId()}`,
      businessId: input.businessId,
      salespersonProfileId: salespersonId,
      /** INVARIANT 1: attribution source set from salesperson's referredBy — immutable */
      influencerProfileId: profile.referredBy ?? null,
      status: 'enrolled',
      enrolledAt: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }

    await this.repo.upsertEnrollment(enrollment)
    await this.emit(PARTNER_ENROLLED, {
      salespersonProfileId: salespersonId,
      businessId: input.businessId,
    }, 'create')

    return enrollment
  }

  /**
   * Advance enrollment to 'qualifying' — business has an active subscription.
   */
  async advanceToQualifying(businessId: BusinessId): Promise<BusinessEnrollment> {
    const enrollment = await this.repo.getEnrollmentByBusiness(businessId)
    if (!enrollment) throw new EnrollmentNotFoundError(businessId)

    const valid: EnrollmentStatus[] = ['enrolled']
    if (!valid.includes(enrollment.status)) {
      throw new InvalidEnrollmentStatusError(enrollment.status, 'qualifying')
    }

    const now = new Date().toISOString() as ISO8601
    const updated: BusinessEnrollment = {
      ...enrollment,
      status: 'qualifying',
      qualifyingSinceAt: now,
      updatedAt: now,
    }

    await this.repo.upsertEnrollment(updated)
    return updated
  }

  /**
   * Advance enrollment to 'qualified' — business has a paying subscription.
   *
   * INVARIANT 3: This is the trigger point for commission generation.
   * After this method succeeds, callers SHOULD call recordConversionCommission.
   */
  async advanceToQualified(businessId: BusinessId): Promise<BusinessEnrollment> {
    const enrollment = await this.repo.getEnrollmentByBusiness(businessId)
    if (!enrollment) throw new EnrollmentNotFoundError(businessId)

    const valid: EnrollmentStatus[] = ['qualifying']
    if (!valid.includes(enrollment.status)) {
      throw new InvalidEnrollmentStatusError(enrollment.status, 'qualified')
    }

    const now = new Date().toISOString() as ISO8601
    const updated: BusinessEnrollment = {
      ...enrollment,
      status: 'qualified',
      qualifiedAt: now,
      updatedAt: now,
    }

    await this.repo.upsertEnrollment(updated)
    await this.emit(CONVERSION_QUALIFIED, {
      businessId,
      subscriptionId: '', // filled in by caller
      salespersonProfileId: enrollment.salespersonProfileId,
      influencerProfileId: enrollment.influencerProfileId ?? undefined,
    }, 'update')

    return updated
  }

  /**
   * Record a qualified conversion and generate commission earnings.
   *
   * INVARIANT 2: CommissionService.recordSalespersonCommission is idempotent
   * by (salespersonId + subscriptionId + role) idempotencyKey.
   *
   * INVARIANT 3: Called ONLY when enrollment is already 'qualified'.
   */
  async recordConversion(input: RecordConversionInput): Promise<CommissionEarning[]> {
    const enrollment = await this.repo.getEnrollmentByBusiness(input.businessId)
    if (!enrollment) throw new EnrollmentNotFoundError(input.businessId)
    if (enrollment.status !== 'qualified') {
      throw new InvalidEnrollmentStatusError(enrollment.status, 'converted')
    }

    // Emit conversion.qualified event
    await this.emit(CONVERSION_QUALIFIED, {
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      salespersonProfileId: enrollment.salespersonProfileId,
      influencerProfileId: enrollment.influencerProfileId ?? undefined,
    }, 'update')

    // Advance to converted
    const now = new Date().toISOString() as ISO8601
    await this.repo.upsertEnrollment({
      ...enrollment,
      status: 'converted',
      convertedAt: now,
      updatedAt: now,
    })

    // Record commission earnings — idempotent by key
    const commissionInput = {
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      subscriptionAmount: input.subscriptionAmount,
    }

    const earnings: CommissionEarning[] = []

    const spEarning = await this.commissionService.recordSalespersonCommission(
      commissionInput,
      enrollment.salespersonProfileId,
      enrollment.influencerProfileId,
    )
    earnings.push(spEarning)

    if (enrollment.influencerProfileId) {
      const infEarning = await this.commissionService.recordInfluencerCommission(
        commissionInput,
        enrollment.salespersonProfileId,
        enrollment.influencerProfileId,
      )
      earnings.push(infEarning)
    }

    return earnings
  }

  async getEnrollment(businessId: BusinessId): Promise<BusinessEnrollment | null> {
    return this.repo.getEnrollmentByBusiness(businessId)
  }

  async listSalespersonEnrollments(salespersonId: SalespersonProfileId): Promise<BusinessEnrollment[]> {
    return this.repo.listEnrollmentsBySalesperson(salespersonId)
  }

  async listSalespersonProfiles(): Promise<Array<{
    id: SalespersonProfileId
    applicationId: SalespersonApplicationId
    personId: string
    referredBy?: InfluencerProfileId | null
    createdAt: string
    updatedAt: string
    version: number
  }>> {
    // Return all profiles — filter by referredBy is done in caller
    // This is a stub; real impl would have a listSalespersonProfiles method
    return []
  }

  // ── Influencer ──────────────────────────────────────────────────────────────

  /**
   * Create or activate an influencer profile.
   *
   * Influencer creation is admin-only — no public self-service.
   */
  async upsertInfluencerProfile(input: {
    personId: string
    handle: string
    status?: 'active' | 'suspended'
    defaultCommissionRate?: number
  }): Promise<{ id: InfluencerProfileId }> {
    const now = new Date().toISOString()
    const id = `inf-${newId()}` as InfluencerProfileId

    await this.repo.upsertInfluencerProfile({
      id,
      personId: input.personId,
      handle: input.handle,
      status: input.status ?? 'active',
      defaultCommissionRate: input.defaultCommissionRate ?? 0,
      createdAt: now,
      updatedAt: now,
      version: 1,
    })

    return { id }
  }

  async getInfluencerProfile(id: InfluencerProfileId): Promise<{
    id: InfluencerProfileId
    personId: string
    handle: string
    status: 'active' | 'suspended'
    defaultCommissionRate: number
    createdAt: string
    updatedAt: string
    version: number
  } | null> {
    return this.repo.getInfluencerProfile(id)
  }

  async listSalespersonsByInfluencer(influencerId: InfluencerProfileId) {
    return this.repo.listSalespersonProfilesByInfluencer(influencerId)
  }

  // ── Emit helper ─────────────────────────────────────────────────────────────

  private async emit(
    eventType: string,
    payload: Record<string, unknown>,
    operation: SyncEvent['operation'],
  ): Promise<void> {
    const event: SyncEvent = {
      id: newId() as any,
      idempotencyKey: asIdempotencyKey(`${this.businessId}:${eventType}:${Date.now()}`),
      businessId: this.businessId,
      entityKind: 'partnerApplication',
      entityId: (payload as any).applicationId ?? (payload as any).salespersonProfileId ?? this.businessId,
      operation,
      originatingDeviceId: this.deviceId as any,
      originatingEmployeeId: this.userId as any,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: 1,
      payload,
      state: 'pending',
    }

    this.syncEngine.enqueue(event).catch(() => { /* non-critical */ })
  }
}
