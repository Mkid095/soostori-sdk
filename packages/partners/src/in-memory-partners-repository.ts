/**
 * In-memory implementation of PartnerRepository.
 *
 * Suitable for testing and development. Not suitable for production
 * where partner data must survive process restarts.
 */

import type {
  BusinessId,
  SalespersonProfileId,
  InfluencerProfileId,
  SalespersonApplicationId,
  ISO8601,
} from '@soostori/core'
import type {
  PartnerApplication,
  PartnerApplicationStatus,
  CommissionEarning,
  BusinessEnrollment,
  EnrollmentStatus,
} from './types.js'
import type { PartnerRepository, SalespersonProfileRecord } from './repository.js'

export class InMemoryPartnersRepository implements PartnerRepository {
  private readonly applications = new Map<string, PartnerApplication>()
  private readonly salespersonProfiles = new Map<string, SalespersonProfileRecord>()
  private readonly influencerProfiles = new Map<string, {
    id: InfluencerProfileId
    personId: string
    handle: string
    status: 'active' | 'suspended'
    defaultCommissionRate: number
    createdAt: string
    updatedAt: string
    version: number
  }>()
  private readonly enrollments = new Map<string, BusinessEnrollment>()
  private readonly commissionEarnings = new Map<string, CommissionEarning>()

  // ── Applications ──────────────────────────────────────────────────────────

  async upsertApplication(app: PartnerApplication): Promise<void> {
    this.applications.set(app.id, app)
  }

  async getApplication(id: SalespersonApplicationId): Promise<PartnerApplication | null> {
    return this.applications.get(id) ?? null
  }

  async getApplicationByApplicant(personId: string): Promise<PartnerApplication | null> {
    for (const app of this.applications.values()) {
      if (app.applicantPersonId === personId) return app
    }
    return null
  }

  async listApplicationsByStatus(status: PartnerApplicationStatus): Promise<PartnerApplication[]> {
    return [...this.applications.values()].filter(a => a.status === status)
  }

  async updateApplicationStatus(
    id: SalespersonApplicationId,
    status: PartnerApplicationStatus,
    reviewerUserId?: string,
    reviewNotes?: string,
  ): Promise<void> {
    const app = this.applications.get(id)
    if (!app) return
    this.applications.set(id, {
      ...app,
      status,
      reviewerUserId: reviewerUserId ?? app.reviewerUserId,
      reviewNotes: reviewNotes ?? app.reviewNotes,
      reviewedAt: new Date().toISOString() as ISO8601,
      updatedAt: new Date().toISOString() as ISO8601,
      version: app.version + 1,
    })
  }

  // ── Salesperson profiles ────────────────────────────────────────────────

  async upsertSalespersonProfile(profile: SalespersonProfileRecord): Promise<void> {
    this.salespersonProfiles.set(profile.id, profile)
  }

  async getSalespersonProfile(id: SalespersonProfileId): Promise<SalespersonProfileRecord | null> {
    return this.salespersonProfiles.get(id) ?? null
  }

  async listSalespersonProfilesByInfluencer(influencerId: InfluencerProfileId): Promise<SalespersonProfileRecord[]> {
    return [...this.salespersonProfiles.values()].filter(p => p.referredBy === influencerId)
  }

  // ── Influencer profiles ─────────────────────────────────────────────────

  async upsertInfluencerProfile(profile: {
    id: InfluencerProfileId
    personId: string
    handle: string
    status: 'active' | 'suspended'
    defaultCommissionRate: number
    createdAt: string
    updatedAt: string
    version: number
  }): Promise<void> {
    this.influencerProfiles.set(profile.id, profile)
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
    return this.influencerProfiles.get(id) ?? null
  }

  // ── Enrollments ────────────────────────────────────────────────────────

  async upsertEnrollment(enrollment: BusinessEnrollment): Promise<void> {
    this.enrollments.set(enrollment.id, enrollment)
  }

  async getEnrollmentByBusiness(businessId: BusinessId): Promise<BusinessEnrollment | null> {
    for (const e of this.enrollments.values()) {
      if (e.businessId === businessId) return e
    }
    return null
  }

  async listEnrollmentsBySalesperson(salespersonId: SalespersonProfileId): Promise<BusinessEnrollment[]> {
    return [...this.enrollments.values()].filter(e => e.salespersonProfileId === salespersonId)
  }

  async listEnrollmentsByInfluencer(influencerId: InfluencerProfileId): Promise<BusinessEnrollment[]> {
    return [...this.enrollments.values()].filter(e => e.influencerProfileId === influencerId)
  }

  async updateEnrollmentStatus(id: string, status: EnrollmentStatus): Promise<void> {
    const enrollment = this.enrollments.get(id)
    if (!enrollment) return
    this.enrollments.set(id, {
      ...enrollment,
      status,
      updatedAt: new Date().toISOString() as ISO8601,
      version: enrollment.version + 1,
    })
  }

  // ── Commission earnings ────────────────────────────────────────────────

  async upsertCommissionEarning(earning: CommissionEarning): Promise<{ created: boolean; earning: CommissionEarning }> {
    const existing = this.commissionEarnings.get(earning.idempotencyKey)
    if (existing) {
      return { created: false, earning: existing }
    }
    this.commissionEarnings.set(earning.idempotencyKey, earning)
    return { created: true, earning }
  }

  async getCommissionEarningByKey(key: string): Promise<CommissionEarning | null> {
    return this.commissionEarnings.get(key) ?? null
  }

  async listEarningsBySalesperson(salespersonId: SalespersonProfileId): Promise<CommissionEarning[]> {
    return [...this.commissionEarnings.values()].filter(e => e.salespersonProfileId === salespersonId)
  }

  async listEarningsByInfluencer(influencerId: InfluencerProfileId): Promise<CommissionEarning[]> {
    return [...this.commissionEarnings.values()].filter(e => e.influencerProfileId === influencerId)
  }

  async listEarningsByBusiness(businessId: BusinessId): Promise<CommissionEarning[]> {
    return [...this.commissionEarnings.values()].filter(e => e.businessId === businessId)
  }
}
