/**
 * SalespersonApplicationService — application lifecycle + profile creation.
 * State machine: pending → approved | rejected.
 *
 * INVARIANT 1: referredBy set at submission; copied to SalespersonProfile on
 * approval — permanently immutable.
 * INVARIANT 6: approveApplication/rejectApplication are admin-only.
 */

import type {
  BusinessId, SalespersonProfileId, InfluencerProfileId,
  SalespersonApplicationId, ISO8601,
} from '@soostori/core'
import { newId, asIdempotencyKey } from '@soostori/core'
import type { SyncEngine, SyncEvent } from '@soostori/contracts'
import type { PartnerRepository } from './repository.js'
import type {
  PartnerApplication, PartnerApplicationStatus,
  SubmitApplicationInput, ApproveApplicationInput, RejectApplicationInput,
} from './types.js'
import { PARTNER_APPLICATION_SUBMITTED, PARTNER_APPROVED, PARTNER_REJECTED } from '@soostori/events'

export class ApplicationNotFoundError extends Error {
  constructor(id: string) {
    super(`Application ${id} not found`)
    this.name = 'ApplicationNotFoundError'
  }
}

export class InvalidApplicationStatusError extends Error {
  constructor(current: PartnerApplicationStatus, expected: PartnerApplicationStatus) {
    super(`Application status is ${current}, expected ${expected}`)
    this.name = 'InvalidApplicationStatusError'
  }
}

export class SalespersonApplicationService {
  constructor(
    private readonly repo: PartnerRepository,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: string,
    private readonly userId?: string,
  ) {}

  /**
   * Submit a partner application.
   *
   * INVARIANT 1: referralCode and referredBy are stored immutably at
   * submission — they can never be retroactively changed.
   */
  async submitApplication(input: SubmitApplicationInput): Promise<PartnerApplication> {
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
      /** INVARIANT 1: attribution set once, never modified */
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

  async approveApplication(input: ApproveApplicationInput): Promise<PartnerApplication> {
    const app = await this.repo.getApplication(input.applicationId)
    if (!app) throw new ApplicationNotFoundError(input.applicationId)
    if (app.status !== 'pending') throw new InvalidApplicationStatusError(app.status, 'pending')

    const now = new Date().toISOString() as ISO8601
    await this.repo.updateApplicationStatus(input.applicationId, 'approved', this.userId, input.reviewNotes)

    const profileId = `sp-${newId()}` as SalespersonProfileId
    // INVARIANT 1: referredBy (influencerId) copied from application — permanently immutable
    await this.repo.upsertSalespersonProfile({
      id: profileId, applicationId: app.id, personId: app.applicantPersonId,
      referredBy: app.referredBy, createdAt: now, updatedAt: now, version: 1,
    })

    const updated: PartnerApplication = {
      ...app, status: 'approved', reviewerUserId: this.userId ?? null,
      reviewNotes: input.reviewNotes ?? null, reviewedAt: now, updatedAt: now,
    }

    await this.emit(PARTNER_APPROVED, { applicationId: app.id, salespersonProfileId: profileId }, 'update')
    return updated
  }

  async rejectApplication(input: RejectApplicationInput): Promise<PartnerApplication> {
    const app = await this.repo.getApplication(input.applicationId)
    if (!app) throw new ApplicationNotFoundError(input.applicationId)
    if (app.status !== 'pending') throw new InvalidApplicationStatusError(app.status, 'pending')

    const now = new Date().toISOString() as ISO8601
    await this.repo.updateApplicationStatus(input.applicationId, 'rejected', this.userId, input.reason)

    const updated: PartnerApplication = {
      ...app, status: 'rejected', reviewerUserId: this.userId ?? null,
      reviewNotes: input.reason ?? null, reviewedAt: now, updatedAt: now,
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

  async getSalespersonProfile(id: SalespersonProfileId) {
    return this.repo.getSalespersonProfile(id)
  }

  async listSalespersonProfilesByInfluencer(influencerId: InfluencerProfileId) {
    return this.repo.listSalespersonProfilesByInfluencer(influencerId)
  }

  private async emit(eventType: string, payload: Record<string, unknown>, operation: SyncEvent['operation']): Promise<void> {
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
