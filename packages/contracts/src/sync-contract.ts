/**
 * Sync / event contract — SyncEvent + SyncEngine + SyncEngineClass.
 *
 * Implements Cycle 04 brief §6. Types live in `./sync-contract-parts.ts`;
 * this file re-exports them and adds the engine interface + implementations.
 *
 * Cycle 05 upgrades the default export from `NoOpSyncEngine` to a real
 * `SyncEngineClass` instance backed by a `NoopInstantClient` placeholder.
 * Apps inject the real `InstantClient` (FIDScript client) at startup.
 */

import type {
  SyncEventId, IdempotencyKey, BusinessId,
  DeviceId, EmployeeId, ISO8601, SyncCursorId,
} from '@soostori/core'
import type {
  SyncOperation, SyncState, EntityKind, SyncPayload,
} from './sync-contract-parts.js'

export type {
  SyncOperation, SyncState, EntityKind, SyncPayload, UnknownSyncPayload,
} from './sync-contract-parts.js'

// ── SyncEvent — the canonical change record (§6) ──────────────────────────────
/**
 * SyncEvent — every entity mutation that travels across platforms goes
 * through this shape. Per Cycle 04 brief §6.
 *
 * Required (in-order application):
 *   1. `id`            : UUIDv7 — time-ordered, globally unique
 *   2. `idempotencyKey`: dedup at consumer + cloud
 *   3. `businessId`    : every event is tenant-scoped (§7)
 *   4. `entityKind`    : one of `EntityKind`
 *   5. `entityId`      : row the event applies to
 *   6. `operation`     : 'create'|'update'|'delete'|'tombstone'
 *   7. `originatingDeviceId` + `originatingEmployeeId`
 *   8. `clientSequence`: per-device monotonic; ordering within a device
 *   9. `clientCreatedAt` + `serverReceivedAt?` (server-set on commit)
 *  10. `entityVersion` : entity-level version for last-writer-wins
 *  11. `payload`       : opaque projection
 *  12. `state`         : pending|acked|rejected|replayed
 *
 * Optional: `correlationId` for compensating ops (e.g. cancel-after-failure).
 */
export interface SyncEvent {
  /** SyncEventId — UUIDv7; ordered by time at issuer. */
  id: SyncEventId
  /** Per (deviceId, employeeId, op) — guarantees dedup on replay. */
  idempotencyKey: IdempotencyKey
  businessId: BusinessId
  entityKind: EntityKind
  entityId: string
  operation: SyncOperation
  originatingDeviceId: DeviceId
  originatingEmployeeId: EmployeeId
  /** Per-device monotonic. */
  clientSequence: number
  /** Set on originating device when the event was created. */
  clientCreatedAt: ISO8601
  /** Set by the cloud on commit; read by all consumers. */
  serverReceivedAt?: ISO8601 | null
  /** Entity-level version (consumer applies if own < remote). */
  entityVersion: number
  /** Opaque entity-specific projection. */
  payload: SyncPayload
  /** Optional: id of the SyncEvent this one compensates. */
  correlationId?: SyncEventId | null
  state: SyncState
}

// ── SyncCursor + Apply ────────────────────────────────────────────────────────

/** Cursor — last successful pull point for a (device, business) pair. */
export interface SyncCursor {
  cursorId: SyncCursorId
  deviceId: DeviceId
  businessId: BusinessId
  /** Last `(serverReceivedAt, originatingDeviceId, clientSequence)` triple seen. */
  lastServerReceivedAt?: ISO8601 | null
  lastOriginatingDeviceId?: DeviceId | null
  lastClientSequence?: number | null
  lastSyncAt: ISO8601
}

/**
 * SyncApplyResult — outcome of `applySyncEvent(local, event)`.
 *
 * - `no_op`             : event was already applied (idempotent replay)
 * - `applied`           : local row replaced by the event payload
 * - `conflict_replay`   : local is newer than event; consumer must re-pull
 * - `version_older`     : event.entityVersion < local.entityVersion; ignore
 */
export type SyncApplyResult =
  | { state: 'no_op' }
  | { state: 'applied'; entityVersion: number }
  | { state: 'conflict_replay'; localEntityVersion: number }
  | { state: 'version_older'; localEntityVersion: number; eventEntityVersion: number }

// ── SyncEngine interface ──────────────────────────────────────────────────────

/**
 * SyncEngine — the contract every platform/engine implementation MUST satisfy.
 *
 * Cycle 04 ships only `NoOpSyncEngine` (below). The full implementation is
 * delivered in a later feature/platform cycle.
 */
export interface SyncEngine {
  /** Queue an event for transmission to the cloud. */
  enqueue(event: SyncEvent): Promise<{ state: 'queued' | 'acked' | 'rejected' }>
  /** Pull new events from the cloud since `cursor`. */
  pull(cursor: SyncCursor): Promise<SyncEvent[]>
  /** Apply a single event to a local row. Idempotent on `idempotencyKey`. */
  apply(local: unknown, event: SyncEvent): SyncApplyResult
}

// ── NoOpSyncEngine — documented stub ──────────────────────────────────────────

/**
 * NoOpSyncEngine — stub implementation per Cycle 04 Sub-cycle A brief.
 *
 * Always returns the documented responses:
 *   - enqueue → `{ state: 'queued' }`
 *   - pull    → `[]`
 *   - apply   → `{ state: 'no_op' }`
 *
 * Back-compat re-export of the class instance. The full implementation
 * (queue introspection, `defaultSyncEngine` singleton, class form) lives
 * in `./sync-stub.ts`. The shape is the contract; the behaviour is
 * intentionally minimal so feature work can call
 * `syncEngine.enqueue(event)` without depending on a real backend.
 */
export { NoOpSyncEngine, NoOpSyncEngineClass, defaultSyncEngine, type QueuedSyncEvent } from './sync-stub.js'

// ── Real SyncEngine (Cycle 05) ────────────────────────────────────────────────
//
// NOTE: SyncEngineClass is NOT re-exported from this file to avoid a circular
// import chain (data-contract.ts → sync-contract.ts → sync-engine.ts → sync-contract.ts).
// It is re-exported directly from index.ts instead.
