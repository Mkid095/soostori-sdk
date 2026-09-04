/**
 * Subscription entitlement — cross-platform.
 *
 * The cloud `subscriptions` + `plans` entities are the authoritative source.
 * `shops.subscriptionExpiry` is a derived cache field (denormalized).
 *
 * Behavior:
 *   ONLINE  → check cloud subscriptions table
 *   OFFLINE → use cached entitlement with grace period (3 days)
 *   EXPIRED → block POS operations
 */

import { OFFLINE_GRACE_DAYS } from '@soostori/core'
import type { SubscriptionEntitlement, SubscriptionStatus } from '@soostori/core'

export interface CachedEntitlement {
  entitlement: SubscriptionEntitlement
  /** When the entitlement was last verified against cloud. */
  lastVerifiedAt: string
}

export interface SubscriptionState {
  valid: boolean
  expired: boolean
  inGracePeriod: boolean
  graceDaysRemaining: number
  daysUntilExpiry: number | null
  plan: string | null
  source: 'cloud' | 'cache' | 'default'
  checkedAt: string
}

/** Build a default trial entitlement. */
export function defaultEntitlement(shopId: string): SubscriptionEntitlement {
  const now = new Date()
  return {
    shopId: shopId as SubscriptionEntitlement['shopId'],
    status: 'trialing',
    plan: 'trial',
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    verifiedAt: now.toISOString(),
    serverTime: now.toISOString(),
    nextVerificationDeadline: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

/** Compute the current subscription state from a cached entitlement. */
export function computeState(cached: CachedEntitlement | null, now = new Date()): SubscriptionState {
  if (!cached) {
    return {
      valid: true,  // start in trial mode
      expired: false,
      inGracePeriod: false,
      graceDaysRemaining: OFFLINE_GRACE_DAYS,
      daysUntilExpiry: null,
      plan: null,
      source: 'default',
      checkedAt: now.toISOString(),
    }
  }
  const { entitlement, lastVerifiedAt } = cached
  const expiry = new Date(entitlement.expiresAt).getTime()
  const verified = new Date(lastVerifiedAt).getTime()
  const daysUntilExpiry = Math.floor((expiry - now.getTime()) / (1000 * 60 * 60 * 24))
  const graceElapsed = Math.floor((now.getTime() - verified) / (1000 * 60 * 60 * 24))
  const graceRemaining = Math.max(0, OFFLINE_GRACE_DAYS - graceElapsed)
  const expired = expiry < now.getTime()
  const inGracePeriod = expired && graceRemaining > 0
  const valid = !expired || inGracePeriod
  return {
    valid,
    expired,
    inGracePeriod,
    graceDaysRemaining: graceRemaining,
    daysUntilExpiry,
    plan: entitlement.plan,
    source: 'cache',
    checkedAt: now.toISOString(),
  }
}

/** Check if an entitlement status allows POS operations. */
export function isStatusActive(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing'
}

/** Compute the next time the entitlement should be re-verified. */
export function nextVerificationDeadline(now = new Date()): string {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
}
