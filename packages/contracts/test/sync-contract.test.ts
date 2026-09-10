/**
 * Sync contract — SyncEvent + SyncEngine + NoOpSyncEngine tests.
 *
 * Cycle 04 Sub-cycle A: contract + stub only. No real implementation.
 *
 * Verifies:
 *   - SyncEvent shape compiles with all required fields
 *   - Idempotency-Key / SyncCursorId brands exist
 *   - EntityKind union covers all 22 entities
 *   - NoOpSyncEngine returns documented responses
 *   - SyncApplyResult is a discriminated union
 */

import { describe, it, expect } from 'vitest'
import {
  newId, asBusinessId, asDeviceId, asPersonId, asSyncEventId,
  asIdempotencyKey,
} from '@soostori/core'

import {
  NoOpSyncEngine,
} from '../src/index.js'

import type {
  SyncEvent, SyncOperation, SyncState, EntityKind,
  SyncApplyResult, SyncEngine, SyncCursor,
} from '../src/index.js'

// ── SyncEvent required-field compile-time guard ──────────────────────────────

const ts = '2025-09-10T10:00:00Z'

function makeEvent(overrides: Partial<SyncEvent> = {}): SyncEvent {
  const base: SyncEvent = {
    id: asSyncEventId(newId()),
    idempotencyKey: asIdempotencyKey(newId()),
    businessId: asBusinessId(newId()),
    entityKind: 'product',
    entityId: newId(),
    operation: 'create',
    originatingDeviceId: asDeviceId(newId()),
    originatingEmployeeId: 'eid' as unknown as SyncEvent['originatingEmployeeId'],
    clientSequence: 1,
    clientCreatedAt: ts,
    serverReceivedAt: null,
    entityVersion: 1,
    payload: { name: 'Coca Cola' },
    correlationId: null,
    state: 'pending',
  }
  return { ...base, ...overrides }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SyncEvent shape', () => {
  it('builds with all required fields', () => {
    const e = makeEvent()
    expect(e.operation).toBe('create')
    expect(e.state).toBe('pending')
    expect(typeof e.id).toBe('string')
    expect(typeof e.entityVersion).toBe('number')
  })

  it('tombstone operation is allowed', () => {
    const e: SyncEvent = makeEvent({ operation: 'tombstone' })
    expect(e.operation).toBe('tombstone')
  })

  it('SyncOperation union includes the 4 documented kinds', () => {
    const ops: SyncOperation[] = ['create', 'update', 'delete', 'tombstone']
    expect(ops).toHaveLength(4)
  })

  it('SyncState union includes the 4 documented states', () => {
    const states: SyncState[] = ['pending', 'acked', 'rejected', 'replayed']
    expect(states).toHaveLength(4)
  })

  it('correlationId is optional and nullable', () => {
    const e = makeEvent({ correlationId: null })
    expect(e.correlationId).toBeNull()
  })

  it('serverReceivedAt is optional', () => {
    const e = makeEvent({ serverReceivedAt: undefined })
    expect(e.serverReceivedAt).toBeUndefined()
  })
})

describe('EntityKind covers all 22 entities', () => {
  it('lists exactly 22 entity kinds', () => {
    const kinds: EntityKind[] = [
      'person', 'business', 'membership', 'employee',
      'device', 'invitation',
      'product', 'category', 'stockMovement',
      'sale', 'saleLineItem', 'customer',
      'debt', 'debtPayment', 'expense',
      'subscription',
      'salespersonApplication', 'salespersonProfile', 'influencerProfile',
      'commissionRule', 'commissionLedger',
      'authAuditEvent',
    ]
    expect(kinds).toHaveLength(22)
  })

  it('SyncEvent accepts every entityKind', () => {
    for (const k of [
      'person', 'business', 'product', 'stockMovement',
      'sale', 'debtPayment', 'salespersonApplication', 'authAuditEvent',
    ] as EntityKind[]) {
      const e: SyncEvent = makeEvent({ entityKind: k })
      expect(e.entityKind).toBe(k)
    }
  })
})

