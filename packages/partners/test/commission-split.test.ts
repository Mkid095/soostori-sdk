/**
 * CommissionService — unit tests.
 *
 * Covers:
 * - Canonical commission formula (amount → split)
 * - Idempotency key format
 * - recordSalespersonCommission idempotency
 * - recordInfluencerCommission idempotency
 */

import { describe, it, expect, vi } from 'vitest'
import type { PartnerRepository } from '../src/repository.js'
import type { SyncEngine } from '@soostori/contracts'
import { CommissionService } from '../src/CommissionService.js'

// ── Test doubles ────────────────────────────────────────────────────────────────

function createMockRepo() {
  return {
    upsertCommissionEarning: vi.fn<PartnerRepository['upsertCommissionEarning']>(),
    getCommissionEarningByKey: vi.fn<PartnerRepository['getCommissionEarningByKey']>(),
    listEarningsBySalesperson: vi.fn<PartnerRepository['listEarningsBySalesperson']>(),
    listEarningsByInfluencer: vi.fn<PartnerRepository['listEarningsByInfluencer']>(),
    listEarningsByBusiness: vi.fn<PartnerRepository['listEarningsByBusiness']>(),
    upsertApplication: vi.fn(),
    getApplication: vi.fn(),
    getApplicationByApplicant: vi.fn(),
    listApplicationsByStatus: vi.fn(),
    updateApplicationStatus: vi.fn(),
    upsertSalespersonProfile: vi.fn(),
    getSalespersonProfile: vi.fn(),
    listSalespersonProfilesByInfluencer: vi.fn(),
    upsertInfluencerProfile: vi.fn(),
    getInfluencerProfile: vi.fn(),
    upsertEnrollment: vi.fn(),
    getEnrollmentByBusiness: vi.fn(),
    listEnrollmentsBySalesperson: vi.fn(),
    listEnrollmentsByInfluencer: vi.fn(),
    updateEnrollmentStatus: vi.fn(),
  }
}

function createMockSyncEngine(): SyncEngine {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn(),
    push: vi.fn(),
  } as unknown as SyncEngine
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CommissionService.calculateSplit', () => {
  const svc = new CommissionService(
    createMockRepo() as PartnerRepository,
    createMockSyncEngine(),
    'biz-1' as any,
    'dev-1' as any,
  )

  it('returns correct split at amount=0 (below base)', () => {
    const split = svc.calculateSplit(0 as any)
    expect(split.companyShare).toBe(500)
    expect(split.salespersonShare).toBe(100)
    expect(split.influencerFlat).toBe(50)
    expect(split.total).toBe(0)
  })

  it('returns correct split at amount=600 (at base)', () => {
    const split = svc.calculateSplit(600 as any)
    expect(split.companyShare).toBe(500)
    expect(split.salespersonShare).toBe(100)
    expect(split.influencerFlat).toBe(50)
    expect(split.total).toBe(600)
  })

  it('returns correct split at amount=1000', () => {
    // excess = 1000-600 = 400
    // company: 500 + 25%*400 = 500+100 = 600
    // salesperson: 100 + 75%*400 = 100+300 = 400
    const split = svc.calculateSplit(1000 as any)
    expect(split.companyShare).toBe(600)
    expect(split.salespersonShare).toBe(400)
    expect(split.influencerFlat).toBe(50)
    expect(split.total).toBe(1000)
  })

  it('returns correct split at amount=2000', () => {
    // excess = 2000-600 = 1400
    // company: 500 + 25%*1400 = 500+350 = 850
    // salesperson: 100 + 75%*1400 = 100+1050 = 1150
    const split = svc.calculateSplit(2000 as any)
    expect(split.companyShare).toBe(850)
    expect(split.salespersonShare).toBe(1150)
    expect(split.influencerFlat).toBe(50)
    expect(split.total).toBe(2000)
  })

  it('handles exact base amount without floating point drift', () => {
    const split = svc.calculateSplit(600 as any)
    // company + salesperson = 600 (the payment), influencer is paid BY company separately
    expect(split.companyShare + split.salespersonShare).toBe(600)
    expect(split.total).toBe(600)
  })

  it('influencer flat is always KSh 50 regardless of amount', () => {
    ;[0, 100, 600, 1000, 5000, 10000].forEach(amount => {
      const split = svc.calculateSplit(amount as any)
      expect(split.influencerFlat).toBe(50)
    })
  })
})

