/**
 * PaymentReceipt repository tests.
 *
 * Run: pnpm vitest run packages/payments/test/receipt.test.ts
 */

import { describe, it, expect } from 'vitest'
import type { PaymentReceipt, PaymentReceiptRepository } from '../src/receipt.js'
import type { BusinessId, ISO8601, Money } from '@soostori/core'

// ── Mock repository factory ────────────────────────────────────────────────────

function makeReceipt(overrides: Partial<{
  id: string; shopId: string; provider: string
  providerReference: string; checkoutRequestId: string; status: string
  amount: number; currency: string; customerPhone: string | null
  failureReason: string | null; paidAt: string | null; createdAt: string
}> = {}): PaymentReceipt {
  const now = new Date().toISOString()
  return {
    id: `rcpt-${Math.random().toString(36).slice(2)}` as any,
    shopId: 'biz-test' as BusinessId,
    provider: 'tuma',
    providerReference: 'MPXX123456',
    checkoutRequestId: 'ws_123456',
    status: 'completed',
    amount: 1_000 as Money,
    currency: 'KES',
    customerPhone: '+254700000000',
    failureReason: null,
    paidAt: now,
    createdAt: now,
    ...overrides,
  } as any
}

function createInMemoryRepo(): PaymentReceiptRepository {
  const receipts = new Map<string, PaymentReceipt>()
  const checkoutIndex = new Map<string, PaymentReceipt>()
  const providerRefIndex = new Map<string, PaymentReceipt>()

  return {
    async save(receipt) {
      receipts.set(receipt.id, receipt)
      checkoutIndex.set(receipt.checkoutRequestId, receipt)
      providerRefIndex.set(receipt.providerReference, receipt)
    },
    async findByCheckoutRequestId(id) {
      return checkoutIndex.get(id) ?? null
    },
    async findByProviderReference(ref) {
      return providerRefIndex.get(ref) ?? null
    },
    async listByShop(shopId, period) {
      return [...receipts.values()].filter(r =>
        r.shopId === shopId &&
        r.createdAt >= period.from &&
        r.createdAt <= period.to
      )
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PaymentReceiptRepository', () => {

  describe('save + findByCheckoutRequestId', () => {
    it('saves a receipt and retrieves it by checkoutRequestId', async () => {
      const repo = createInMemoryRepo()
      const receipt = makeReceipt()
      await repo.save(receipt)
      const found = await repo.findByCheckoutRequestId(receipt.checkoutRequestId)
      expect(found?.id).toBe(receipt.id)
    })

    it('returns null for unknown checkoutRequestId', async () => {
      const repo = createInMemoryRepo()
      const found = await repo.findByCheckoutRequestId('unknown')
      expect(found).toBeNull()
    })
  })

  describe('findByProviderReference', () => {
    it('saves and retrieves by providerReference', async () => {
      const repo = createInMemoryRepo()
      const receipt = makeReceipt({ providerReference: 'MPXX999999' })
      await repo.save(receipt)
      const found = await repo.findByProviderReference('MPXX999999')
      expect(found?.id).toBe(receipt.id)
    })

    it('returns null for unknown providerReference', async () => {
      const repo = createInMemoryRepo()
      const found = await repo.findByProviderReference('UNKNOWN')
      expect(found).toBeNull()
    })
  })

  describe('listByShop', () => {
    it('returns only receipts for the specified shop', async () => {
      const repo = createInMemoryRepo()
      const now = new Date().toISOString()
      const period = { from: '2020-01-01T00:00:00.000Z', to: '2099-12-31T23:59:59.999Z' }

      await repo.save(makeReceipt({ shopId: 'biz-a' as BusinessId, createdAt: now }))
      await repo.save(makeReceipt({ shopId: 'biz-b' as BusinessId, createdAt: now }))
      await repo.save(makeReceipt({ shopId: 'biz-a' as BusinessId, createdAt: now }))

      const results = await repo.listByShop('biz-a' as BusinessId, period)
      expect(results).toHaveLength(2)
      expect(results.every(r => (r as any).shopId === 'biz-a')).toBe(true)
    })
  })

  describe('status variants', () => {
    it('saves and retrieves receipts with different statuses', async () => {
      const repo = createInMemoryRepo()

      const pending = makeReceipt({ id: 'p1', status: 'pending', providerReference: 'ref1' })
      const completed = makeReceipt({ id: 'p2', status: 'completed', providerReference: 'ref2' })
      const failed = makeReceipt({ id: 'p3', status: 'failed', providerReference: 'ref3', failureReason: 'Insufficient funds' })
      const cancelled = makeReceipt({ id: 'p4', status: 'cancelled', providerReference: 'ref4' })

      for (const r of [pending, completed, failed, cancelled]) {
        await repo.save(r)
      }

      const all = await repo.listByShop('biz-test' as BusinessId, {
        from: '2020-01-01T00:00:00.000Z',
        to: '2099-12-31T23:59:59.999Z',
      })

      expect(all).toHaveLength(4)
      expect(all.find(r => (r as any).id === 'p1')?.status).toBe('pending')
      expect(all.find(r => (r as any).id === 'p3')?.failureReason).toBe('Insufficient funds')
    })
  })

})
