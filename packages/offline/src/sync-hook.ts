/**
 * Offline policy sync-hook — integrated with the sync timer worker.
 *
 * Called by the sync timer worker on every cycle.
 * Returns the current OfflinePhase and days-offline metadata.
 *
 * State machine:
 *   ONLINE              — lastOnlineAt within last 24 hours
 *   OFFLINE_NORMAL      — days 1-2 since going offline
 *   OFFLINE_WARNING     — day 3 since going offline
 *   OFFLINE_LIMIT_EXCEEDED — day 4+ since going offline
 *
 * Clock skew guard: if lastOnlineAt is in the future → treat as ONLINE.
 */

import type { SubscriptionCache } from '@soostori/subscription'
import { OFFLINE_GRACE_DAYS } from '@soostori/core'
import type { OfflinePhase } from './policy.js'

const MS_PER_DAY = 86_400_000

function daysSince(timestamp: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(timestamp).getTime()) / MS_PER_DAY)
}

/**
 * onSyncTick — called by the sync timer worker on every cycle.
 *
 * Returns the current OfflinePhase. If OFFLINE_LIMIT_EXCEEDED, the
 * caller must block mutation application and surface a UI state.
 *
 * Usage in sync timer worker:
 *   const { phase, daysOffline, remainingDays } = onSyncTick(cache, lastOnlineAt)
 *   if (phase === 'OFFLINE_LIMIT_EXCEEDED') {
 *     syncEngine.pause()
 *     notifyApp('OFFLINE_LIMIT_EXCEEDED')
 *   }
 */
export function onSyncTick(
  _subscriptionCache: SubscriptionCache,
  lastOnlineAt: Date,
): { phase: OfflinePhase; daysOffline: number; remainingDays: number } {
  const now = new Date()

  // Clock skew guard: future timestamp → treat as ONLINE
  if (lastOnlineAt.getTime() > now.getTime()) {
    return { phase: 'ONLINE', daysOffline: 0, remainingDays: OFFLINE_GRACE_DAYS }
  }

  const daysOffline = daysSince(lastOnlineAt.toISOString(), now)

  let phase: OfflinePhase
  if (daysOffline === 0) {
    phase = 'ONLINE'
  } else if (daysOffline === 1 || daysOffline === 2) {
    phase = 'OFFLINE_NORMAL'
  } else if (daysOffline === 3) {
    phase = 'OFFLINE_WARNING'
  } else {
    phase = 'OFFLINE_LIMIT_EXCEEDED'
  }

  const remainingDays = Math.max(0, OFFLINE_GRACE_DAYS - daysOffline)

  return { phase, daysOffline, remainingDays }
}
