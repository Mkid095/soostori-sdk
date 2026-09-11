/**
 * enforceSubscriptionForSync tests.
 *
 * Run: pnpm vitest run packages/subscription/test/enforcement-sync.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enforceSubscriptionForSync, SubscriptionGracePeriodExpiredError, SubscriptionCancelledError } from '../src/enforcement-sync.js'
import type { SubscriptionCache } from '../src/cache.js'
import type { SubscriptionEntitlement } from '@soostori/core'

const SHOP_ID = 'shop-test-1'

// ── Mock cache factory ─────────────────────────────────────────────────────────

function mockCache(entitlement?: SubscriptionEntitlement | null, lastVerifiedAt?: string): SubscriptionCache {
  return {
    async load() {
      if (entitlement === undefined) return null
      if (entitlement === null) return null
      return {
        entitlement,
        lastVerifiedAt: lastVerifiedAt ?? new Date().toISOString(),
      }
    },
    async save() {},
    async clear() {},
    async getState() { return null as any },
  } as unknown as SubscriptionCache
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('enforceSubscriptionForSync', () => {

  // ── active / trialing / past_due → allow silently ─────────────────────────

  it('allows active subscription', async () => {
    const cache = mockCache({
      shopId: SHOP_ID as any,
      status: 'active',
      plan: 'pro',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      verifiedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      nextVerificationDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    })
    await expect(enforceSubscriptionForSync(cache, SHOP_ID)).resolves.toBeUndefined()
  })

  it('allows trialing subscription', async () => {
    const cache = mockCache({
      shopId: SHOP_ID as any,
      status: 'trialing',
      plan: 'trial',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      verifiedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      nextVerificationDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    })
    await expect(enforceSubscriptionForSync(cache, SHOP_ID)).resolves.toBeUndefined()
  })

  it('allows past_due subscription (still allows mutations)', async () => {
    const cache = mockCache({
      shopId: SHOP_ID as any,
      status: 'past_due',
      plan: 'pro',
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      verifiedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      nextVerificationDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    })
    await expect(enforceSubscriptionForSync(cache, SHOP_ID)).resolves.toBeUndefined()
  })

  // ── expired within grace period → allow with warning ───────────────────────

  it('allows expired subscription within grace period with warning', async () => {
    const now = new Date()
    const verifiedAt = new Date(now.getTime() - 1 * 86_400_000).toISOString() // 1 day ago
    const expiresAt = new Date(now.getTime() - 2 * 86_400_000).toISOString()  // expired 2 days ago

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const cache = mockCache({
      shopId: SHOP_ID as any,
      status: 'expired',
      plan: 'pro',
      expiresAt,
      verifiedAt,
      serverTime: now.toISOString(),
      nextVerificationDeadline: new Date(now.getTime() + 86_400_000).toISOString(),
    }, verifiedAt)

    await expect(enforceSubscriptionForSync(cache, SHOP_ID)).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('grace period')
    )
    warnSpy.mockRestore()
  })

  // ── expired past grace period → throw ───────────────────────────────────

  it('throws SubscriptionGracePeriodExpiredError when expired past grace period', async () => {
    const now = new Date()
    const verifiedAt = new Date(now.getTime() - 5 * 86_400_000).toISOString() // 5 days ago — past 3-day grace
    const expiresAt = new Date(now.getTime() - 5 * 86_400_000).toISOString()  // expired 5 days ago

    const cache = mockCache({
      shopId: SHOP_ID as any,
      status: 'expired',
      plan: 'pro',
      expiresAt,
      verifiedAt,
      serverTime: now.toISOString(),
      nextVerificationDeadline: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
    }, verifiedAt)

    await expect(enforceSubscriptionForSync(cache, SHOP_ID))
      .rejects.toThrow(SubscriptionGracePeriodExpiredError)
  })

  // ── cancelled → throw ───────────────────────────────────────────────────

  it('throws SubscriptionCancelledError when subscription is cancelled', async () => {
    const cache = mockCache({
      shopId: SHOP_ID as any,
      status: 'cancelled',
      plan: 'pro',
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      verifiedAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      nextVerificationDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    })

    await expect(enforceSubscriptionForSync(cache, SHOP_ID))
      .rejects.toThrow(SubscriptionCancelledError)
  })

  // ── no cache → allow (trial/default) ────────────────────────────────────

  it('allows when cache returns null (trial/default entitlement)', async () => {
    const cache = mockCache(null)
    await expect(enforceSubscriptionForSync(cache, SHOP_ID)).resolves.toBeUndefined()
  })

})
