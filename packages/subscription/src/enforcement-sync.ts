/**
 * Subscription enforcement — sync timer worker path.
 *
 * Called by the sync timer worker before apply(). Returns silently if
 * subscription allows mutations; throws if blocked.
 *
 * Rules:
 *   - active / trialing / past_due  → allow silently
 *   - expired within grace period   → allow with logged warning
 *   - expired past grace period     → throw SubscriptionGracePeriodExpiredError
 *   - cancelled                     → throw SubscriptionCancelledError
 */

import { SoostoriError } from '@soostori/core'
import type { SubscriptionCache } from './cache.js'
import type { SubscriptionState } from './entitlement.js'
import { computeState } from './entitlement.js'

export class SubscriptionGracePeriodExpiredError extends SoostoriError {
  constructor(message: string) {
    super('SUBSCRIPTION_GRACE_PERIOD_EXPIRED', message)
    this.name = 'SubscriptionGracePeriodExpiredError'
  }
}

export class SubscriptionCancelledError extends SoostoriError {
  constructor(message: string) {
    super('SUBSCRIPTION_CANCELLED', message)
    this.name = 'SubscriptionCancelledError'
  }
}

/**
 * enforceSubscriptionForSync — called by the sync timer worker before apply().
 *
 * Uses the subscription cache to determine if mutations are allowed.
 * Returns silently when subscription is in a valid state.
 * Throws when mutations must be blocked during sync.
 */
export async function enforceSubscriptionForSync(
  subscriptionCache: SubscriptionCache,
  shopId: string,
): Promise<void> {
  const cached = await subscriptionCache.load(shopId)
  const state: SubscriptionState = computeState(cached)

  if (state.source === 'default') {
    // No cached entitlement yet — trial/default, allow
    return
  }

  // Check cancelled FIRST — a cancelled sub with future expiry still blocks mutations
  const entitlement = cached?.entitlement
  if (entitlement?.status === 'cancelled') {
    throw new SubscriptionCancelledError(
      `Subscription is cancelled for shop ${shopId}. ` +
      `Sync mutations are not permitted.`
    )
  }

  if (state.valid && !state.expired) {
    // active / trialing / past_due
    return
  }

  if (state.expired && state.inGracePeriod && state.graceDaysRemaining > 0) {
    // expired but within grace period — allow with warning
    console.warn(
      `[Subscription] shop=${shopId} expired but within grace period ` +
      `(${state.graceDaysRemaining} days remaining). Mutations allowed online.`
    )
    return
  }

  if (state.expired && !state.inGracePeriod) {
    // expired past grace period
    throw new SubscriptionGracePeriodExpiredError(
      `Subscription grace period expired for shop ${shopId}. ` +
      `Sync mutations blocked until subscription is renewed.`
    )
  }

  // Fallback: if we can't determine state, throw
  throw new SubscriptionGracePeriodExpiredError(
    `Cannot determine subscription state for shop ${shopId}. ` +
    `Sync mutations blocked as a safety measure.`
  )
}
