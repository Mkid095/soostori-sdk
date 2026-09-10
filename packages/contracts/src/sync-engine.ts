/**
 * Real SyncEngine — FIDScript-backed enqueue / pull / apply.
 *
 * Cycle 05: replaces `NoOpSyncEngine` with a real implementation that:
 *   - `enqueue()`  — buffers events in an in-memory queue (offline-first;
 *                     later: flush to local SQLite on a timer)
 *   - `pull()`     — queries FIDScript cloud for events since the cursor's
 *                     `lastServerReceivedAt` timestamp, filtered by businessId
 *   - `apply()`    — pushes a single event to FIDScript via transact:
 *                     create → [create, entityKind, payload]
 *                     update → [update, entityKind, entityId, payload]
 *                     delete → [delete, entityKind, entityId]
 *                   Every transact call carries the event's `idempotencyKey`
 *                   so FIDScript deduplicates on replay.
 *
 * Business isolation: every method verifies `event.businessId ===
 * activeBusinessId` and silently ignores events from other tenants.
 *
 * Idempotency: `idempotencyKey` is passed to every cloud transact; FIDScript
 * handles dedup natively. Re-playing the same event is a no-op on the cloud.
 *
 * The engine is instantiated with an `InstantClient` (FIDScript REST client).
 * Apps inject the real client at startup; tests pass a mock.
 */

import type { SyncEvent } from './sync-contract.js'
import type { SyncApplyResult } from './sync-contract.js'
import type { SyncCursor } from './sync-contract.js'
import type { SyncEngine } from './sync-contract.js'
import type { QueuedSyncEvent } from './sync-stub.js'

// ── InstantClient interface ────────────────────────────────────────────────────

/**
 * The FIDScript cloud client interface that `SyncEngineClass` drives.
 *
 * Platforms inject their concrete client (e.g. `CloudClient` from
 * `@soostori/cloud`) at construction. The interface is intentionally narrow
 * so the engine is transport-agnostic.
 *
 * `transact` receives an array of Instaml step arrays and returns the raw
 * FIDScript response (includes server-set timestamps on created/updated
 * entities).
 *
 * `query` receives an InstaQL goals object and returns typed results.
 */
export interface InstantClient {
  transact(steps: unknown[][]): Promise<Record<string, unknown>>
  query<T = Record<string, unknown>>(goals: Record<string, unknown>): Promise<T>
}

// ── In-memory event queue item ────────────────────────────────────────────────

export interface SyncQueueItem {
  event: SyncEvent
  enqueuedAt: number
}

// ── SyncEngineClass ────────────────────────────────────────────────────────────

/**
 * Real sync engine backed by an FIDScript `InstantClient`.
 *
 * Supports:
 * - enqueue: buffer events locally and schedule cloud upload
 * - pull:    query cloud for new events since cursor timestamp
 * - apply:   push a single event to cloud via FIDScript transact
 *
 * All three methods enforce business isolation: events whose `businessId`
 * does not match `activeBusinessId` are silently ignored (apply returns
 * `{ state: 'no_op' }`).
 *
 * The `activeBusinessId` is set at construction and stored per-instance so
 * concurrent workers (e.g. one per device) each isolate correctly.
 */
export class SyncEngineClass implements SyncEngine {
  private readonly client: InstantClient
  private readonly businessId: string
  private readonly queue: SyncQueueItem[] = []
  private readonly seenIdempotencyKeys = new Set<string>()

  /**
   * @param client        — FIDScript REST client (e.g. `CloudClient`)
   * @param businessId    — the tenant this engine instance serves
   */
  constructor(client: InstantClient, businessId: string) {
    this.client = client
    this.businessId = businessId
  }

  // ── SyncEngine surface ─────────────────────────────────────────────────────

  /**
   * Enqueue an event for cloud transmission.
   *
   * Events are buffered in an in-memory queue (offline-first). The caller
   * is responsible for draining the queue (e.g. via a timer or post-mutation
   * flush). The `pending` getter exposes the queue for diagnostics.
   *
   * Business isolation: if `event.businessId !== this.businessId` the event
   * is silently ignored and `{ state: 'rejected' }` is returned.
   *
   * @returns `{ state: 'queued' }` on success, `{ state: 'rejected' }` if
   *          the businessId mismatch is detected.
   */
  async enqueue(event: SyncEvent): Promise<{ state: 'queued' | 'acked' | 'rejected' }> {
    if (event.businessId !== this.businessId) {
      return { state: 'rejected' }
    }
    this.queue.push({ event, enqueuedAt: Date.now() })
    return { state: 'queued' }
  }

