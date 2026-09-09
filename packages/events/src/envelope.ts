/**
 * Canonical event envelope — every event in the system uses this shape.
 *
 * Cross-app/cross-channel contract: any consumer (sync, notification, audit)
 * can read any envelope without knowing the source application.
 *
 * @example
 *   const evt: SoostoriEvent<SaleConfirmedPayload> = {
 *     id: '...',
 *     name: SALE_CONFIRMED,
 *     shopId: '...',
 *     deviceId: '...',
 *     timestamp: '2026-08-31T...',
 *     version: 1,
 *     payload: { saleId, total, items },
 *     idempotencyKey: '...',
 *   }
 */

import { newId, type ISO8601, type UUID, type ShopId, type DeviceId, type UserId } from '@soostori/core'
import type { SoostoriEventName } from './catalog.js'

export interface SoostoriEvent<T = unknown> {
  /** UUID v4 — unique across all events. */
  id: UUID
  /** Event name from @soostori/events catalog. */
  name: SoostoriEventName
  /** Schema version (incremented on breaking changes to envelope). */
  version: number
  /** Originator device. */
  deviceId: DeviceId
  /** Originator user (optional — system events may not have one). */
  userId?: UserId
  /** Shop context. */
  shopId: ShopId
  /** ISO 8601 timestamp. */
  timestamp: ISO8601
  /** Monotonic version for ordering. */
  sequence: number
  /** UUID — prevents duplicate processing on replay/reconnect. */
  idempotencyKey: UUID
  /** Business ID of related entity (e.g., sale id, product id). */
  entityId?: string
  /** Entity type this event refers to (e.g., 'sale', 'product'). */
  entity?: string
  /** Source channel of the event. */
  source: 'local' | 'lan' | 'cloud' | 'system'
  /** Event-specific payload (must match the schema for `name`). */
  payload: T
}

/** Construct a new event envelope with sensible defaults. */
export function createEvent<T>(args: {
  name: SoostoriEventName
  shopId: ShopId
  deviceId: DeviceId
  payload: T
  userId?: UserId
  entityId?: string
  entity?: string
  source?: SoostoriEvent['source']
  sequence?: number
}): SoostoriEvent<T> {
  const id = newId() as UUID
  return {
    id,
    name: args.name,
    version: 1,
    deviceId: args.deviceId,
    userId: args.userId,
    shopId: args.shopId,
    timestamp: new Date().toISOString(),
    sequence: args.sequence ?? Date.now(),
    idempotencyKey: newId() as UUID,
    entityId: args.entityId,
    entity: args.entity,
    source: args.source ?? 'local',
    payload: args.payload,
  }
}

/** Compare two events by sequence + timestamp (canonical ordering). */
export function isEventBefore(a: SoostoriEvent, b: SoostoriEvent): boolean {
  if (a.sequence !== b.sequence) return a.sequence < b.sequence
  return a.timestamp < b.timestamp
}

/** Check if two events are equivalent (idempotency). */
export function isSameEvent(a: SoostoriEvent, b: SoostoriEvent): boolean {
  return a.idempotencyKey === b.idempotencyKey
}
