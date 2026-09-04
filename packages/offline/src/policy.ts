/**
 * Offline policy — central authority for the 3-day offline rule.
 *
 * State machine:
 *
 *   ONLINE (cloud verified)
 *     │
 *     ▼
 *   OFFLINE (cached authorization, days since last verification)
 *     │
 *     ├── Day 0-1: NORMAL
 *     ├── Day 2: NORMAL
 *     ├── Day 3: WARNING (banner)
 *     │
 *     ▼
 *   OFFLINE_LIMIT_EXCEEDED (require connection)
 *
 * The policy engine publishes events when state changes so UI can react.
 */

import {
  newId, asDeviceId, asShopId,
  type SubscriptionEntitlement, type ShopId, type UUID, type DeviceId,
} from '@soostori/core'
import { OFFLINE_GRACE_DAYS } from '@soostori/core'
import { createEvent, SYSTEM_ERROR, type SoostoriEvent } from '@soostori/events'

export type OfflinePhase = 'ONLINE' | 'OFFLINE_NORMAL' | 'OFFLINE_WARNING' | 'OFFLINE_LIMIT_EXCEEDED'

export interface OfflineState {
  phase: OfflinePhase
  /** Days since the last successful cloud verification. */
  daysSinceVerification: number
  /** Cached entitlement (from cloud verification). */
  entitlement: SubscriptionEntitlement | null
  /** When the device first went offline (null if currently online). */
  offlineSince: string | null
  /** When the device last verified against cloud. */
  lastVerifiedAt: string
  /** Days remaining before the 3-day limit. */
  daysUntilLimit: number
  /** Can this device currently sell? */
  canSell: boolean
  /** Can this device receive new inventory? */
  canReceiveStock: boolean
  /** Can this device view reports? */
  canViewReports: boolean
}

/** Inputs the policy needs. */
export interface PolicyInputs {
  shopId: ShopId
  /** Currently online? (true = cloud reachable) */
  isOnline: boolean
  /** Last successful cloud verification timestamp. */
  lastVerifiedAt: string
  /** Cached entitlement (from the most recent verification). */
  entitlement: SubscriptionEntitlement | null
  /** When the device first went offline (null if online now). */
  offlineSince: string | null
  /** Subscription expired? */
  subscriptionExpired: boolean
  /** Primary device lost? (separate from internet) */
  primaryLost: boolean
  /** When to check again. */
  now?: Date
}

export function computeOfflineState(inputs: PolicyInputs): OfflineState {
  const now = inputs.now ?? new Date()
  const daysSince = daysBetween(inputs.lastVerifiedAt, now)
  const daysUntilLimit = Math.max(0, OFFLINE_GRACE_DAYS - daysSince)

  let phase: OfflinePhase
  if (inputs.isOnline) {
    phase = 'ONLINE'
  } else if (inputs.subscriptionExpired && daysSince >= OFFLINE_GRACE_DAYS) {
    phase = 'OFFLINE_LIMIT_EXCEEDED'
  } else if (daysSince >= OFFLINE_GRACE_DAYS) {
    phase = 'OFFLINE_LIMIT_EXCEEDED'
  } else if (daysSince >= OFFLINE_GRACE_DAYS - 1) {
    phase = 'OFFLINE_WARNING'
  } else {
    phase = 'OFFLINE_NORMAL'
  }

  return {
    phase,
    daysSinceVerification: daysSince,
    entitlement: inputs.entitlement,
    offlineSince: inputs.offlineSince,
    lastVerifiedAt: inputs.lastVerifiedAt,
    daysUntilLimit,
    canSell: phase === 'ONLINE' || phase === 'OFFLINE_NORMAL' || phase === 'OFFLINE_WARNING',
    canReceiveStock: !inputs.primaryLost && (phase === 'ONLINE' || phase === 'OFFLINE_NORMAL'),
    canViewReports: phase !== 'OFFLINE_LIMIT_EXCEEDED',
  }
}

function daysBetween(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

/** Compute events that should be emitted on state changes. */
export function stateChangeEvents(
  before: OfflineState,
  after: OfflineState,
  deviceId: DeviceId,
  shopId: ShopId
): SoostoriEvent[] {
  const events: SoostoriEvent[] = []
  if (before.phase !== after.phase) {
    events.push(createEvent({
      name: SYSTEM_ERROR,
      shopId,
      deviceId,
      entity: 'system',
      payload: {
        source: 'offline_policy',
        message: `Offline phase changed from ${before.phase} to ${after.phase}`,
      },
    }))
  }
  return events
}
