/**
 * EnrollmentService — business enrollment + conversion pipeline.
 * Chain: enrolled → qualifying → qualified → converted.
 *
 * INVARIANT 1: influencerProfileId set from salesperson's referredBy — immutable.
 * INVARIANT 3: CommissionEarning created ONLY on recordConversion (qualified state).
 */

import type {
  BusinessId, SalespersonProfileId, InfluencerProfileId, ISO8601, Money,
} from '@soostori/core'
import { newId, asIdempotencyKey } from '@soostori/core'
import type { SyncEngine, SyncEvent } from '@soostori/contracts'
import type { PartnerRepository } from './repository.js'
import type { CommissionService } from './CommissionService.js'
import type { BusinessEnrollment, EnrollmentStatus, EnrollBusinessInput, RecordConversionInput, CommissionEarning } from './types.js'
import { PARTNER_ENROLLED, CONVERSION_QUALIFIED } from '@soostori/events'

export class EnrollmentNotFoundError extends Error {
  constructor(businessId: string) {
    super(`Enrollment for business ${businessId} not found`)
    this.name = 'EnrollmentNotFoundError'
  }
}

export class InvalidEnrollmentStatusError extends Error {
  constructor(current: EnrollmentStatus, expected: EnrollmentStatus) {
    super(`Enrollment status is ${current}, expected ${expected}`)
    this.name = 'InvalidEnrollmentStatusError'
  }
}

export class EnrollmentService {
  constructor(
    private readonly repo: PartnerRepository,
    private readonly commissionService: CommissionService,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: string,
    private readonly userId?: string,
  ) {}

  /** INVARIANT 1: influencerProfileId carried from salesperson referredBy — immutable. */
  async enrollBusiness(salespersonId: SalespersonProfileId, input: EnrollBusinessInput): Promise<BusinessEnrollment> {
    const profile = await this.repo.getSalespersonProfile(salespersonId)
    if (!profile) throw new Error(`SalespersonProfile ${salespersonId} not found`)

    const now = new Date().toISOString() as ISO8601
    const enrollment: BusinessEnrollment = {
      id: `enr-${newId()}`, businessId: input.businessId, salespersonProfileId: salespersonId,
      /** INVARIANT 1: attribution set from salesperson's referredBy — immutable forever */
      influencerProfileId: profile.referredBy ?? null,
      status: 'enrolled', enrolledAt: now, createdAt: now, updatedAt: now, version: 1,
    }

    await this.repo.upsertEnrollment(enrollment)
    await this.emit(PARTNER_ENROLLED, { salespersonProfileId: salespersonId, businessId: input.businessId }, 'create')
    return enrollment
  }

  async advanceToQualifying(businessId: BusinessId): Promise<BusinessEnrollment> {
    const enrollment = await this.repo.getEnrollmentByBusiness(businessId)
    if (!enrollment) throw new EnrollmentNotFoundError(businessId)
    if (enrollment.status !== 'enrolled') throw new InvalidEnrollmentStatusError(enrollment.status, 'qualifying')

    const now = new Date().toISOString() as ISO8601
    const updated: BusinessEnrollment = { ...enrollment, status: 'qualifying', qualifyingSinceAt: now, updatedAt: now }
    await this.repo.upsertEnrollment(updated)
    return updated
  }

  /** INVARIANT 3: this is the commission trigger precondition. */
  async advanceToQualified(businessId: BusinessId): Promise<BusinessEnrollment> {
    const enrollment = await this.repo.getEnrollmentByBusiness(businessId)
    if (!enrollment) throw new EnrollmentNotFoundError(businessId)
    if (enrollment.status !== 'qualifying') throw new InvalidEnrollmentStatusError(enrollment.status, 'qualified')

    const now = new Date().toISOString() as ISO8601
    const updated: BusinessEnrollment = { ...enrollment, status: 'qualified', qualifiedAt: now, updatedAt: now }
    await this.repo.upsertEnrollment(updated)
    await this.emit(CONVERSION_QUALIFIED, {
      businessId, subscriptionId: 'pending', salespersonProfileId: enrollment.salespersonProfileId,
      influencerProfileId: enrollment.influencerProfileId ?? undefined,
    }, 'update')
    return updated
  }

  /**
   * Record a qualified conversion — generate commission earnings idempotently.
   * INVARIANT 2: CommissionService idempotent by (salespersonId + subscriptionId + role).
   * INVARIANT 3: Called ONLY when enrollment is 'qualified'.
   */
  async recordConversion(input: RecordConversionInput): Promise<CommissionEarning[]> {
    const enrollment = await this.repo.getEnrollmentByBusiness(input.businessId)
    if (!enrollment) throw new EnrollmentNotFoundError(input.businessId)
    if (enrollment.status !== 'qualified') throw new InvalidEnrollmentStatusError(enrollment.status, 'converted')

    await this.emit(CONVERSION_QUALIFIED, {
      businessId: input.businessId, subscriptionId: input.subscriptionId,
      salespersonProfileId: enrollment.salespersonProfileId,
      influencerProfileId: enrollment.influencerProfileId ?? undefined,
    }, 'update')

    const now = new Date().toISOString() as ISO8601
    await this.repo.upsertEnrollment({ ...enrollment, status: 'converted', convertedAt: now, updatedAt: now })

    const commissionInput = { businessId: input.businessId, subscriptionId: input.subscriptionId, subscriptionAmount: input.subscriptionAmount }
    const earnings: CommissionEarning[] = []
    earnings.push(await this.commissionService.recordSalespersonCommission(commissionInput, enrollment.salespersonProfileId, enrollment.influencerProfileId))
    if (enrollment.influencerProfileId) {
      earnings.push(await this.commissionService.recordInfluencerCommission(commissionInput, enrollment.salespersonProfileId, enrollment.influencerProfileId))
    }
    return earnings
  }

  async getEnrollment(businessId: BusinessId): Promise<BusinessEnrollment | null> {
    return this.repo.getEnrollmentByBusiness(businessId)
  }

  async listSalespersonEnrollments(salespersonId: SalespersonProfileId): Promise<BusinessEnrollment[]> {
    return this.repo.listEnrollmentsBySalesperson(salespersonId)
  }

  private async emit(eventType: string, payload: Record<string, unknown>, operation: SyncEvent['operation']): Promise<void> {
    const event: SyncEvent = {
      id: newId() as any,
      idempotencyKey: asIdempotencyKey(`${this.businessId}:${eventType}:${Date.now()}`),
      businessId: this.businessId, entityKind: 'businessEnrollment',
      entityId: (payload as any).businessId ?? this.businessId,
      operation, originatingDeviceId: this.deviceId as any,
      originatingEmployeeId: this.userId as any,
      clientSequence: Date.now(), clientCreatedAt: new Date().toISOString(),
      entityVersion: 1, payload, state: 'pending',
    }
    this.syncEngine.enqueue(event).catch(() => { /* non-critical */ })
  }
}
