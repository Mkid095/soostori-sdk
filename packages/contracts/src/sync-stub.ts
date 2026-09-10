/**
 * Sync stub — `NoOpSyncEngineClass` + `NoOpSyncEngine` const + `defaultSyncEngine`.
 *
 * Cycle 04 Sub-cycle E ships a callable stub so feature/platform cycles can
 * wire `syncEngine.enqueue(event)` into mutation paths without depending on
 * a real backend. The stub honours the six conflict-resolution principles
 * documented in `./docs/sync-semantics.md` by returning `no_op` on
 * `apply()` — every principle is preserved (dedup, ordering, version
 * compare, tombstone handling) when the real engine ships in a later
 * cycle.
 *
 *   1. Inventory authority      — real engine routes stock events through
 *                                  the LAN host (`Device.isLanHost === true`)
 *   2. Last-writer-wins         — real engine compares `entityVersion`
 *   3. Cascade tombstones       — real engine treats `operation:'tombstone'`
 *                                  as logical delete
 *   4. Replay / dedup           — real engine short-circuits on seen
 *                                  `idempotencyKey`
 *   5. Ordering                 — real engine orders by
 *                                  `(serverReceivedAt, originatingDeviceId,
 *                                  clientSequence)`
 *   6. Retry `id → acked`       — real engine treats same-`id` retries as
 *                                  dedup at cloud storage
 *
 * The stub captures the contract. Replace `defaultSyncEngine` to upgrade.
 */

import type { SyncEvent } from './sync-contract.js'
import type { SyncApplyResult } from './sync-contract.js'
import type { SyncCursor } from './sync-contract.js'
import type { SyncEngine } from './sync-contract.js'

/**
 * In-memory event log used by `NoOpSyncEngineClass.enqueue()` so tests can
 * inspect what was queued. Real engine persists to SQLite + replays via
 * the FIDScript transact endpoint.
 */
export interface QueuedSyncEvent {
  event: SyncEvent
  enqueuedAt: number
}

/**
 * Class form of the no-op sync engine. Exposed so callers can construct
 * isolated instances (one per test, one per worker). The const
 * `NoOpSyncEngine` and the singleton `defaultSyncEngine` (below) are both
 * wired to this class.
 */
export class NoOpSyncEngineClass implements SyncEngine {
  /** Captured queue — visible to tests + diagnostics. */
  private readonly queue: QueuedSyncEvent[] = []

  /** Read-only view of the queue (most recent last). */
  get pending(): readonly QueuedSyncEvent[] {
    return this.queue
  }

  /** Total events ever enqueued on this instance. */
  get size(): number {
    return this.queue.length
  }

  /**
   * enqueue — append the event to the in-memory queue and mark `pending`.
   * Real engine would persist to local SQLite and schedule upload via
   * FIDScript transact. The `state: 'queued'` reply is the contract.
   */
  async enqueue(event: SyncEvent): Promise<{ state: 'queued' | 'acked' | 'rejected' }> {
    this.queue.push({
      event: { ...event, state: 'pending' },
      enqueuedAt: Date.now(),
    })
    return { state: 'queued' }
  }

  /**
   * pull — return no events. Real engine queries FIDScript for events
   * newer than `(cursor.lastServerReceivedAt, lastOriginatingDeviceId,
   * lastClientSequence)` per principle 5.
   */
  async pull(_remoteCursor: SyncCursor): Promise<SyncEvent[]> {
    return []
  }

  /**
   * apply — always `no_op`. Real engine would inspect `event.entityVersion`
   * vs `local.entityVersion` (principle 2), short-circuit on seen
   * `idempotencyKey` (principle 4), and cascade tombstones (principle 3).
   * The contract's `no_op` variant carries no extra field.
   */
  apply<T>(_local: T, _event: SyncEvent): SyncApplyResult {
    return { state: 'no_op' }
  }

  /** Test helper: clear the captured queue. Not on the `SyncEngine` surface. */
  reset(): void {
    this.queue.length = 0
  }
}

// ── Singleton instance (preserves the Sub-cycle A const-object shape) ─────────

const _instance = new NoOpSyncEngineClass()

/**
 * NoOpSyncEngine — back-compat singleton matching the Sub-cycle A
 * const-object shape (`NoOpSyncEngine.enqueue(event)`), backed by the
 * `NoOpSyncEngineClass` class instance. Apps and tests can either:
 *
 *   - `import { NoOpSyncEngine } from '@soostori/contracts'`
 *   - `import { defaultSyncEngine } from '@soostori/contracts'` (same singleton)
 *   - `import { NoOpSyncEngineClass } from '@soostori/contracts'` (fresh instances)
 *
 * The singleton delegates to the shared class instance.
 */
export const NoOpSyncEngine: SyncEngine = {
  enqueue: (event) => _instance.enqueue(event),
  pull: (cursor) => _instance.pull(cursor),
  apply: (local, event) => _instance.apply(local, event),
}

/** defaultSyncEngine — apps should import this today. */
export const defaultSyncEngine: SyncEngine = _instance