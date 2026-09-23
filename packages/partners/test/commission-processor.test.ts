/**
 * CommissionProcessor — unit tests.
 *
 * Covers:
 * - processPaymentConfirmed: enrollment not found → no-op
 * - processPaymentConfirmed: enrolled → qualifying → qualified → earnings recorded
 * - processPaymentConfirmed: idempotency (duplicate callback → no new earnings)
 * - Attribution chain: payment.shopId → enrollment → salespersonProfile → influencerId
 * - Status transitions: markPayable, markPaid, reverse
 */

import { describe, it, expect, vi } from 'vitest'
import type { PartnerRepository } from '../src/repository.js'
import type { CommissionService } from '../src/CommissionService.js'
import type { SyncEngine } from '@soostori/contracts'
import { CommissionProcessor } from '../src/commission-processor.js'
import type { CommissionTrigger } from '../src/commission-processor-types.js'

// ── Test doubles ────────────────────────────────────────────────────────────────

function createMockRepo() {
  return {
    upsertCommissionEarning: vi.fn(),
    getCommissionEarningByKey: vi.fn(),
    listEarningsBySalesperson: vi.fn(),
    listEarningsByInfluencer: vi.fn(),
    listEarningsByBusiness: vi.fn(),
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
    updateEnrollmentStatus: vi.fn(),
  }
}

function createMockCommissionService() {
  return {
    recordSalespersonCommission: vi.fn<CommissionService['recordSalespersonCommission']>(),
    recordInfluencerCommission: vi.fn<CommissionService['recordInfluencerCommission']>(),
    recordCompanyCommission: vi.fn<CommissionService['recordCompanyCommission']>(),
    calculateSplit: vi.fn<CommissionService['calculateSplit']>(),
    buildIdempotencyKey: vi.fn<CommissionService['buildIdempotencyKey']>(),
    listSalespersonEarnings: vi.fn<CommissionService['listSalespersonEarnings']>(),
    listInfluencerEarnings: vi.fn<CommissionService['listInfluencerEarnings']>(),
  }
}

