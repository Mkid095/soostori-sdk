import { describe, it, expect } from 'vitest'
import { computeOfflineState } from '../src/policy'
import { newId, asShopId } from '@soostori/core'

const SHOP = asShopId('s')

describe('computeOfflineState', () => {
  const entitlement = {
    shopId: SHOP,
    status: 'active' as const,
    plan: 'pro',
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    verifiedAt: new Date().toISOString(),
    serverTime: new Date().toISOString(),
    nextVerificationDeadline: new Date(Date.now() + 86400000).toISOString(),
  }

  it('returns ONLINE when online', () => {
    const state = computeOfflineState({
      shopId: SHOP, isOnline: true,
      lastVerifiedAt: new Date().toISOString(),
      entitlement, offlineSince: null,
      subscriptionExpired: false, primaryLost: false,
    })
    expect(state.phase).toBe('ONLINE')
    expect(state.canSell).toBe(true)
  })

  it('OFFLINE_NORMAL for first 2 days offline', () => {
    const now = new Date()
    const lastVerified = new Date(now.getTime() - 1 * 86400000)
    const state = computeOfflineState({
      shopId: SHOP, isOnline: false,
      lastVerifiedAt: lastVerified.toISOString(),
      entitlement, offlineSince: lastVerified.toISOString(),
      subscriptionExpired: false, primaryLost: false, now,
    })
    expect(state.phase).toBe('OFFLINE_NORMAL')
    expect(state.daysSinceVerification).toBe(1)
    expect(state.canSell).toBe(true)
  })

  it('OFFLINE_WARNING on day 3 (within grace)', () => {
    const now = new Date()
    const lastVerified = new Date(now.getTime() - 2.5 * 86400000)
    const state = computeOfflineState({
      shopId: SHOP, isOnline: false,
      lastVerifiedAt: lastVerified.toISOString(),
      entitlement, offlineSince: lastVerified.toISOString(),
      subscriptionExpired: false, primaryLost: false, now,
    })
    expect(state.phase).toBe('OFFLINE_WARNING')
  })

  it('OFFLINE_LIMIT_EXCEEDED after 3 days', () => {
    const now = new Date()
    const lastVerified = new Date(now.getTime() - 5 * 86400000)
    const state = computeOfflineState({
      shopId: SHOP, isOnline: false,
      lastVerifiedAt: lastVerified.toISOString(),
      entitlement, offlineSince: lastVerified.toISOString(),
      subscriptionExpired: false, primaryLost: false, now,
    })
    expect(state.phase).toBe('OFFLINE_LIMIT_EXCEEDED')
    expect(state.canSell).toBe(false)
    expect(state.canReceiveStock).toBe(false)
  })

  it('subscriptionExpired + offline blocks sales', () => {
    const now = new Date()
    const lastVerified = new Date(now.getTime() - 4 * 86400000)
    const state = computeOfflineState({
      shopId: SHOP, isOnline: false,
      lastVerifiedAt: lastVerified.toISOString(),
      entitlement, offlineSince: lastVerified.toISOString(),
      subscriptionExpired: true, primaryLost: false, now,
    })
    expect(state.phase).toBe('OFFLINE_LIMIT_EXCEEDED')
    expect(state.canSell).toBe(false)
  })

  it('primaryLost blocks stock receipt but allows sales', () => {
    const now = new Date()
    const state = computeOfflineState({
      shopId: SHOP, isOnline: true,
      lastVerifiedAt: now.toISOString(),
      entitlement, offlineSince: null,
      subscriptionExpired: false, primaryLost: true, now,
    })
    expect(state.canSell).toBe(true)
    expect(state.canReceiveStock).toBe(false)
  })
})
