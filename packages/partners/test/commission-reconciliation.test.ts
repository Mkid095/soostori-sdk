/**
 * Commission reconciliation — verifies canonical formula at key amounts.
 *
 * Canonical rules:
 *   Company:      500 + 25% × max(0, amount − 600)
 *   Salesperson:  100 + 75% × max(0, amount − 600)
 *   Influencer:   50 flat (paid BY company separately)
 *
 * Reconcile test: company + salesperson = amount (influencer is extra)
 *
 * Run: pnpm vitest run packages/partners/test/commission-reconciliation.test.ts
 */

import { describe, it, expect } from 'vitest'
import { CommissionService } from '../src/CommissionService.js'
import type { PartnerRepository } from '../src/repository.js'
import type { SyncEngine } from '@soostori/contracts'

function createMockRepo() {
  return {
    upsertCommissionEarning: async () => { throw new Error('not called') },
    getCommissionEarningByKey: async () => null,
    listEarningsBySalesperson: async () => [],
    listEarningsByInfluencer: async () => [],
    listEarningsByBusiness: async () => [],
    upsertApplication: async () => {},
    getApplication: async () => null,
    getApplicationByApplicant: async () => null,
    listApplicationsByStatus: async () => [],
    updateApplicationStatus: async () => {},
    upsertSalespersonProfile: async () => {},
    getSalespersonProfile: async () => null,
    listSalespersonProfilesByInfluencer: async () => [],
    upsertInfluencerProfile: async () => {},
    getInfluencerProfile: async () => null,
    upsertEnrollment: async () => {},
    getEnrollmentByBusiness: async () => null,
    listEnrollmentsBySalesperson: async () => [],
    listEnrollmentsByInfluencer: async () => [],
    updateEnrollmentStatus: async () => {},
  } as unknown as PartnerRepository
}

function createMockSyncEngine(): SyncEngine {
  return {
    enqueue: async () => {},
    pull: async () => [],
    push: async () => {},
  } as unknown as SyncEngine
}

function svc() {
  return new CommissionService(createMockRepo(), createMockSyncEngine(), 'biz-1' as any, 'dev-1' as any)
}

describe('Canonical commission formula — reconciliation', () => {

  function reconcile(amount: number) {
    const split = svc().calculateSplit(amount as any)
    return {
      amount,
      company: split.companyShare,
      salesperson: split.salespersonShare,
      influencer: split.influencerFlat,
      companyPlusSalesperson: split.companyShare + split.salespersonShare,
      totalIncludingInfluencer: split.companyShare + split.salespersonShare + split.influencerFlat,
    }
  }

  it('KSh 600 — exact base amount', () => {
    // excess = 0
    // company = 500 + 0 = 500
    // salesperson = 100 + 0 = 100
    // influencer = 50 (company pays from its share, not from payment)
    const r = reconcile(600)
    expect(r.company).toBe(500)
    expect(r.salesperson).toBe(100)
    expect(r.influencer).toBe(50)
    expect(r.companyPlusSalesperson).toBe(600)  // 500+100 = 600 = payment amount
    expect(r.totalIncludingInfluencer).toBe(650)  // company bears influencer cost
  })

  it('KSh 700 — one excess unit', () => {
    // excess = 700-600 = 100
    // company = 500 + 25%×100 = 500+25 = 525
    // salesperson = 100 + 75%×100 = 100+75 = 175
    // influencer = 50
    const r = reconcile(700)
    expect(r.company).toBe(525)
    expect(r.salesperson).toBe(175)
    expect(r.influencer).toBe(50)
    expect(r.companyPlusSalesperson).toBe(700)  // 525+175 = 700 ✓
    expect(r.totalIncludingInfluencer).toBe(750)
  })

  it('KSh 800 — small excess', () => {
    // excess = 200
    // company = 500 + 25%×200 = 500+50 = 550
    // salesperson = 100 + 75%×200 = 100+150 = 250
    const r = reconcile(800)
    expect(r.company).toBe(550)
    expect(r.salesperson).toBe(250)
    expect(r.influencer).toBe(50)
    expect(r.companyPlusSalesperson).toBe(800)
    expect(r.totalIncludingInfluencer).toBe(850)
  })

  it('KSh 1,000 — moderate excess', () => {
    // excess = 400
    // company = 500 + 25%×400 = 500+100 = 600
    // salesperson = 100 + 75%×400 = 100+300 = 400
    const r = reconcile(1000)
    expect(r.company).toBe(600)
    expect(r.salesperson).toBe(400)
    expect(r.influencer).toBe(50)
    expect(r.companyPlusSalesperson).toBe(1000)
    expect(r.totalIncludingInfluencer).toBe(1050)
  })

  it('KSh 2,000 — large excess', () => {
    // excess = 1400
    // company = 500 + 25%×1400 = 500+350 = 850
    // salesperson = 100 + 75%×1400 = 100+1050 = 1150
    const r = reconcile(2000)
    expect(r.company).toBe(850)
    expect(r.salesperson).toBe(1150)
    expect(r.influencer).toBe(50)
    expect(r.companyPlusSalesperson).toBe(2000)
    expect(r.totalIncludingInfluencer).toBe(2050)
  })

  it('KSh 0 — zero payment (edge case)', () => {
    const r = reconcile(0)
    expect(r.company).toBe(500)
    expect(r.salesperson).toBe(100)
    expect(r.influencer).toBe(50)
    expect(r.companyPlusSalesperson).toBe(600)  // formula still applies at zero
    expect(r.totalIncludingInfluencer).toBe(650)
  })

  it('KSh 1 — below base', () => {
    // excess = 0
    // company = 500, salesperson = 100
    const r = reconcile(1)
    expect(r.company).toBe(500)
    expect(r.salesperson).toBe(100)
    expect(r.influencer).toBe(50)
    expect(r.companyPlusSalesperson).toBe(600)  // formula still applies
  })

  it('influencer flat is always KSh 50 regardless of amount', () => {
    ;[0, 1, 100, 599, 600, 601, 700, 1000, 2000, 5000, 10000].forEach(amount => {
      const r = svc().calculateSplit(amount as any)
      expect(r.influencerFlat).toBe(50)
    })
  })

  it('company + salesperson equals payment amount when amount >= base (600)', () => {
    // Below base: company=500 + salesperson=100 = 600 (company absorbs the shortfall)
    // At/above base: excess is split proportionally so the sum equals amount
    ;[600, 601, 700, 800, 1000, 2000, 5000].forEach(amount => {
      const r = svc().calculateSplit(amount as any)
      expect(r.companyShare + r.salespersonShare).toBe(amount)
    })
  })

  it('below base (amount < 600): company + salesperson = 600 (company absorbs shortfall)', () => {
    ;[0, 1, 100, 599].forEach(amount => {
      const r = svc().calculateSplit(amount as any)
      expect(r.companyShare + r.salespersonShare).toBe(600)
    })
  })
})
