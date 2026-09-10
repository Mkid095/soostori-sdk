/**
 * Sync round-trip + NoOp tests — Cycle 04 Sub-cycle E.
 *
 * Verifies:
 *   1. NoOpSyncEngine.enqueue stores the event with `state: 'pending'`
 *      and reports `{ state: 'queued' }`
 *   2. NoOpSyncEngine.pull with any cursor returns `[]`
 *   3. NoOpSyncEngine.apply with any (local, event) returns `{ state: 'no_op' }`
 *   4. For three canonical entities (Product, Sale, Customer) a SyncEvent
 *      typed against the entity payload compiles AND survives the
 *      enqueue → pull → apply round-trip
 *   5. `defaultSyncEngine` is the same singleton shape apps import today
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  newId, asBusinessId, asDeviceId, asProductId, asSaleId,
  asCustomerId, asSyncEventId, asIdempotencyKey, asEmployeeId,
} from '@soostori/core'

import {
  NoOpSyncEngineClass, NoOpSyncEngine, defaultSyncEngine,
} from '../src/index.js'

import type {
  SyncEvent, SyncCursor, Product, Sale, Customer,
} from '../src/index.js'

// ── Shared fixtures ──────────────────────────────────────────────────────────

const ts = '2026-09-10T10:00:00Z'

function makeCursor(): SyncCursor {
  return {
    cursorId: 'cid' as unknown as SyncCursor['cursorId'],
    deviceId: asDeviceId(newId()),
    businessId: asBusinessId(newId()),
    lastServerReceivedAt: null,
    lastOriginatingDeviceId: null,
    lastClientSequence: null,
    lastSyncAt: ts,
  }
}

function makeEvent(
  entityKind: SyncEvent['entityKind'],
  entityId: string,
  payload: Record<string, unknown>,
): SyncEvent {
  return {
    id: asSyncEventId(newId()),
    idempotencyKey: asIdempotencyKey(newId()),
    businessId: asBusinessId(newId()),
    entityKind,
    entityId,
    operation: 'create',
    originatingDeviceId: asDeviceId(newId()),
    originatingEmployeeId: asEmployeeId(newId()),
    clientSequence: 1,
    clientCreatedAt: ts,
    serverReceivedAt: null,
    entityVersion: 1,
    payload,
    correlationId: null,
    state: 'pending',
  }
}

// ── NoOpSyncEngine stub contract tests ───────────────────────────────────────

describe('NoOpSyncEngineClass.enqueue', () => {
  let engine: NoOpSyncEngineClass
  beforeEach(() => { engine = new NoOpSyncEngineClass() })

  it('returns { state: "queued" }', async () => {
    const r = await engine.enqueue(makeEvent('product', newId(), { name: 'X' }))
    expect(r).toEqual({ state: 'queued' })
  })

  it('stores the event with state "pending"', async () => {
    const e = makeEvent('product', newId(), { name: 'X' })
    await engine.enqueue(e)
    expect(engine.size).toBe(1)
    expect(engine.pending[0]?.event.state).toBe('pending')
    expect(engine.pending[0]?.event.id).toBe(e.id)
  })

  it('appends in order; multiple events all queued', async () => {
    await engine.enqueue(makeEvent('product', newId(), { name: 'A' }))
    await engine.enqueue(makeEvent('product', newId(), { name: 'B' }))
    await engine.enqueue(makeEvent('sale', newId(), { name: 'C' }))
    expect(engine.size).toBe(3)
    expect((engine.pending[0]?.event.payload as { name: string }).name).toBe('A')
    expect((engine.pending[1]?.event.payload as { name: string }).name).toBe('B')
    expect((engine.pending[2]?.event.payload as { name: string }).name).toBe('C')
  })

  it('reset() clears the queue', async () => {
    await engine.enqueue(makeEvent('product', newId(), {}))
    engine.reset()
    expect(engine.size).toBe(0)
  })
})

describe('NoOpSyncEngineClass.pull', () => {
  it('with any cursor returns []', async () => {
    const engine = new NoOpSyncEngineClass()
    expect(await engine.pull(makeCursor())).toEqual([])
    expect(await engine.pull({
      cursorId: 'any' as unknown as SyncCursor['cursorId'],
      deviceId: asDeviceId(newId()),
      businessId: asBusinessId(newId()),
      lastServerReceivedAt: '2020-01-01T00:00:00Z',
      lastOriginatingDeviceId: asDeviceId(newId()),
      lastClientSequence: 999,
      lastSyncAt: ts,
    })).toEqual([])
  })
})

describe('NoOpSyncEngineClass.apply', () => {
  it('returns { state: "no_op" } for any (local, event)', () => {
    const engine = new NoOpSyncEngineClass()
    const e = makeEvent('product', newId(), { name: 'X' })
    expect(engine.apply({}, e)).toEqual({ state: 'no_op' })
    expect(engine.apply({ row: 1 }, e)).toEqual({ state: 'no_op' })
    expect(engine.apply(null, e)).toEqual({ state: 'no_op' })
  })

  it('preserves idempotency — applying twice returns no_op both times', () => {
    const engine = new NoOpSyncEngineClass()
    const e = makeEvent('product', newId(), {})
    expect(engine.apply({}, e)).toEqual({ state: 'no_op' })
    expect(engine.apply({}, e)).toEqual({ state: 'no_op' })
  })
})

describe('NoOpSyncEngine (back-compat const singleton)', () => {
  it('exposes the SyncEngine surface as plain methods', async () => {
    expect(typeof NoOpSyncEngine.enqueue).toBe('function')
    expect(typeof NoOpSyncEngine.pull).toBe('function')
    expect(typeof NoOpSyncEngine.apply).toBe('function')
  })

  it('returns { state: "queued" } from enqueue', async () => {
    const r = await NoOpSyncEngine.enqueue(makeEvent('product', newId(), {}))
    expect(r).toEqual({ state: 'queued' })
  })

  it('returns [] from pull', async () => {
    expect(await NoOpSyncEngine.pull(makeCursor())).toEqual([])
  })

  it('returns { state: "no_op" } from apply', () => {
    expect(NoOpSyncEngine.apply({}, makeEvent('product', newId(), {})))
      .toEqual({ state: 'no_op' })
  })
})

describe('defaultSyncEngine', () => {
  it('is an instance of NoOpSyncEngineClass and satisfies SyncEngine', async () => {
    expect(defaultSyncEngine).toBeInstanceOf(NoOpSyncEngineClass)
    expect(typeof defaultSyncEngine.enqueue).toBe('function')
    expect(typeof defaultSyncEngine.pull).toBe('function')
    expect(typeof defaultSyncEngine.apply).toBe('function')
    const r = await defaultSyncEngine.enqueue(makeEvent('product', newId(), {}))
    expect(r.state).toBe('queued')
  })
})

// ── SyncEvent round-trip per canonical entity ────────────────────────────────
//
// For three of the 22 canonical entities, construct an entity-typed payload,
// build a SyncEvent with that payload, exercise the full lifecycle, and
// confirm the entity shape survives the round-trip unchanged. The
// compile-time guarantee is that the entity types match
// `Record<string, unknown>` so they can be assigned to `SyncEvent.payload`.

describe('SyncEvent round-trip — Product / Sale / Customer', () => {
  let engine: NoOpSyncEngineClass
  beforeEach(() => { engine = new NoOpSyncEngineClass() })

  it('Product: payload round-trips and apply returns no_op', async () => {
    const product: Product = {
      id: asProductId(newId()),
      businessId: asBusinessId(newId()),
      name: 'Coca Cola 500ml',
      barcode: '5449000000996',
      sku: 'CC-500',
      categoryId: null,
      description: null,
      costPrice: 80,
      sellingPrice: 120,
      groupPrices: null,
      isGroup: false,
      unitsPerPackage: 1,
      stockQuantity: 24,
      currentStock: 24,
      lowStockThreshold: 5,
      trackInventory: true,
      allowSingleUnitSale: true,
      distributorName: null,
      distributorPhone: null,
      image: null,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    }
    const event = makeEvent('product', product.id, product as unknown as Record<string, unknown>)

    // enqueue
    const eq = await engine.enqueue(event)
    expect(eq).toEqual({ state: 'queued' })
    expect(engine.size).toBe(1)
    expect(engine.pending[0]?.event.state).toBe('pending')

    // pull (returns nothing — stub)
    const pulled = await engine.pull(makeCursor())
    expect(pulled).toEqual([])

    // apply (no_op — stub)
    const result = engine.apply(product, event)
    expect(result).toEqual({ state: 'no_op' })

    // payload shape survived the queue
    const stored = engine.pending[0]?.event.payload as Product
    expect(stored.id).toBe(product.id)
    expect(stored.name).toBe('Coca Cola 500ml')
    expect(stored.sellingPrice).toBe(120)
  })

  it('Sale: payload round-trips with paymentMethod + items', async () => {
    const sale: Sale = {
      id: asSaleId(newId()),
      businessId: asBusinessId(newId()),
      type: 'retail',
      status: 'confirmed',
      subtotal: 240,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 240,
      paidAmount: 240,
      paymentMethod: 'cash',
      note: null,
      customerId: null,
      employeeId: asEmployeeId(newId()),
      deviceId: asDeviceId(newId()),
      idempotencyKey: asIdempotencyKey(newId()),
      items: [],
      createdAt: ts,
      updatedAt: ts,
      confirmedAt: ts,
      version: 1,
    }
    const event = makeEvent('sale', sale.id, sale as unknown as Record<string, unknown>)

    const eq = await engine.enqueue(event)
    expect(eq.state).toBe('queued')
    expect((engine.pending[0]?.event.payload as Sale).paymentMethod).toBe('cash')
    expect((engine.pending[0]?.event.payload as Sale).totalAmount).toBe(240)

    expect(engine.apply(sale, event)).toEqual({ state: 'no_op' })
  })

  it('Customer: payload round-trips with idNumber + balance', async () => {
    const customer: Customer = {
      id: asCustomerId(newId()),
      businessId: asBusinessId(newId()),
      name: 'Wanjiku Mwangi',
      phone: '+254712345678',
      email: null,
      idNumber: '12345678',
      address: 'Nairobi',
      notes: null,
      balance: 0,
      status: 'active',
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    }
    const event = makeEvent('customer', customer.id, customer as unknown as Record<string, unknown>)

    const eq = await engine.enqueue(event)
    expect(eq.state).toBe('queued')

    const stored = engine.pending[0]?.event.payload as Customer
    expect(stored.idNumber).toBe('12345678')
    expect(stored.name).toBe('Wanjiku Mwangi')
    expect(stored.balance).toBe(0)

    expect(engine.apply(customer, event)).toEqual({ state: 'no_op' })
  })
})