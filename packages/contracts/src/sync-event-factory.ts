/**
 * SyncEvent factory — canonical constructor for `SyncEvent`.
 *
 * Implements Cycle 04 brief §6 (identity, idempotency, ordering, server
 * timestamps, retry, conflict-resolution). The factory assigns every
 * required field of the contract `SyncEvent` and returns a fully-typed
 * record. It is the single source of truth for SyncEvent construction;
 * downstream packages (sync, events, lan) MUST use this factory instead
 * of hand-rolling the object literal.
 *
 * Why a dedicated factory:
 *   - The contract has 13 required fields — easy to miss one in an
 *     inline literal.
 *   - `id` (UUIDv7 / UUID) and `idempotencyKey` (IdempotencyKey) are
 *     branded IDs that should be assigned by the brand, not by string.
 *   - `clientSequence` and `entityVersion` are monotonically tracked;
 *     the factory lets the caller pass them in but defaults to a safe
 *     value if not provided.
 *   - `state` defaults to `'pending'` on creation; the cloud sets it to
 *     `'acked' | 'rejected' | 'replayed'` on the server reply.
 *
 * See `./sync-contract.ts` for the field semantics.
 */

import {
  newId, type SyncEventId, type IdempotencyKey, type BusinessId,
  type DeviceId, type EmployeeId, type ISO8601,
} from '@soostori/core'
import type {
  SyncOperation, SyncState, EntityKind, SyncPayload,
} from './sync-contract-parts.js'
import type { SyncEvent } from './sync-contract.js'

/**
 * Per-device monotonic counter. Persisted in `OfflineQueueItem` so the
 * next event continues from `lastEvent + 1`. SyncEngine owns the
 * counter, not the factory — the factory accepts the caller-supplied
 * value as-is.
 */
export interface CreateSyncEventArgs {
  businessId: BusinessId
  entityKind: EntityKind
  entityId: string
  operation: SyncOperation
  originatingDeviceId: DeviceId
  originatingEmployeeId: EmployeeId
  clientSequence: number
  entityVersion: number
  payload: SyncPayload
  /** Optional override for the event id. Defaults to a fresh UUID. */
  idempotencyKey?: IdempotencyKey
  /** Optional override for `clientCreatedAt`. Defaults to ISO now. */
  clientCreatedAt?: ISO8601
  /** Optional `correlationId` for compensating ops. */
  correlationId?: SyncEventId | null
  /** Lifecycle state. Defaults to `'pending'`. */
  state?: SyncState
  /** Optional pre-existing id (for re-constructing from persisted queue). */
  id?: SyncEventId
}

/**
 * Construct a canonical `SyncEvent`. Every required field of the
 * contract is assigned; only `serverReceivedAt` and `correlationId`
 * are left to the caller (both are server-set / compensating-op).
 *
 * The returned object is a plain record — callers may add additional
 * fields (e.g. `entityVersion`) before passing to the engine, but the
 * factory never sets `serverReceivedAt` (that is server-only).
 */
export function createSyncEvent(args: CreateSyncEventArgs): SyncEvent {
  const event: SyncEvent = {
    id: args.id ?? (newId() as SyncEventId),
    idempotencyKey: args.idempotencyKey ?? (newId() as IdempotencyKey),
    businessId: args.businessId,
    entityKind: args.entityKind,
    entityId: args.entityId,
    operation: args.operation,
    originatingDeviceId: args.originatingDeviceId,
    originatingEmployeeId: args.originatingEmployeeId,
    clientSequence: args.clientSequence,
    clientCreatedAt: args.clientCreatedAt ?? new Date().toISOString() as ISO8601,
    entityVersion: args.entityVersion,
    payload: args.payload,
    correlationId: args.correlationId ?? null,
    state: args.state ?? 'pending',
  }
  return event
}