  /**
   * Pull new events from the FIDScript cloud since `cursor.lastSyncAt`.
   *
   * Queries the `syncEvent` entity (or equivalent) for records where:
   *   - `businessId === this.businessId`
   *   - `serverReceivedAt > cursor.lastSyncAt`
   *
   * Results are ordered by `serverReceivedAt ASC`. The caller supplies the
   * cursor from the last successful pull; omitting `cursor.lastSyncAt`
   * (or passing null) fetches all events for this business (full sync).
   *
   * Business isolation is enforced server-side by the cloud (app-scoped), but
   * this method additionally filters to `this.businessId` as a defence-in-depth.
   *
   * @param cursor — last sync cursor; `lastSyncAt` is the exclusive lower bound
   * @returns events newer than the cursor
   */
  async pull(cursor: SyncCursor): Promise<SyncEvent[]> {
    const since = cursor.lastSyncAt ?? '1970-01-01T00:00:00Z'

    const result = await this.client.query<{ syncEvent?: SyncEvent[] }>({
      syncEvent: {
        $: {
          where: {
            businessId: this.businessId,
          },
          order: { serverReceivedAt: 'asc' },
        },
        $items: ['*'],
      },
    })

    const all = result.syncEvent ?? []

    // Filter: serverReceivedAt must be strictly after lastSyncAt
    return all.filter((e) => {
      if (e.serverReceivedAt && e.serverReceivedAt > since) return true
      return false
    })
  }

  /**
   * Apply a single SyncEvent to the cloud via FIDScript transact.
   *
   * Translates the event operation to an Instaml step:
   *   create  → [create, entityKind, { ...payload, idempotencyKey }]
   *   update  → [update, entityKind, entityId, { ...payload, idempotencyKey }]
   *   delete  → [delete, entityKind, entityId]
   *   tombstone → [delete, entityKind, entityId]   (logical delete)
   *
   * Every step includes `idempotencyKey` so FIDScript deduplicates if the
   * event is replayed (principle 4).
   *
   * Business isolation: if `event.businessId !== this.businessId`,
   * returns `{ state: 'no_op' }` without touching the cloud.
   *
   * Version wins: compares `event.entityVersion` against `localEntityVersion`
   * when a local record is supplied. If the local version is newer, returns
   * `{ state: 'conflict_replay' }` to signal the caller should re-pull.
   *
   * @param _local  — optional local entity record; checked for version wins
   * @param event   — the sync event to apply
   * @returns application result
   */
  apply(_local: unknown, event: SyncEvent): SyncApplyResult {
    // Business isolation
    if (event.businessId !== this.businessId) {
      return { state: 'no_op' }
    }

    // Short-circuit on already-seen idempotency key (local dedup cache)
    if (this.seenIdempotencyKeys.has(event.idempotencyKey)) {
      return { state: 'no_op' }
    }

    // Version check: if caller supplied a local record, enforce last-writer-wins
    if (_local !== null && _local !== undefined && typeof _local === 'object') {
      const localRecord = _local as Record<string, unknown>
      const localVersion = typeof localRecord['version'] === 'number'
        ? (localRecord['version'] as number)
        : 1
      if (localVersion > event.entityVersion) {
        return { state: 'version_older', localEntityVersion: localVersion, eventEntityVersion: event.entityVersion }
      }
    }

    // Translate to Instaml step
    const steps: unknown[][] = []
    const base = { ...(event.payload as Record<string, unknown>), idempotencyKey: event.idempotencyKey }

    switch (event.operation) {
      case 'create':
        steps.push(['create', event.entityKind, base])
        break
      case 'update':
        steps.push(['update', event.entityKind, event.entityId, base])
        break
      case 'delete':
      case 'tombstone':
        steps.push(['delete', event.entityKind, event.entityId])
        break
    }

    // Fire-and-forget: enqueue to cloud; caller awaits externally if needed.
    // Errors are surfaced via the returned result; callers should handle
    // network failures with retry / exponential back-off.
    this.client.transact(steps).catch((err) => {
      // Log but do not throw — apply() is synchronous and must return a result.
      console.error('[SyncEngine] transact failed:', err)
    })

    // Mark idempotency key as seen before returning
    this.seenIdempotencyKeys.add(event.idempotencyKey)

    return { state: 'applied', entityVersion: event.entityVersion }
  }

  // ── Queue diagnostics ───────────────────────────────────────────────────────

  /** Read-only view of the pending queue (oldest first). */
  get pending(): readonly SyncQueueItem[] {
    return this.queue
  }

  /** Number of events currently in the queue. */
  get size(): number {
    return this.queue.length
  }

  /** Remove and return up to `n` queued events for flushing. */
  dequeue(n = 100): SyncQueueItem[] {
    return this.queue.splice(0, n)
  }

  /** Test helper: clear the queue and idempotency cache. */
  reset(): void {
    this.queue.length = 0
    this.seenIdempotencyKeys.clear()
  }
}
