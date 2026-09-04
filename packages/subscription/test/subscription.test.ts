import { describe, it, expect } from 'vitest'
import {
  defaultEntitlement, computeState, isStatusActive, nextVerificationDeadline,
  enforceSubscription, isApproachingDeviceLimit, SubscriptionExpiredError,
  SubscriptionCache,
} from '../src/index'
import { newId, asShopId } from '@soostori/core'
import type { SubscriptionEntitlement } from '@soostori/core'

const SHOP_ID = asShopId('shop-1')

function makeEntitlement(overrides: Partial<SubscriptionEntitlement> = {}): SubscriptionEntitlement {
  const now = new Date()
  return {
    shopId: SHOP_ID,
    status: 'active',
    plan: 'pro',
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    verifiedAt: now.toISOString(),
    serverTime: now.toISOString(),
    nextVerificationDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }
}

describe('defaultEntitlement', () => {
  it('starts with trial status', () => {
    const e = defaultEntitlement('shop-1')
    expect(e.status).toBe('trialing')
    expect(e.plan).toBe('trial')
  })
})

describe('isStatusActive', () => {
  it('returns true for active and trialing', () => {
    expect(isStatusActive('active')).toBe(true)
    expect(isStatusActive('trialing')).toBe(true)
  })
  it('returns false for expired, cancelled, past_due', () => {
    expect(isStatusActive('expired')).toBe(false)
    expect(isStatusActive('cancelled')).toBe(false)
    expect(isStatusActive('past_due')).toBe(false)
  })
})

describe('nextVerificationDeadline', () => {
  it('returns 24h from now', () => {
    const t0 = new Date()
    const d = nextVerificationDeadline(t0)
    const delta = new Date(d).getTime() - t0.getTime()
    expect(delta).toBe(24 * 60 * 60 * 1000)
  })
})

describe('computeState', () => {
  it('returns default state when no cache', () => {
    const state = computeState(null)
    expect(state.valid).toBe(true)
    expect(state.source).toBe('default')
  })

  it('valid for active entitlement', () => {
    const cached = { entitlement: makeEntitlement(), lastVerifiedAt: new Date().toISOString() }
    const state = computeState(cached)
    expect(state.valid).toBe(true)
    expect(state.expired).toBe(false)
  })

  it('valid for expired within grace period', () => {
    const now = new Date()
    const verified = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)  // 1 day ago
    const cached = {
      entitlement: makeEntitlement({
        status: 'expired',
        expiresAt: new Date(now.getTime() - 1000).toISOString(),  // expired 1s ago
      }),
      lastVerifiedAt: verified.toISOString(),
    }
    const state = computeState(cached, now)
    expect(state.expired).toBe(true)
    expect(state.inGracePeriod).toBe(true)
    expect(state.valid).toBe(true)
  })

  it('invalid when grace exhausted', () => {
    const now = new Date()
    const verified = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)  // 5 days ago
    const cached = {
      entitlement: makeEntitlement({
        status: 'expired',
        expiresAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      lastVerifiedAt: verified.toISOString(),
    }
    const state = computeState(cached, now)
    expect(state.expired).toBe(true)
    expect(state.inGracePeriod).toBe(false)
    expect(state.valid).toBe(false)
    expect(state.graceDaysRemaining).toBe(0)
  })

  it('computes daysUntilExpiry', () => {
    // Use 10.5 days in the future so floor gives exactly 10 days.
    // Using exactly 10 days from a millisecond-precise Date creates
    // ambiguity once lastVerifiedAt is round-tripped through toISOString()
    // (which strips milliseconds). 10.5 days avoids the edge.
    const now = new Date()
    const expiry = new Date(now.getTime() + 10.5 * 24 * 60 * 60 * 1000)
    const cached = {
      entitlement: makeEntitlement({ expiresAt: expiry.toISOString() }),
      lastVerifiedAt: now.toISOString(),
    }
    const state = computeState(cached, now)
    expect(state.daysUntilExpiry).toBe(10)
  })
})

describe('enforceSubscription', () => {
  it('allows valid subscription', () => {
    const cached = { entitlement: makeEntitlement(), lastVerifiedAt: new Date().toISOString() }
    expect(() => enforceSubscription(computeState(cached))).not.toThrow()
  })

  it('throws when expired and grace exhausted', () => {
    const now = new Date()
    const cached = {
      entitlement: makeEntitlement({
        status: 'expired',
        expiresAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      lastVerifiedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    }
    expect(() => enforceSubscription(computeState(cached, now))).toThrow(SubscriptionExpiredError)
  })

  it('allows during grace period', () => {
    const now = new Date()
    const cached = {
      entitlement: makeEntitlement({
        status: 'expired',
        expiresAt: new Date(now.getTime() - 1000).toISOString(),
      }),
      lastVerifiedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    }
    expect(() => enforceSubscription(computeState(cached, now))).not.toThrow()
  })
})

describe('isApproachingDeviceLimit', () => {
  it('returns true at 90%', () => {
    expect(isApproachingDeviceLimit(9, 10)).toBe(true)
  })
  it('returns false below 90%', () => {
    expect(isApproachingDeviceLimit(8, 10)).toBe(false)
  })
  it('returns false when limit is null', () => {
    expect(isApproachingDeviceLimit(1000, null)).toBe(false)
  })
})

describe('SubscriptionCache', () => {
  it('load returns null when empty', async () => {
    const cache = new SubscriptionCache({
      async get() { return null },
      async set() {},
      async delete() {},
    })
    const result = await cache.load(SHOP_ID)
    expect(result).toBeNull()
  })

  it('save then load round-trip', async () => {
    const store = new Map<string, string>()
    const cache = new SubscriptionCache({
      async get(k) { return store.get(k) ?? null },
      async set(k, v) { store.set(k, v) },
      async delete(k) { store.delete(k) },
    })
    const e = makeEntitlement()
    await cache.save(e)
    const loaded = await cache.load(SHOP_ID)
    expect(loaded?.entitlement.plan).toBe('pro')
  })

  it('returns null when shopId mismatches', async () => {
    const store = new Map<string, string>()
    const cache = new SubscriptionCache({
      async get(k) { return store.get(k) ?? null },
      async set(k, v) { store.set(k, v) },
      async delete(k) { store.delete(k) },
    })
    await cache.save(makeEntitlement({ shopId: SHOP_ID }))
    const otherShop = asShopId('shop-2')
    expect(await cache.load(otherShop)).toBeNull()
  })
})
