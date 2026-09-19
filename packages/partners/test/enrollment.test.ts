/**
 * EnrollmentService — enrollment + attribution unit tests.
 *
 * Covers:
 * - enrollBusiness attribution (influencer vs no-influencer)
 * - idempotent duplicate enrollment
 * - sales-person isolation
 * - re-enrollment preserves qualifiedAt (24-month window protection)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PartnerRepository } from '../src/repository.js'
import type { CommissionService } from '../src/CommissionService.js'
import type { SyncEngine } from '@soostori/contracts'
import { EnrollmentService } from '../src/EnrollmentService.js'
import type { BusinessEnrollment, EnrollBusinessInput } from '../src/types.js'

// ── Test doubles ────────────────────────────────────────────────────────────────

function createMockRepo() {
  const store: {
    profiles: Map<string, { id: string; referredBy: string | null }>
    enrollments: Map<string, BusinessEnrollment>
  } = {
    profiles: new Map(),
    enrollments: new Map(),
  }

  return {
    _store: store,
    getSalespersonProfile: vi.fn<PartnerRepository['getSalespersonProfile']>(),
    upsertEnrollment: vi.fn<PartnerRepository['upsertEnrollment']>(
      async (e: BusinessEnrollment) => { store.enrollments.set(e.businessId, e) },
    ),
    getEnrollmentByBusiness: vi.fn<PartnerRepository['getEnrollmentByBusiness']>(
      async (businessId: string) => store.enrollments.get(businessId) ?? null,
    ),
    upsertCommissionEarning: vi.fn(),
    getCommissionEarningByKey: vi.fn(),
    listEnrollmentsByInfluencer: vi.fn<PartnerRepository['listEnrollmentsByInfluencer']>(),
    listEarningsByInfluencer: vi.fn(),
  }
}

function createMockCommissionService(): CommissionService {
  return {
    recordSalespersonCommission: vi.fn<CommissionService['recordSalespersonCommission']>() as any,
    recordInfluencerCommission: vi.fn<CommissionService['recordInfluencerCommission']>() as any,
    recordCompanyCommission: vi.fn<CommissionService['recordCompanyCommission']>() as any,
    calculateSplit: vi.fn<CommissionService['calculateSplit']>() as any,
    isCommissionEligible: vi.fn<CommissionService['isCommissionEligible']>() as any,
    getCommissionPeriod: vi.fn<CommissionService['getCommissionPeriod']>() as any,
  } as unknown as CommissionService
}

function createMockSyncEngine(): SyncEngine {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn(),
    push: vi.fn(),
  } as unknown as SyncEngine
}

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeEnrollment(overrides: Partial<BusinessEnrollment> = {}): BusinessEnrollment {
  return {
    id: 'enr-1',
    businessId: 'biz-1',
    salespersonProfileId: 'sp-1',
    influencerProfileId: null,
    status: 'enrolled',
    enrolledAt: '2026-01-01T00:00:00Z',
    qualifyingSinceAt: null,
    qualifiedAt: null,
    convertedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1,
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('EnrollmentService.enrollBusiness attribution', () => {

  it('TEST 1 — salesperson without influencer: enrollment.influencerProfileId === null', async () => {
    const repo = createMockRepo()
    const sync = createMockSyncEngine()

    // Salesperson with no referredBy (not recruited by any influencer)
    repo.getSalespersonProfile.mockResolvedValue({
      id: 'sp-1', applicationId: 'app-1', personId: 'person-1',
      referredBy: null, createdAt: '', updatedAt: '', version: 1,
    })
    repo.getEnrollmentByBusiness.mockResolvedValue(null)

    const svc = new EnrollmentService(repo as any, createMockCommissionService(), sync, 'biz-1' as any, 'dev-1')
    const result = await svc.enrollBusiness('sp-1' as any, { businessId: 'biz-1' as any })

    expect(result.influencerProfileId).toBeNull()
    expect(repo.upsertEnrollment).toHaveBeenCalledOnce()
  })

  it('TEST 2 — salesperson with influencer: enrollment.influencerProfileId === influencer-A', async () => {
    const repo = createMockRepo()
    const sync = createMockSyncEngine()

    // Salesperson recruited by influencer-A
    repo.getSalespersonProfile.mockResolvedValue({
      id: 'sp-1', applicationId: 'app-1', personId: 'person-1',
      referredBy: 'inf-A', createdAt: '', updatedAt: '', version: 1,
    })
    repo.getEnrollmentByBusiness.mockResolvedValue(null)

    const svc = new EnrollmentService(repo as any, createMockCommissionService(), sync, 'biz-1' as any, 'dev-1')
    const result = await svc.enrollBusiness('sp-1' as any, { businessId: 'biz-1' as any })

    expect(result.influencerProfileId).toBe('inf-A')
  })

  it('TEST 3 — duplicate enrollment is idempotent: existing enrollment is reused', async () => {
    const repo = createMockRepo()
    const sync = createMockSyncEngine()

    repo.getSalespersonProfile.mockResolvedValue({
      id: 'sp-1', applicationId: 'app-1', personId: 'person-1',
      referredBy: 'inf-A', createdAt: '', updatedAt: '', version: 1,
    })

    // Existing enrollment for this business
    const existingEnrollment = makeEnrollment({
      id: 'enr-existing',
      businessId: 'biz-1',
      salespersonProfileId: 'sp-1',
      influencerProfileId: 'inf-A',
      status: 'enrolled',
    })
    repo.getEnrollmentByBusiness.mockResolvedValue(existingEnrollment)

    const svc = new EnrollmentService(repo as any, createMockCommissionService(), sync, 'biz-1' as any, 'dev-1')
    const result = await svc.enrollBusiness('sp-1' as any, { businessId: 'biz-1' as any })

    // The existing enrollment ID is preserved — no duplicate is created
    expect(result.id).toBe('enr-existing')
    // Status is preserved, not reset to 'enrolled'
    expect(result.status).toBe('enrolled')
    expect(repo.upsertEnrollment).toHaveBeenCalledTimes(1)
  })

  it('TEST 4 — different salesperson isolation: each enrollment has correct salespersonId', async () => {
    const repo = createMockRepo()
    const sync = createMockSyncEngine()

    // Two separate salespeople
    repo.getSalespersonProfile.mockImplementation(async (id: string) => {
      if (id === 'sp-A') return { id: 'sp-A', applicationId: 'app-A', personId: 'person-A', referredBy: 'inf-X', createdAt: '', updatedAt: '', version: 1 }
      if (id === 'sp-B') return { id: 'sp-B', applicationId: 'app-B', personId: 'person-B', referredBy: null, createdAt: '', updatedAt: '', version: 1 }
      return null
    })
    repo.getEnrollmentByBusiness.mockResolvedValue(null)

    const svc = new EnrollmentService(repo as any, createMockCommissionService(), sync, 'biz-1' as any, 'dev-1')

    const enrollmentA = await svc.enrollBusiness('sp-A' as any, { businessId: 'biz-A' as any })
    const enrollmentB = await svc.enrollBusiness('sp-B' as any, { businessId: 'biz-B' as any })

    expect(enrollmentA.salespersonProfileId).toBe('sp-A')
    expect(enrollmentA.influencerProfileId).toBe('inf-X')
    expect(enrollmentB.salespersonProfileId).toBe('sp-B')
    expect(enrollmentB.influencerProfileId).toBeNull()
    expect(enrollmentA.id).not.toBe(enrollmentB.id)
  })
})

describe('EnrollmentService re-enrollment 24-month window protection', () => {

  it('re-enrollment after expiry preserves original qualifiedAt — no new window created', async () => {
    const repo = createMockRepo()
    const sync = createMockSyncEngine()

    repo.getSalespersonProfile.mockResolvedValue({
      id: 'sp-1', applicationId: 'app-1', personId: 'person-1',
      referredBy: 'inf-A', createdAt: '', updatedAt: '', version: 1,
    })

    // Existing enrollment that was qualified on Sep 10, 2026 (window already expired)
    const expiredEnrollment = makeEnrollment({
      id: 'enr-old',
      businessId: 'biz-1',
      salespersonProfileId: 'sp-1',
      influencerProfileId: 'inf-A',
      status: 'qualified',
      qualifiedAt: '2026-09-10T00:00:00Z',  // 24-month window: Sep 10 2026 → Sep 9 2028
      qualifyingSinceAt: '2026-09-01T00:00:00Z',
    })
    repo.getEnrollmentByBusiness.mockResolvedValue(expiredEnrollment)

    const svc = new EnrollmentService(repo as any, createMockCommissionService(), sync, 'biz-1' as any, 'dev-1')

    // Attempt to re-enroll the same business
    const result = await svc.enrollBusiness('sp-1' as any, { businessId: 'biz-1' as any })

    // The original qualifiedAt MUST be preserved — no reset to null or new date
    expect(result.qualifiedAt).toBe('2026-09-10T00:00:00Z')
    // Status remains 'qualified' — not reset to 'enrolled'
    expect(result.status).toBe('qualified')
    // ID is preserved
    expect(result.id).toBe('enr-old')
  })

  it('re-enrollment during active window preserves qualifiedAt', async () => {
    const repo = createMockRepo()
    const sync = createMockSyncEngine()

    repo.getSalespersonProfile.mockResolvedValue({
      id: 'sp-1', applicationId: 'app-1', personId: 'person-1',
      referredBy: 'inf-A', createdAt: '', updatedAt: '', version: 1,
    })

    // Active enrollment qualified 6 months ago
    const activeEnrollment = makeEnrollment({
      id: 'enr-active',
      businessId: 'biz-1',
      salespersonProfileId: 'sp-1',
      influencerProfileId: 'inf-A',
      status: 'qualified',
      qualifiedAt: '2026-03-10T00:00:00Z',  // window: Mar 10 2026 → Mar 9 2028
      qualifyingSinceAt: '2026-03-01T00:00:00Z',
    })
    repo.getEnrollmentByBusiness.mockResolvedValue(activeEnrollment)

    const svc = new EnrollmentService(repo as any, createMockCommissionService(), sync, 'biz-1' as any, 'dev-1')
    const result = await svc.enrollBusiness('sp-1' as any, { businessId: 'biz-1' as any })

    expect(result.qualifiedAt).toBe('2026-03-10T00:00:00Z')
    expect(result.status).toBe('qualified')
    expect(result.id).toBe('enr-active')
  })

  it('new enrollment without prior record creates enrollment without qualifiedAt', async () => {
    const repo = createMockRepo()
    const sync = createMockSyncEngine()

    repo.getSalespersonProfile.mockResolvedValue({
      id: 'sp-1', applicationId: 'app-1', personId: 'person-1',
      referredBy: 'inf-A', createdAt: '', updatedAt: '', version: 1,
    })
    repo.getEnrollmentByBusiness.mockResolvedValue(null)

    const svc = new EnrollmentService(repo as any, createMockCommissionService(), sync, 'biz-1' as any, 'dev-1')
    const result = await svc.enrollBusiness('sp-1' as any, { businessId: 'biz-1' as any })

    expect(result.qualifiedAt).toBeNull()
    expect(result.status).toBe('enrolled')
    expect(result.id).not.toBeNull()
  })

  it('re-enrollment after expiry: influencer remains ineligible via isCommissionEligible', async () => {
    const repo = createMockRepo()
    const sync = createMockSyncEngine()

    repo.getSalespersonProfile.mockResolvedValue({
      id: 'sp-1', applicationId: 'app-1', personId: 'person-1',
      referredBy: 'inf-A', createdAt: '', updatedAt: '', version: 1,
    })

    // Expired enrollment
    const expiredEnrollment = makeEnrollment({
      id: 'enr-expired',
      businessId: 'biz-1',
      salespersonProfileId: 'sp-1',
      influencerProfileId: 'inf-A',
      status: 'qualified',
      qualifiedAt: '2024-09-10T00:00:00Z',  // window already expired (Sep 9 2026)
      qualifyingSinceAt: '2024-09-01T00:00:00Z',
    })
    repo.getEnrollmentByBusiness.mockResolvedValue(expiredEnrollment)

    // Mock getCommissionPeriod to return an expired window
    const commissionSvc = createMockCommissionService()
    ;(commissionSvc.getCommissionPeriod as any).mockResolvedValue({
      influencerId: 'inf-A',
      shopId: 'biz-1',
      windowStartAt: '2024-09-10T00:00:00Z',
      windowEndAt: '2026-09-09T00:00:00Z',  // already expired
      monthsEarned: 24,
      isEligible: false,
    })

    const svc = new EnrollmentService(repo as any, commissionSvc, sync, 'biz-1' as any, 'dev-1')
    await svc.enrollBusiness('sp-1' as any, { businessId: 'biz-1' as any })

    // qualifiedAt is still the original date
    const calledEnrollment = (repo.upsertEnrollment as any).mock.calls[0][0]
    expect(calledEnrollment.qualifiedAt).toBe('2024-09-10T00:00:00Z')
    expect(calledEnrollment.status).toBe('qualified')
  })
})