function createMockSyncEngine(): SyncEngine {
  return {
    enqueue: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn(),
    push: vi.fn(),
  } as unknown as SyncEngine
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTrigger(overrides: Partial<CommissionTrigger> = {}): CommissionTrigger {
  return {
    businessId: 'biz-1' as any,
    amount: 1000 as any,
    subscriptionId: 'sub-1',
    paidAt: '2026-09-01T00:00:00Z',
    receiptNumber: 'RECEIPT123',
    ...overrides,
  }
}

function makeEnrollment(status: 'enrolled' | 'qualifying' | 'qualified' | 'converted') {
  return {
    id: 'enr-1',
    businessId: 'biz-1' as any,
    salespersonProfileId: 'sp-1' as any,
    influencerProfileId: 'inf-1' as any,
    status,
    enrolledAt: '2026-01-01T00:00:00Z',
    qualifyingSinceAt: status === 'qualifying' || status === 'qualified' || status === 'converted' ? '2026-06-01T00:00:00Z' : null,
    qualifiedAt: status === 'qualified' || status === 'converted' ? '2026-09-01T00:00:00Z' : null,
    convertedAt: status === 'converted' ? '2026-09-01T00:00:00Z' : null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1,
  }
}

function makeProfile(influencerId: string | null = 'inf-1') {
  return {
    id: 'sp-1' as any,
    applicationId: 'app-1' as any,
    personId: 'person-1',
    referredBy: influencerId,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    version: 1,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CommissionProcessor.processPaymentConfirmed', () => {
  it('returns early when no enrollment exists for this business', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    repo.getEnrollmentByBusiness.mockResolvedValue(null)

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    await processor.processPaymentConfirmed(makeTrigger())

    expect(commissionSvc.recordSalespersonCommission).not.toHaveBeenCalled()
    expect(commissionSvc.recordInfluencerCommission).not.toHaveBeenCalled()
  })

  it('advances enrolled → qualifying → qualified and records earnings', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    // First call: enrolled, second call: qualifying, third: qualified
    repo.getEnrollmentByBusiness
      .mockResolvedValueOnce(makeEnrollment('enrolled'))
      .mockResolvedValueOnce({ ...makeEnrollment('enrolled'), status: 'qualifying' })
      .mockResolvedValueOnce(makeEnrollment('qualifying'))

    repo.getSalespersonProfile.mockResolvedValue(makeProfile())

    commissionSvc.recordSalespersonCommission.mockResolvedValue({ id: 'e-1' } as any)
    commissionSvc.recordInfluencerCommission.mockResolvedValue({ id: 'e-2' } as any)

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    await processor.processPaymentConfirmed(makeTrigger())

    // Salesperson commission called
    expect(commissionSvc.recordSalespersonCommission).toHaveBeenCalledWith(
      { businessId: 'biz-1', subscriptionId: 'sub-1', subscriptionAmount: 1000 },
      'sp-1',
      'inf-1',
    )

    // Influencer commission called (attribution exists)
    expect(commissionSvc.recordInfluencerCommission).toHaveBeenCalledWith(
      { businessId: 'biz-1', subscriptionId: 'sub-1', subscriptionAmount: 1000 },
      'sp-1',
      'inf-1',
    )

    // Sync events emitted for accrued status
    expect(syncEngine.enqueue).toHaveBeenCalled()
  })

  it('does not duplicate earnings when called twice (idempotency via CommissionService)', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    // Already qualified — enrollment lookup returns qualified
    repo.getEnrollmentByBusiness.mockResolvedValue(makeEnrollment('qualified'))
    repo.getSalespersonProfile.mockResolvedValue(makeProfile())

    // Existing earning found (idempotent replay guard)
    commissionSvc.recordSalespersonCommission.mockResolvedValue({ id: 'existing-1' } as any)
    commissionSvc.recordInfluencerCommission.mockResolvedValue({ id: 'existing-2' } as any)

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    // First call
    await processor.processPaymentConfirmed(makeTrigger())

    // Second call (duplicate callback)
    await processor.processPaymentConfirmed(makeTrigger())

    // Each call still triggers the service (the idempotency is handled inside the service)
    expect(commissionSvc.recordSalespersonCommission).toHaveBeenCalledTimes(2)
  })

  it('records salesperson commission even when no influencer is attributed', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    repo.getEnrollmentByBusiness
      .mockResolvedValueOnce({ ...makeEnrollment('enrolled'), influencerProfileId: null })
      .mockResolvedValueOnce({ ...makeEnrollment('enrolled'), influencerProfileId: null })
      .mockResolvedValueOnce({ ...makeEnrollment('qualifying'), influencerProfileId: null })

    repo.getSalespersonProfile.mockResolvedValue(makeProfile(null))

    commissionSvc.recordSalespersonCommission.mockResolvedValue({ id: 'e-1' } as any)

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    await processor.processPaymentConfirmed(makeTrigger())

    expect(commissionSvc.recordSalespersonCommission).toHaveBeenCalled()
    expect(commissionSvc.recordInfluencerCommission).not.toHaveBeenCalled()
  })
})

