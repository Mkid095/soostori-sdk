/**
 * Sync / event contract — types only (no engine implementation).
 *
 * Implements Cycle 04 brief §6 (SyncEvent identity, idempotency, ordering,
 * server timestamps, retry, conflict-resolution principles).
 *
 * The actual engine is shipped in a later feature/platform cycle. Cycle 04
 * defines the contract + a NoOpSyncEngine stub that applications can call.
 */

import type {
  SyncEventId, IdempotencyKey, BusinessId,
  DeviceId, EmployeeId, ISO8601, SyncCursorId,
} from '@soostori/core'

// ── Brand re-export (for downstream typing) ──────────────────────────────────
export type { IdempotencyKey, SyncCursorId } from '@soostori/core'

// ── Enums ─────────────────────────────────────────────────────────────────────

/** SyncEvent write operation. `tombstone` is a logical delete (§6). */
export type SyncOperation = 'create' | 'update' | 'delete' | 'tombstone'

/**
 * SyncEvent lifecycle state.
 *
 * - pending    : enqueued locally, awaiting acknowledgement
 * - acked      : cloud accepted (serverReceivedAt set)
 * - rejected   : cloud rejected (validation / scope)
 * - replayed   : re-applied after reconnect; idempotent by `idempotencyKey`
 */
export type SyncState = 'pending' | 'acked' | 'rejected' | 'replayed'

/**
 * EntityKind — the entity a SyncEvent describes. Must match one of the 22
 * canonical entities defined in `data-contract-*.ts`.
 */
export type EntityKind =
  | 'person' | 'business' | 'membership' | 'employee'
  | 'device' | 'invitation'
  | 'product' | 'category' | 'stockMovement'
  | 'sale' | 'saleLineItem' | 'customer'
  | 'debt' | 'debtPayment' | 'expense'
  | 'subscription'
  | 'salespersonApplication' | 'salespersonProfile' | 'influencerProfile'
  | 'commissionRule' | 'commissionLedger'
  | 'authAuditEvent'

// ── Payload ───────────────────────────────────────────────────────────────────

/**
 * SyncPayload — opaque, entity-specific projection of the entity state at the
 * moment of the event. SDK consumers may cast to the entity-specific
 * `XxxSyncPayload` (defined in per-entity files, not in this contract).
 */
export type SyncPayload = Record<string, unknown>
/** Fallback when the recipient has no entity-specific projection. */
export type UnknownSyncPayload = SyncPayload