describe('CommissionService.buildIdempotencyKey', () => {
  const svc = new CommissionService(
    createMockRepo() as PartnerRepository,
    createMockSyncEngine(),
    'biz-1' as any,
    'dev-1' as any,
  )

  it('formats key as commission:{salespersonId}:{subscriptionId}:{role}', () => {
    const key = svc.buildIdempotencyKey('sp-1' as any, 'sub-abc', 'salesperson')
    expect(key).toBe('commission:sp-1:sub-abc:salesperson')
  })

  it('produces different keys for different roles', () => {
    const spKey = svc.buildIdempotencyKey('sp-1' as any, 'sub-abc', 'salesperson')
    const infKey = svc.buildIdempotencyKey('sp-1' as any, 'sub-abc', 'influencer')
    expect(spKey).not.toBe(infKey)
  })
})

describe('CommissionService.recordSalespersonCommission idempotency', () => {
  it('returns existing earning when idempotency key already exists', async () => {
    const repo = createMockRepo()
    const syncEngine = createMockSyncEngine()

    const existingEarning = {
      id: 'existing-earning',
      salespersonProfileId: 'sp-1' as any,
      influencerProfileId: 'inf-1' as any,
      businessId: 'biz-1' as any,
      subscriptionId: 'sub-1',
      amount: 400 as any,
      role: 'salesperson' as const,
      recipientType: 'salesperson' as const,
      idempotencyKey: 'commission:sp-1:sub-1:salesperson',
      createdAt: '2026-01-01T00:00:00Z',
    }

    repo.getCommissionEarningByKey.mockResolvedValue(existingEarning)

    const svc = new CommissionService(repo as PartnerRepository, syncEngine, 'biz-1' as any, 'dev-1' as any)

    const result = await svc.recordSalespersonCommission(
      { businessId: 'biz-1' as any, subscriptionId: 'sub-1', subscriptionAmount: 1000 as any },
      'sp-1' as any,
      'inf-1' as any,
    )

    expect(result.id).toBe('existing-earning')
    expect(repo.upsertCommissionEarning).not.toHaveBeenCalled()
  })

  it('creates new earning when idempotency key does not exist', async () => {
    const repo = createMockRepo()
    const syncEngine = createMockSyncEngine()

    repo.getCommissionEarningByKey.mockResolvedValue(null)
    repo.upsertCommissionEarning.mockImplementation(async (e) => ({ created: true, earning: e }))

    const svc = new CommissionService(repo as PartnerRepository, syncEngine, 'biz-1' as any, 'dev-1' as any)

    const result = await svc.recordSalespersonCommission(
      { businessId: 'biz-1' as any, subscriptionId: 'sub-1', subscriptionAmount: 1000 as any },
      'sp-1' as any,
      null,
    )

    expect(result.idempotencyKey).toBe('commission:sp-1:sub-1:salesperson')
    expect(result.role).toBe('salesperson')
    expect(repo.upsertCommissionEarning).toHaveBeenCalledTimes(1)
    expect(syncEngine.enqueue).toHaveBeenCalledTimes(1)
  })
})

