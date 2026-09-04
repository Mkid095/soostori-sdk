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
import { newId } from '@soostori/core';
/** Construct a new event envelope with sensible defaults. */
export function createEvent(args) {
    const id = newId();
    return {
        id,
        name: args.name,
        version: 1,
        deviceId: args.deviceId,
        userId: args.userId,
        shopId: args.shopId,
        timestamp: new Date().toISOString(),
        sequence: args.sequence ?? Date.now(),
        idempotencyKey: newId(),
        entityId: args.entityId,
        entity: args.entity,
        source: args.source ?? 'local',
        payload: args.payload,
    };
}
/** Compare two events by sequence + timestamp (canonical ordering). */
export function isEventBefore(a, b) {
    if (a.sequence !== b.sequence)
        return a.sequence < b.sequence;
    return a.timestamp < b.timestamp;
}
/** Check if two events are equivalent (idempotency). */
export function isSameEvent(a, b) {
    return a.idempotencyKey === b.idempotencyKey;
}
//# sourceMappingURL=envelope.js.map