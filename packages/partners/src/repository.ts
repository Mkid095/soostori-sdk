/**
 * PartnerRepository — data access contract for PartnerService.
 *
 * Repository is the ONLY place where idempotency constraints are enforced.
 * All uniqueness checks live here; services call repositories, never the reverse.
 *
 * INVARIANT 2 (No duplicate earnings): upsertCommissionEarning MUST enforce
 * uniqueness on idempotencyKey = salespersonId + subscriptionId + role.
 * The implementation must use a DB unique index or equivalent to prevent
 * duplicate inserts even under concurrent replay.
 */

import type {
  BusinessId, SalespersonProfileId, InfluencerProfileId,
  SalespersonApplicationId,
} from '@soostori/core'
import type {
  PartnerApplication,
  PartnerApplicationStatus,
  CommissionEarning,
  BusinessEnrollment,
  EnrollmentStatus,
} from './types.js'

export interface PartnerRepository {
  // ── Applications ──────────────────────────────────────────────────────────

  upsertApplication(app: PartnerApplication): Promise<void>
  getApplication(id: SalespersonApplicationId): Promise<PartnerApplication | null>
  getApplicationByApplicant(personId: string): Promise<PartnerApplication | null>
  listApplicationsByStatus(status: PartnerApplicationStatus): Promise<PartnerApplication[]>
  updateApplicationStatus(
    id: SalespersonApplicationId,
    status: PartnerApplicationStatus,
    reviewerUserId?: string,
    reviewNotes?: string,
  ): Promise<void>

  // ── Salesperson profiles ────────────────────────────────────────────────

  upsertSalespersonProfile(profile: {
    id: SalespersonProfileId
    applicationId: SalespersonApplicationId
    personId: string
    referredBy?: InfluencerProfileId | null
    createdAt: string
    updatedAt: string
    version: number
  }): Promise<void>
  getSalespersonProfile(id: SalespersonProfileId): Promise<{
    id: SalespersonProfileId
    applicationId: SalespersonApplicationId
    personId: string
    referredBy?: InfluencerProfileId | null
    createdAt: string
    updatedAt: string
    version: number
  } | null>
  listSalespersonProfilesByInfluencer(influencerId: InfluencerProfileId): Promise<Array<{
    id: SalespersonProfileId
    applicationId: SalespersonApplicationId
    personId: string
    referredBy?: InfluencerProfileId | null
    createdAt: string
    updatedAt: string
    version: number
  }>>

  // ── Influencer profiles ─────────────────────────────────────────────────

  upsertInfluencerProfile(profile: {
    id: InfluencerProfileId
    personId: string
    handle: string
    status: 'active' | 'suspended'
    defaultCommissionRate: number
    createdAt: string
    updatedAt: string
    version: number
  }): Promise<void>
  getInfluencerProfile(id: InfluencerProfileId): Promise<{
    id: InfluencerProfileId
    personId: string
    handle: string
    status: 'active' | 'suspended'
    defaultCommissionRate: number
    createdAt: string
    updatedAt: string
    version: number
  } | null>

  // ── Enrollments ────────────────────────────────────────────────────────

  upsertEnrollment(enrollment: BusinessEnrollment): Promise<void>
  getEnrollmentByBusiness(businessId: BusinessId): Promise<BusinessEnrollment | null>
  listEnrollmentsBySalesperson(salespersonId: SalespersonProfileId): Promise<BusinessEnrollment[]>
  updateEnrollmentStatus(id: string, status: EnrollmentStatus): Promise<void>

  // ── Commission earnings ────────────────────────────────────────────────

  /**
   * Upsert a commission earning — MUST enforce idempotencyKey uniqueness.
   *
   * If an earning with the same idempotencyKey already exists, this method
   * MUST return the existing record without creating a duplicate.
   * Concurrent calls with the same key MUST be handled safely (DB unique index).
   */
  upsertCommissionEarning(earning: CommissionEarning): Promise<{ created: boolean; earning: CommissionEarning }>
  getCommissionEarningByKey(key: string): Promise<CommissionEarning | null>
  listEarningsBySalesperson(salespersonId: SalespersonProfileId): Promise<CommissionEarning[]>
  listEarningsByInfluencer(influencerId: InfluencerProfileId): Promise<CommissionEarning[]>
  listEarningsByBusiness(businessId: BusinessId): Promise<CommissionEarning[]>
}