describe('CommissionService.recordInfluencerCommission idempotency', () => {
  it('returns existing earning when idempotency key already exists', async () => {
    const repo = createMockRepo()
    const syncEngine = createMockSyncEngine()

    const existingEarning = {
      id: 'existing-inf-earning',
      salespersonProfileId: 'sp-1' as any,
      influencerProfileId: 'inf-1' as any,
      businessId: 'biz-1' as any,
      subscriptionId: 'sub-1',
      amount: 50 as any,
      role: 'influencer' as const,
      recipientType: 'influencer' as const,
      idempotencyKey: 'commission:sp-1:sub-1:influencer',
      createdAt: '2026-01-01T00:00:00Z',
    }

    repo.getCommissionEarningByKey.mockResolvedValue(existingEarning)
    repo.listEnrollmentsByInfluencer.mockResolvedValue([{
      id: 'enr-1', businessId: 'biz-1' as any, salespersonProfileId: 'sp-1' as any,
      influencerProfileId: 'inf-1' as any, status: 'qualified' as const,
      qualifiedAt: '2026-09-01T00:00:00Z', enrolledAt: '2026-09-01T00:00:00Z',
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', version: 1,
    }])
    repo.listEarningsByInfluencer.mockResolvedValue([])

    const svc = new CommissionService(repo as PartnerRepository, syncEngine, 'biz-1' as any, 'dev-1' as any)

    const result = await svc.recordInfluencerCommission(
      { businessId: 'biz-1' as any, subscriptionId: 'sub-1', subscriptionAmount: 1000 as any },
      'sp-1' as any,
      'inf-1' as any,
    )

    expect(result.id).toBe('existing-inf-earning')
    expect(repo.upsertCommissionEarning).not.toHaveBeenCalled()
  })

  it('influencer earns exactly KSh 50 flat regardless of payment amount', async () => {
    const repo = createMockRepo()
    const syncEngine = createMockSyncEngine()

    repo.getCommissionEarningByKey.mockResolvedValue(null)
    repo.upsertCommissionEarning.mockImplementation(async (e) => ({ created: true, earning: e }))
    repo.listEnrollmentsByInfluencer.mockResolvedValue([{
      id: 'enr-1', businessId: 'biz-1' as any, salespersonProfileId: 'sp-1' as any,
      influencerProfileId: 'inf-1' as any, status: 'qualified' as const,
      qualifiedAt: '2026-09-01T00:00:00Z', enrolledAt: '2026-09-01T00:00:00Z',
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', version: 1,
    }])
    repo.listEarningsByInfluencer.mockResolvedValue([])

    const svc = new CommissionService(repo as PartnerRepository, syncEngine, 'biz-1' as any, 'dev-1' as any)

    const result = await svc.recordInfluencerCommission(
      { businessId: 'biz-1' as any, subscriptionId: 'sub-1', subscriptionAmount: 10000 as any },
      'sp-1' as any,
      'inf-1' as any,
    )

    expect(result.amount).toBe(50)
    expect(result.role).toBe('influencer')
  })

  it('returns ineligible when influencer is outside 24-month window', async () => {
    const repo = createMockRepo()
    const syncEngine = createMockSyncEngine()

    // Shop qualified Sep 10 2026 → window ends Sep 9 2028
    // Query at Sep 10 2028 → past the window end
    repo.listEnrollmentsByInfluencer.mockResolvedValue([
      {
        id: 'enr-1',
        businessId: 'shop-A' as any,
        salespersonProfileId: 'sp-1' as any,
        influencerProfileId: 'inf-1' as any,
        status: 'qualified',
        qualifiedAt: '2026-09-10T00:00:00Z',
        enrolledAt: '2026-09-01T00:00:00Z',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
        version: 1,
      },
    ])
    repo.listEarningsByInfluencer.mockResolvedValue([])

    const svc = new CommissionService(repo as PartnerRepository, syncEngine, 'biz-1' as any, 'dev-1' as any)

    const eligible = await svc.isCommissionEligible('inf-1' as any, 'shop-A' as any, new Date('2028-09-10'))
    expect(eligible).toBe(false)
  })
})

