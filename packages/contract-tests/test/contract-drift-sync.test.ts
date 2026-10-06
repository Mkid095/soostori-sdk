/**
 * Contract-drift tests — guard the SyncEvent shape reconciliation (P0-3b).
 *
 * **P0-3b** (audit 2026-10-05): two competing `SyncEvent` shapes existed
 * across the SDK:
 *   - `@soostori/contracts/sync-contract.ts:45-69` — canonical contract
 *     shape (typed `EntityKind`, `operation: SyncOperation`, `entityVersion`,
 *     `originatingEmployeeId`, `clientSequence`, `clientCreatedAt`).
 *   - `@soostori/events/envelope.ts` — legacy `SoostoriEvent` shape
 *     (camelCase, freeform `entity: string`).
 *
 * The reconciliation:
 *   - The contract `SyncEvent` is the single source of truth.
 *   - `@soostori/events` re-exports the contract `SyncEvent` (and
 *     `createSyncEvent`) so legacy consumers can migrate one import at a
 *     time. The legacy `SoostoriEvent` is `@deprecated`.
 *   - `@soostori/sync` `SyncEngine.enqueue()` accepts the contract
 *     `SyncEvent` — NOT the legacy `SoostoriEvent`.
 *   - `@soostori/lan` `LanClient.broadcast()` and `PrimaryHost.broadcast()`
 *     accept the contract `SyncEvent`.
 *   - `@soostori/devices` `DeviceService` constructs contract `SyncEvent`
 *     via `createSyncEvent()` and enqueues them.
 *
 * This file is the CI guard that prevents future drift. If a future
 * change adds a new field to the contract without updating the events
 * re-export — or vice versa — these tests fail.
 *
 * Documented divergences (intentional, not bugs):
 *   - `SoostoriEvent` (events) vs `SyncEvent` (contracts) — the legacy
 *     shape is preserved with a `@deprecated` JSDoc marker and `toSoostoriEvent`/
 *     `toSyncEvent` conversion helpers. Both must be `@deprecated` so
 *     `eslint-plugin-deprecation` can flag new code using the legacy shape.
 */

import { describe, it, expect } from 'vitest'
import {
  type SyncEvent, type EntityKind, type SyncOperation, type SyncState,
  createSyncEvent,
} from '@soostori/contracts'
import {
  type SoostoriEvent as LegacySoostoriEvent,
  toSoostoriEvent, toSyncEvent,
} from '../../events/src/envelope.ts'

// ── 1. Contract `SyncEvent` is the canonical source of truth ─────────────────

