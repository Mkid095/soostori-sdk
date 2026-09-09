/**
 * Subscription enforcement — gates POS operations.
 *
 * Rules:
 *   - Active or trialing: allow
 *   - Past due: allow with banner
 *   - Expired: block (after grace period)
 *   - Cancelled: block
 *
 * Caller is responsible for displaying the banner / blocking UI.
 */

import { SoostoriError } from '@soostori/core'
import type { SubscriptionState } from './entitlement.js'

export class SubscriptionExpiredError extends SoostoriError {
  constructor(message: string) {
    super('SUBSCRIPTION_EXPIRED', message)
    this.name = 'SubscriptionExpiredError'
  }
}

/** Throw if subscription is expired and grace period has passed. */
export function enforceSubscription(state: SubscriptionState): void {
  if (state.expired && !state.inGracePeriod) {
    throw new SubscriptionExpiredError(
      `Subscription expired. Reconnect to verify online subscription.`
    )
  }
  if (state.expired && state.graceDaysRemaining === 0) {
    throw new SubscriptionExpiredError(
      `Subscription expired and grace period (${state.graceDaysRemaining} days) exhausted.`
    )
  }
}

/** Returns the device limit warning state. */
export function isApproachingDeviceLimit(activeDeviceCount: number, deviceLimit: number | null): boolean {
  if (deviceLimit === null) return false
  return activeDeviceCount >= deviceLimit * 0.9
}