describe('CommissionService.isCommissionEligible', () => {
  function makeRepo(overrides = {}) {
    const repo = createMockRepo()
    return repo
  }

  function enrollment(qualifiedAt: string, shopId = 'shop-A') {
    return {
      id: 'enr-1',
      businessId: shopId as any,
      salespersonProfileId: 'sp-1' as any,
      influencerProfileId: 'inf-1' as any,
      status: 'qualified',
      qualifiedAt,
      enrolledAt: qualifiedAt,
      createdAt: qualifiedAt,
      updatedAt: qualifiedAt,
      version: 1,
    }
  }

  function earnings(createdAts: string[], shopId = 'shop-A') {
    return createdAts.map((createdAt, i) => ({
      id: `e-${i}`,
      salespersonProfileId: 'sp-1' as any,
      influencerProfileId: 'inf-1' as any,
      businessId: shopId as any,
      subscriptionId: `sub-${i}`,
      amount: 50 as any,
      role: 'influencer' as const,
      recipientType: 'influencer' as const,
      idempotencyKey: `commission:sp-1:sub-${i}:influencer`,
      createdAt,
    }))
  }

  // Shop qualifies Sep 10 2026, query Sep 9 2028 → eligible
  it('eligible one day before window end', async () => {
    const repo = makeRepo()
    repo.listEnrollmentsByInfluencer.mockResolvedValue([enrollment('2026-09-10T00:00:00Z')])
    repo.listEarningsByInfluencer.mockResolvedValue(earnings(['2026-10-01T00:00:00Z']))

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)
    const result = await svc.isCommissionEligible('inf-1' as any, 'shop-A' as any, new Date('2028-09-09'))
    expect(result).toBe(true)
  })

  // Shop qualifies Sep 10 2026, query Sep 10 2028 → NOT eligible
  it('NOT eligible at exact window end date', async () => {
    const repo = makeRepo()
    repo.listEnrollmentsByInfluencer.mockResolvedValue([enrollment('2026-09-10T00:00:00Z')])
    repo.listEarningsByInfluencer.mockResolvedValue(earnings(['2026-10-01T00:00:00Z']))

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)
    const result = await svc.isCommissionEligible('inf-1' as any, 'shop-A' as any, new Date('2028-09-10'))
    expect(result).toBe(false)
  })

  // Shop qualifies Sep 10 2026, query Mar 10 2027 (month 6) → eligible, monthsEarned=6
  it('eligible at month 6, reports monthsEarned correctly', async () => {
    const repo = makeRepo()
    repo.listEnrollmentsByInfluencer.mockResolvedValue([enrollment('2026-09-10T00:00:00Z')])
    // 6 months of earnings (Oct 2026 through Mar 2027)
    repo.listEarningsByInfluencer.mockResolvedValue(
      earnings(['2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z',
                '2027-01-01T00:00:00Z', '2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z']),
    )

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)
    const period = await svc.getCommissionPeriod('inf-1' as any, 'shop-A' as any)
    expect(period?.isEligible).toBe(true)
    expect(period?.monthsEarned).toBe(6)
  })

  // Shop qualifies Sep 10 2026, query Sep 10 2027 (month 12) → eligible, monthsEarned=12
  it('eligible at month 12, reports monthsEarned=12', async () => {
    const repo = makeRepo()
    repo.listEnrollmentsByInfluencer.mockResolvedValue([enrollment('2026-09-10T00:00:00Z')])
    const twelveMonths = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(2026, 9 + i, 1) // Oct 2026 → Sep 2027
      return d.toISOString()
    })
    repo.listEarningsByInfluencer.mockResolvedValue(earnings(twelveMonths))

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)
    const period = await svc.getCommissionPeriod('inf-1' as any, 'shop-A' as any)
    expect(period?.isEligible).toBe(true)
    expect(period?.monthsEarned).toBe(12)
  })

  // Shop qualifies Sep 10 2026, query Sep 10 2028 (month 24) → NOT eligible
  it('NOT eligible at month 24', async () => {
    const repo = makeRepo()
    repo.listEnrollmentsByInfluencer.mockResolvedValue([enrollment('2026-09-10T00:00:00Z')])
    const twentyFour = Array.from({ length: 24 }, (_, i) => {
      const d = new Date(2026, 9 + i, 1)
      return d.toISOString()
    })
    repo.listEarningsByInfluencer.mockResolvedValue(earnings(twentyFour))

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)
    const result = await svc.isCommissionEligible('inf-1' as any, 'shop-A' as any, new Date('2028-09-10'))
    expect(result).toBe(false)
  })

  // Shop A and Shop B qualify independently (different windows)
  it('two shops with different windows are independent', async () => {
    const repo = makeRepo()
    // Shop A qualified Sep 10 2026, Shop B qualified Jan 15 2027
    repo.listEnrollmentsByInfluencer.mockResolvedValue([
      enrollment('2026-09-10T00:00:00Z', 'shop-A'),
      enrollment('2027-01-15T00:00:00Z', 'shop-B'),
    ])
    repo.listEarningsByInfluencer.mockResolvedValue([
      ...earnings(['2026-10-01T00:00:00Z'], 'shop-A'),
    ])

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)

    // Shop A: past window end (Sep 2028), Shop B: still eligible
    const shopAEligible = await svc.isCommissionEligible('inf-1' as any, 'shop-A' as any, new Date('2028-09-11'))
    const shopBEligible = await svc.isCommissionEligible('inf-1' as any, 'shop-B' as any, new Date('2028-09-11'))
    expect(shopAEligible).toBe(false)
    expect(shopBEligible).toBe(true)
  })

  // Influencer with 2 shops: one eligible, one not
  it('one eligible shop does not make the other eligible', async () => {
    const repo = makeRepo()
    repo.listEnrollmentsByInfluencer.mockResolvedValue([
      enrollment('2026-09-10T00:00:00Z', 'shop-A'),
      enrollment('2027-01-15T00:00:00Z', 'shop-B'),
    ])
    repo.listEarningsByInfluencer.mockResolvedValue([
      ...earnings(['2026-10-01T00:00:00Z'], 'shop-A'),
      ...earnings(['2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z'], 'shop-B'),
    ])

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)

    const shopAEligible = await svc.isCommissionEligible('inf-1' as any, 'shop-A' as any, new Date('2027-03-15'))
    const shopBEligible = await svc.isCommissionEligible('inf-1' as any, 'shop-B' as any, new Date('2027-03-15'))
    expect(shopAEligible).toBe(true)  // within window
    expect(shopBEligible).toBe(true)  // within window
  })

  // No enrollment found → NOT eligible
  it('NOT eligible when no enrollment found', async () => {
    const repo = makeRepo()
    repo.listEnrollmentsByInfluencer.mockResolvedValue([])

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)
    const result = await svc.isCommissionEligible('inf-1' as any, 'shop-A' as any)
    expect(result).toBe(false)
  })

  // Query at exact window start (eligible)
  it('eligible at exact window start date', async () => {
    const repo = makeRepo()
    repo.listEnrollmentsByInfluencer.mockResolvedValue([enrollment('2026-09-10T00:00:00Z')])
    repo.listEarningsByInfluencer.mockResolvedValue([])

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)
    const result = await svc.isCommissionEligible('inf-1' as any, 'shop-A' as any, new Date('2026-09-10'))
    expect(result).toBe(true)
  })

  // Query 1 day before window end (eligible)
  it('eligible one day before window end', async () => {
    const repo = makeRepo()
    repo.listEnrollmentsByInfluencer.mockResolvedValue([enrollment('2026-09-10T00:00:00Z')])
    repo.listEarningsByInfluencer.mockResolvedValue(earnings(['2026-10-01T00:00:00Z']))

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)
    const result = await svc.isCommissionEligible('inf-1' as any, 'shop-A' as any, new Date('2028-09-09'))
    expect(result).toBe(true)
  })

  // Requalification after lapse but still in window
  it('resumes earning after lapse when still inside original window', async () => {
    const repo = makeRepo()
    // Shop qualified Sep 10 2026; earnings Oct 2026, then gap, then resumed Jan 2028
    // Window end is Sep 9 2028
    repo.listEnrollmentsByInfluencer.mockResolvedValue([enrollment('2026-09-10T00:00:00Z')])
    repo.listEarningsByInfluencer.mockResolvedValue(earnings([
      '2026-10-01T00:00:00Z',
      '2026-11-01T00:00:00Z',
      // gap through Dec 2027
      '2028-01-01T00:00:00Z',
      '2028-02-01T00:00:00Z',
    ]))

    const svc = new CommissionService(repo as PartnerRepository, createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)

    // Still within window (Jan 2028 < Sep 2028), only 4 months earned
    const result = await svc.isCommissionEligible('inf-1' as any, 'shop-A' as any, new Date('2028-02-15'))
    expect(result).toBe(true)

    const period = await svc.getCommissionPeriod('inf-1' as any, 'shop-A' as any)
    expect(period?.monthsEarned).toBe(4) // Oct, Nov 2026 + Jan, Feb 2028
    expect(period?.isEligible).toBe(true)
  })
})