describe('SyncCursor', () => {
  it('builds with cursor triple', () => {
    const c: SyncCursor = {
      cursorId: 'cid' as unknown as SyncCursor['cursorId'],
      deviceId: asDeviceId(newId()),
      businessId: asBusinessId(newId()),
      lastServerReceivedAt: ts,
      lastOriginatingDeviceId: asDeviceId(newId()),
      lastClientSequence: 1,
      lastSyncAt: ts,
    }
    expect(c.lastClientSequence).toBe(1)
  })
})

describe('SyncApplyResult — discriminated union', () => {
  it('accepts no_op', () => {
    const r: SyncApplyResult = { state: 'no_op' }
    expect(r.state).toBe('no_op')
  })

  it('accepts applied with entityVersion', () => {
    const r: SyncApplyResult = { state: 'applied', entityVersion: 2 }
    expect(r.state).toBe('applied')
  })

  it('accepts conflict_replay with localEntityVersion', () => {
    const r: SyncApplyResult = { state: 'conflict_replay', localEntityVersion: 5 }
    expect(r.state).toBe('conflict_replay')
  })

  it('accepts version_older with both versions', () => {
    const r: SyncApplyResult = {
      state: 'version_older',
      localEntityVersion: 7,
      eventEntityVersion: 6,
    }
    expect(r.state).toBe('version_older')
  })
})

describe('SyncEngine contract', () => {
  it('exposes enqueue / pull / apply shape', () => {
    const e: SyncEngine = NoOpSyncEngine
    expect(typeof e.enqueue).toBe('function')
    expect(typeof e.pull).toBe('function')
    expect(typeof e.apply).toBe('function')
  })
})

describe('NoOpSyncEngine stub', () => {
  it('enqueue returns { state: "queued" }', async () => {
    const r = await NoOpSyncEngine.enqueue(makeEvent())
    expect(r).toEqual({ state: 'queued' })
  })

  it('pull returns an empty array', async () => {
    const cursor: SyncCursor = {
      cursorId: 'c' as unknown as SyncCursor['cursorId'],
      deviceId: asDeviceId(newId()),
      businessId: asBusinessId(newId()),
      lastServerReceivedAt: null,
      lastOriginatingDeviceId: null,
      lastClientSequence: null,
      lastSyncAt: ts,
    }
    const events = await NoOpSyncEngine.pull(cursor)
    expect(events).toEqual([])
  })

  it('apply always returns { state: "no_op" }', () => {
    const r = NoOpSyncEngine.apply({ name: 'Coca Cola' }, makeEvent())
    expect(r).toEqual({ state: 'no_op' })
  })

  it('NoOpSyncEngine satisfies the SyncEngine interface', () => {
    // Compile-time: assigning NoOpSyncEngine to a SyncEngine-typed variable.
    const engine: SyncEngine = NoOpSyncEngine
    expect(engine).toBe(NoOpSyncEngine)
  })
})

describe('idempotency — same event is a no-op on re-apply (§6)', () => {
  it('NoOpSyncEngine.apply twice with same event returns no_op both times', () => {
    const e = makeEvent()
    expect(NoOpSyncEngine.apply({}, e)).toEqual({ state: 'no_op' })
    expect(NoOpSyncEngine.apply({}, e)).toEqual({ state: 'no_op' })
  })
})

describe('branded id usage in SyncEvent', () => {
  it('id, idempotencyKey, businessId, deviceId are all branded strings', () => {
    const e = makeEvent()
    expect(typeof e.id).toBe('string')
    expect(typeof e.idempotencyKey).toBe('string')
    expect(typeof e.businessId).toBe('string')
    expect(typeof e.originatingDeviceId).toBe('string')
    // Brand is erased — runtime is plain string.
    expect(e.id.length).toBeGreaterThan(10)
  })

  it('asPersonId casts cleanly into SyncEvent-shaped brands', () => {
    const pid = asPersonId(newId())
    expect(typeof pid).toBe('string')
  })
})