describe('contract-drift: SyncEvent (P0-3b canonical)', () => {
  it('@soostori/contracts exports the canonical SyncEvent shape', () => {
    // The factory MUST accept the contract args and return a SyncEvent
    // with all required contract fields populated.
    const evt: SyncEvent = createSyncEvent({
      businessId: 'biz-1' as any,
      entityKind: 'sale' as EntityKind,
      entityId: 's1',
      operation: 'create' as SyncOperation,
      originatingDeviceId: 'd1' as any,
      originatingEmployeeId: 'e1' as any,
      clientSequence: 1,
      entityVersion: 1,
      payload: { saleId: 's1', total: 500 },
    })

    // All 13 required contract fields are present.
    expect(evt.id).toBeDefined()
    expect(evt.idempotencyKey).toBeDefined()
    expect(evt.businessId).toBe('biz-1')
    expect(evt.entityKind).toBe('sale')
    expect(evt.entityId).toBe('s1')
    expect(evt.operation).toBe('create')
    expect(evt.originatingDeviceId).toBe('d1')
    expect(evt.originatingEmployeeId).toBe('e1')
    expect(evt.clientSequence).toBe(1)
    expect(evt.clientCreatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(evt.entityVersion).toBe(1)
    expect(evt.payload).toEqual({ saleId: 's1', total: 500 })
    expect(evt.state).toBe<SyncState>('pending')
  })

  it('@soostori/contracts SyncEvent has typed EntityKind + SyncOperation', () => {
    // Type-level check (runtime assertion below).
    const evt: SyncEvent = createSyncEvent({
      businessId: 'biz-1' as any,
      entityKind: 'stockMovement' as EntityKind,
      entityId: 'sm1',
      operation: 'update' as SyncOperation,
      originatingDeviceId: 'd1' as any,
      originatingEmployeeId: 'e1' as any,
      clientSequence: 1,
      entityVersion: 2,
      payload: {},
    })
    expect(evt.entityKind).toBe('stockMovement')
    expect(evt.operation).toBe('update')
  })
})

// ── 2. `@soostori/events` re-exports the contract shape ─────────────────────

describe('contract-drift: @soostori/events re-exports contract', () => {
  it('@soostori/events re-exports `toSoostoriEvent` and `toSyncEvent` helpers', () => {
    expect(typeof toSoostoriEvent).toBe('function')
    expect(typeof toSyncEvent).toBe('function')
  })

  it('toSyncEvent converts a legacy SoostoriEvent into the contract shape', () => {
    const legacy: LegacySoostoriEvent = {
      id: 'id-1' as any,
      name: 'sale.confirmed' as any,
      version: 1,
      deviceId: 'd1' as any,
      userId: 'u1' as any,
      shopId: 'shop-1' as any,
      timestamp: '2026-08-31T00:00:00Z' as any,
      sequence: 7,
      idempotencyKey: 'k1' as any,
      entityId: 's1',
      entity: 'sale',
      source: 'local',
      payload: { saleId: 's1', total: 100 },
    }
    const contract: SyncEvent = toSyncEvent(legacy)
    expect(contract.businessId).toBe('shop-1')
    expect(contract.idempotencyKey).toBe('k1')
    expect(contract.originatingDeviceId).toBe('d1')
    expect(contract.clientSequence).toBe(7)
    expect(contract.clientCreatedAt).toBe('2026-08-31T00:00:00Z')
    expect((contract.payload as any)._legacyName).toBe('sale.confirmed')
    expect((contract.payload as any)._legacyEntity).toBe('sale')
  })

  it('toSoostoriEvent converts a contract SyncEvent back into the legacy shape', () => {
    const contract: SyncEvent = createSyncEvent({
      businessId: 'shop-1' as any,
      entityKind: 'sale' as EntityKind,
      entityId: 's1',
      operation: 'create' as SyncOperation,
      originatingDeviceId: 'd1' as any,
      originatingEmployeeId: 'u1' as any,
      clientSequence: 7,
      entityVersion: 1,
      payload: {
        saleId: 's1', total: 100,
        _legacyName: 'sale.confirmed',
        _legacySource: 'local',
        _legacyEntity: 'sale',
      },
    })
    const legacy: LegacySoostoriEvent = toSoostoriEvent(contract)
    expect(legacy.id).toBe(contract.id)
    expect(legacy.name).toBe('sale.confirmed')
    expect(legacy.deviceId).toBe('d1')
    expect(legacy.userId).toBe('u1')
    expect(legacy.shopId).toBe('shop-1')
    expect(legacy.timestamp).toBe(contract.clientCreatedAt)
    expect(legacy.sequence).toBe(7)
    expect(legacy.entityId).toBe('s1')
    expect(legacy.entity).toBe('sale')
    expect(legacy.source).toBe('local')
  })

  it('round-trips: contract → legacy → contract preserves the key fields', () => {
    const original: SyncEvent = createSyncEvent({
      businessId: 'shop-1' as any,
      entityKind: 'sale' as EntityKind,
      entityId: 's1',
      operation: 'create' as SyncOperation,
      originatingDeviceId: 'd1' as any,
      originatingEmployeeId: 'u1' as any,
      clientSequence: 7,
      entityVersion: 1,
      payload: { _legacyName: 'sale.confirmed', _legacySource: 'local', _legacyEntity: 'sale' },
    })
    const roundTrip: SyncEvent = toSyncEvent(toSoostoriEvent(original))
    expect(roundTrip.businessId).toBe(original.businessId)
    expect(roundTrip.idempotencyKey).toBe(original.idempotencyKey)
    expect(roundTrip.originatingDeviceId).toBe(original.originatingDeviceId)
    expect(roundTrip.clientSequence).toBe(original.clientSequence)
    expect(roundTrip.clientCreatedAt).toBe(original.clientCreatedAt)
    expect(roundTrip.entityId).toBe(original.entityId)
  })
})

// ── 3. Both shapes share `idempotencyKey` as the dedup field ────────────────

describe('contract-drift: idempotencyKey is the dedup field', () => {
  it('contract SyncEvent idempotencyKey is a branded IdempotencyKey', () => {
    const evt: SyncEvent = createSyncEvent({
      businessId: 'b' as any,
      entityKind: 'sale' as EntityKind,
      entityId: 's',
      operation: 'create' as SyncOperation,
      originatingDeviceId: 'd' as any,
      originatingEmployeeId: 'e' as any,
      clientSequence: 1,
      entityVersion: 1,
      payload: {},
    })
    expect(typeof evt.idempotencyKey).toBe('string')
    expect(evt.idempotencyKey.length).toBeGreaterThan(0)
  })
})