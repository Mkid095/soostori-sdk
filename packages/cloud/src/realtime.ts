/**
 * Realtime subscriptions — wraps FIDScript realtime mechanism.
 *
 * The FIDScript SDK (@fidscript/instant-react, @instantdb/react-native)
 * handles this natively in browser/RN contexts. For Desktop (Electron main)
 * we expose a polling-based fallback that uses the same query API.
 *
 * For production cross-platform realtime, use:
 *   - Mobile/Web: their respective FIDScript SDKs
 *   - Desktop: WebSocket subscription (TBD) or polling at 5s intervals
 */

import type { CloudClient } from './client'

export interface RealtimeSubscriptionOptions {
  entity: string
  /** Polling interval in ms (default 5000). */
  intervalMs?: number
  /** Where clause for InstaQL. */
  where?: Record<string, unknown>
}

export type Unsubscribe = () => void

export interface RealtimeSubscription {
  unsubscribe: Unsubscribe
}

/** Polling-based realtime subscription. Suitable for desktop. */
export function subscribePolling(
  client: CloudClient,
  options: RealtimeSubscriptionOptions,
  onUpdate: (records: Record<string, unknown>[]) => void,
  onError?: (err: Error) => void
): RealtimeSubscription {
  const intervalMs = options.intervalMs ?? 5000
  let active = true
  let lastIds = ''

  const tick = async (): Promise<void> => {
    if (!active) return
    try {
      const goals: Record<string, unknown> = {
        [options.entity]: { $: { where: options.where ?? {} } },
      }
      const result = await client.query<Record<string, unknown[]>>(goals)
      const records = (result[options.entity] as Record<string, unknown>[]) ?? []
      const ids = JSON.stringify(records.map(r => r.id))
      if (ids !== lastIds) {
        lastIds = ids
        onUpdate(records)
      }
    } catch (err) {
      onError?.(err as Error)
    }
  }

  void tick()
  const timer = setInterval(() => { void tick() }, intervalMs)
  return {
    unsubscribe() {
      active = false
      clearInterval(timer)
    },
  }
}