describe('CommissionService.recordCompanyCommission', () => {
  it('creates new earning with correct recipientType=company', async () => {
    const repo = createMockRepo()
    const syncEngine = createMockSyncEngine()

    repo.getCommissionEarningByKey.mockResolvedValue(null)
    repo.upsertCommissionEarning.mockImplementation(async (e) => ({ created: true, earning: e }))

    const svc = new CommissionService(repo as PartnerRepository, syncEngine, 'biz-1' as any, 'dev-1' as any)

    const result = await svc.recordCompanyCommission(
      { businessId: 'biz-1' as any, subscriptionId: 'sub-1', subscriptionAmount: 1000 as any },
      'sp-1' as any,
    )

    expect(result.role).toBe('company')
    expect(result.recipientType).toBe('company')
    expect(result.idempotencyKey).toBe('commission:sp-1:sub-1:company')
    expect(repo.upsertCommissionEarning).toHaveBeenCalledTimes(1)
  })

  it('returns existing earning when idempotency key already exists', async () => {
    const repo = createMockRepo()
    const syncEngine = createMockSyncEngine()

    const existingEarning = {
      id: 'existing-company-earning',
      salespersonProfileId: 'sp-1' as any,
      influencerProfileId: null,
      businessId: 'biz-1' as any,
      subscriptionId: 'sub-1',
      amount: 600 as any,
      role: 'company' as const,
      recipientType: 'company' as const,
      idempotencyKey: 'commission:sp-1:sub-1:company',
      createdAt: '2026-01-01T00:00:00Z',
    }

    repo.getCommissionEarningByKey.mockResolvedValue(existingEarning)

    const svc = new CommissionService(repo as PartnerRepository, syncEngine, 'biz-1' as any, 'dev-1' as any)

    const result = await svc.recordCompanyCommission(
      { businessId: 'biz-1' as any, subscriptionId: 'sub-1', subscriptionAmount: 1000 as any },
      'sp-1' as any,
    )

    expect(result.id).toBe('existing-company-earning')
    expect(repo.upsertCommissionEarning).not.toHaveBeenCalled()
  })
})
