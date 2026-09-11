/**
 * CommissionService tests.
 */

import { describe, it, expect, vi } from 'vitest'
import { CommissionService } from '../src/CommissionService.js'
import type { PackageRepository } from '../src/PackageRepository.js'
import type { Package } from '@soostori/contracts'
import type { CommissionSummary } from '../src/types.js'

const mockPackage = (overrides: Partial<Package> = {}): Package =>
  ({
    id: 'pkg-1',
    businessId: 'biz-1',
    name: 'Pro Package',
    amount: 1200,
    salespersonId: 'sp-1',
    influencerId: null,
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  } as Package)

const createRepo = (packages: Package[], businesses: Map<string, { id: string; name: string }>): PackageRepository => ({
  findBySalespersonId: vi.fn().mockResolvedValue(packages),
  getBusinessForPackage: vi.fn().mockImplementation((pkgId: string) => Promise.resolve(businesses.get(pkgId) ?? null)),
  getCommissionLedger: vi.fn().mockResolvedValue([]),
  upsertPackage: vi.fn().mockImplementation((input) => Promise.resolve(mockPackage({ ...input } as Package))),
} as unknown as PackageRepository)

describe('CommissionService', () => {
  it('returns empty summary when no packages', async () => {
    const repo = createRepo([], new Map())
    const svc = new CommissionService(repo)
    const result = await svc.getCommissionSummary('sp-1')
    expect(result.enrolledBusinesses).toHaveLength(0)
    expect(result.totalSalespersonCommission).toBe(0)
    expect(result.totalCompanyCommission).toBe(0)
  })

  it('calculates commission split correctly for a single active package', async () => {
    const pkg = mockPackage({ id: 'pkg-1', businessId: 'biz-1', amount: 1200, isActive: true })
    const businesses = new Map([['pkg-1', { id: 'biz-1', name: 'Acme Shop' }]])
    const repo = createRepo([pkg], businesses)
    const svc = new CommissionService(repo)
    const result = await svc.getCommissionSummary('sp-1')

    expect(result.enrolledBusinesses).toHaveLength(1)
    expect(result.enrolledBusinesses[0].businessName).toBe('Acme Shop')
    expect(result.enrolledBusinesses[0].packageAmount).toBe(1200)
    // companyShare = 500 + 0.25 * (1200 - 600) = 500 + 150 = 650
    expect(result.enrolledBusinesses[0].companyShare).toBe(650)
    // salespersonShare = 100 + 0.75 * (1200 - 600) = 100 + 450 = 550
    expect(result.enrolledBusinesses[0].salespersonShare).toBe(550)
    expect(result.enrolledBusinesses[0].influencerShare).toBe(50)
    expect(result.totalSalespersonCommission).toBe(550)
    expect(result.totalCompanyCommission).toBe(650)
  })

  it('aggregates multiple packages', async () => {
    const pkgs = [
      mockPackage({ id: 'pkg-1', amount: 600, isActive: true }),
      mockPackage({ id: 'pkg-2', amount: 1200, isActive: true }),
    ]
    const businesses = new Map([
      ['pkg-1', { id: 'biz-1', name: 'Shop A' }],
      ['pkg-2', { id: 'biz-2', name: 'Shop B' }],
    ])
    const repo = createRepo(pkgs, businesses)
    const svc = new CommissionService(repo)
    const result = await svc.getCommissionSummary('sp-1')

    expect(result.enrolledBusinesses).toHaveLength(2)
    expect(result.totalSalespersonCommission).toBe(100 + 550) // 650
    expect(result.totalCompanyCommission).toBe(500 + 650) // 1150
  })

  it('filters out inactive packages', async () => {
    const pkgs = [
      mockPackage({ id: 'pkg-1', amount: 1200, isActive: true }),
      mockPackage({ id: 'pkg-2', amount: 600, isActive: false }),
    ]
    const businesses = new Map([
      ['pkg-1', { id: 'biz-1', name: 'Active Shop' }],
      ['pkg-2', { id: 'biz-2', name: 'Inactive Shop' }],
    ])
    const repo = createRepo(pkgs, businesses)
    const svc = new CommissionService(repo)
    const result = await svc.getCommissionSummary('sp-1')

    expect(result.enrolledBusinesses).toHaveLength(1)
    expect(result.enrolledBusinesses[0].businessName).toBe('Active Shop')
  })

  it('uses Unknown for missing business name', async () => {
    const pkg = mockPackage({ id: 'pkg-1', businessId: 'biz-1', amount: 1200 })
    const businesses = new Map() // no entry for pkg-1
    const repo = createRepo([pkg], businesses)
    const svc = new CommissionService(repo)
    const result = await svc.getCommissionSummary('sp-1')

    expect(result.enrolledBusinesses[0].businessName).toBe('Unknown')
  })
})