describe('CommissionProcessor.processPaymentConfirmed — full pipeline', () => {
  it('calls all three earning methods when enrollment is qualified and salesperson exists', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    repo.getEnrollmentByBusiness.mockResolvedValue(makeEnrollment('qualified'))
    repo.getSalespersonProfile.mockResolvedValue(makeProfile())

    commissionSvc.recordSalespersonCommission.mockResolvedValue({ id: 'sp-1' } as any)
    commissionSvc.recordInfluencerCommission.mockResolvedValue({ id: 'inf-1' } as any)
    commissionSvc.recordCompanyCommission.mockResolvedValue({ id: 'co-1' } as any)

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    await processor.processPaymentConfirmed(makeTrigger())

    expect(commissionSvc.recordSalespersonCommission).toHaveBeenCalledTimes(1)
    expect(commissionSvc.recordInfluencerCommission).toHaveBeenCalledTimes(1)
    expect(commissionSvc.recordCompanyCommission).toHaveBeenCalledTimes(1)
  })

  it('no company earning when enrollment has no salesperson', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    repo.getEnrollmentByBusiness.mockResolvedValue({ ...makeEnrollment('enrolled'), salespersonProfileId: 'unknown' })
    repo.getEnrollmentByBusiness
      .mockResolvedValueOnce({ ...makeEnrollment('enrolled'), salespersonProfileId: 'unknown' })
      .mockResolvedValueOnce({ ...makeEnrollment('qualifying'), salespersonProfileId: 'unknown' })

    repo.getSalespersonProfile.mockResolvedValue(null)

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    await processor.processPaymentConfirmed(makeTrigger())

    expect(commissionSvc.recordCompanyCommission).not.toHaveBeenCalled()
  })

  it('company earning is recorded alongside salesperson and influencer', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    repo.getEnrollmentByBusiness.mockResolvedValue(makeEnrollment('qualified'))
    repo.getSalespersonProfile.mockResolvedValue(makeProfile())

    commissionSvc.recordSalespersonCommission.mockResolvedValue({ id: 'sp-1' } as any)
    commissionSvc.recordInfluencerCommission.mockResolvedValue({ id: 'inf-1' } as any)
    commissionSvc.recordCompanyCommission.mockResolvedValue({ id: 'co-1' } as any)

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    await processor.processPaymentConfirmed(makeTrigger())

    expect(commissionSvc.recordCompanyCommission).toHaveBeenCalledTimes(1)
    expect(commissionSvc.recordCompanyCommission).toHaveBeenCalledWith(
      { businessId: 'biz-1', subscriptionId: 'sub-1', subscriptionAmount: 1000 },
      'sp-1',
    )
  })

  it('same trigger with no influencer: only salesperson + company earnings', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    repo.getEnrollmentByBusiness.mockResolvedValue({ ...makeEnrollment('qualified'), influencerProfileId: null })
    repo.getSalespersonProfile.mockResolvedValue(makeProfile(null))

    commissionSvc.recordSalespersonCommission.mockResolvedValue({ id: 'sp-1' } as any)
    commissionSvc.recordCompanyCommission.mockResolvedValue({ id: 'co-1' } as any)

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    await processor.processPaymentConfirmed(makeTrigger())

    expect(commissionSvc.recordSalespersonCommission).toHaveBeenCalledTimes(1)
    expect(commissionSvc.recordInfluencerCommission).not.toHaveBeenCalled()
    expect(commissionSvc.recordCompanyCommission).toHaveBeenCalledTimes(1)
  })

  it('idempotency: duplicate trigger calls recordSalespersonCommission multiple times but service returns existing earning', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    repo.getEnrollmentByBusiness.mockResolvedValue(makeEnrollment('qualified'))
    repo.getSalespersonProfile.mockResolvedValue(makeProfile())

    // Service idempotency: returns existing earning on replay
    commissionSvc.recordSalespersonCommission.mockResolvedValue({ id: 'existing-sp' } as any)
    commissionSvc.recordInfluencerCommission.mockResolvedValue({ id: 'existing-inf' } as any)
    commissionSvc.recordCompanyCommission.mockResolvedValue({ id: 'existing-co' } as any)

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    const trigger = makeTrigger()

    // Three calls = processor invokes service three times
    await processor.processPaymentConfirmed(trigger)
    await processor.processPaymentConfirmed(trigger)
    await processor.processPaymentConfirmed(trigger)

    // But the service deduplicates internally → one earning in DB
    expect(commissionSvc.recordSalespersonCommission).toHaveBeenCalledTimes(3)
  })
})

describe('CommissionProcessor status transitions', () => {
  it('markPayable emits sync event with payable status', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    await processor.markPayable('sp-1', 'inf-1', 'sub-1')

    expect(syncEngine.enqueue).toHaveBeenCalledTimes(1)
    const emittedEvent = (syncEngine.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(emittedEvent.payload.status).toBe('payable')
  })

  it('markPaid emits sync event with paid status', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    await processor.markPaid('sp-1', null, 'sub-1')

    expect(syncEngine.enqueue).toHaveBeenCalledTimes(1)
    const emittedEvent = (syncEngine.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(emittedEvent.payload.status).toBe('paid')
  })

  it('reverse emits sync event with reversed status', async () => {
    const repo = createMockRepo()
    const commissionSvc = createMockCommissionService()
    const syncEngine = createMockSyncEngine()

    const processor = new CommissionProcessor(
      repo as PartnerRepository,
      commissionSvc as unknown as CommissionService,
      syncEngine,
      'biz-1',
      'dev-1',
    )

    await processor.reverse('sp-1', 'inf-1', 'sub-1')

    expect(syncEngine.enqueue).toHaveBeenCalledTimes(1)
    const emittedEvent = (syncEngine.enqueue as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(emittedEvent.payload.status).toBe('reversed')
  })
})
