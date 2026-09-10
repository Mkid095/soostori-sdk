/**
 * SyncEngine — real engine tests (Cycle 05).
 *
 * Tests the real `SyncEngineClass` with a mock `InstantClient`:
 *   1.  enqueue increments queue
 *   2.  enqueue returns { state: 'queued' }
 *   3.  enqueue rejects wrong businessId
 *   4.  pull returns events from cloud
 *   5.  pull respects cursor timestamp
 *   6.  pull filters by active businessId
 *   7.  apply calls transact (create / update / delete)
 *   8.  apply calls transact with idempotencyKey
 *   9.  idempotencyKey prevents duplicate apply
 *   10. business isolation — wrong businessId returns no_op
 *   11. version_older — local newer returns conflict_replay
 *   12. version_older — local older returns applied
 *   13. apply tombstone → delete step
 *   14. dequeue returns up to n items
 *   15. reset clears queue + idempotency cache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  newId, asBusinessId, asDeviceId, asProductId, asSyncEventId,
  asIdempotencyKey, asEmployeeId,
} from '@soostori/core'

import { SyncEngineClass } from '../src/index.js'
import type { SyncEvent, SyncCursor, InstantClient } from '../src/index.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BIZ = 'biz1'
const TS = '2026-09-10T10:00:00Z'

/** A mock InstantClient that records calls and returns configurable data. */
function mockClient(): {
  client: InstantClient
  transactCalls: unknown[][]
  queryCalls: Record<string, unknown>[]
  transactResult: Record<string, unknown>
  queryResult: Record<string, unknown>
} {
  const transactCalls: unknown[][] = []
  const queryCalls: Record<string, unknown>[] = []
  const transactResult: Record<string, unknown> = {}
  const queryResult: Record<string, unknown> = {}

  const client: InstantClient = {
    transact: vi.fn(async (steps) => {
      transactCalls.push(...steps)
      return transactResult
    }),
    query: vi.fn(async (goals) => {
      queryCalls.push(goals)
      return queryResult as Record<string, unknown>
    }),
  }

  return { client, transactCalls, queryCalls, transactResult, queryResult }
}

function makeEvent(overrides: Partial<SyncEvent> = {}): SyncEvent {
  const base: SyncEvent = {
    id: asSyncEventId(newId()),
    idempotencyKey: asIdempotencyKey(newId()),
    businessId: asBusinessId(BIZ),
    entityKind: 'product',
    entityId: newId(),
    operation: 'create',
    originatingDeviceId: asDeviceId(newId()),
    originatingEmployeeId: asEmployeeId(newId()),
    clientSequence: 1,
    clientCreatedAt: TS,
    serverReceivedAt: null,
    entityVersion: 1,
    payload: { name: 'Coca Cola' },
    correlationId: null,
    state: 'pending',
  }
  return { ...base, ...overrides }
}

function makeCursor(overrides: Partial<SyncCursor> = {}): SyncCursor {
  return {
    cursorId: 'cid' as unknown as SyncCursor['cursorId'],
    deviceId: asDeviceId(newId()),
    businessId: asBusinessId(BIZ),
    lastServerReceivedAt: null,
    lastOriginatingDeviceId: null,
    lastClientSequence: null,
    lastSyncAt: TS,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SyncEngineClass — enqueue', () => {
  it('increments the queue size', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    await engine.enqueue(makeEvent())
    await engine.enqueue(makeEvent())
    expect(engine.size).toBe(2)
  })

  it('returns { state: "queued" }', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const r = await engine.enqueue(makeEvent())
    expect(r).toEqual({ state: 'queued' })
  })

  it('rejects event with wrong businessId', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const r = await engine.enqueue(makeEvent({ businessId: asBusinessId('other-biz') }))
    expect(r).toEqual({ state: 'rejected' })
    expect(engine.size).toBe(0)
  })

  it('stores event in pending queue', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const e = makeEvent()
    await engine.enqueue(e)
    expect(engine.pending[0]?.event.id).toBe(e.id)
    expect(engine.pending[0]?.enqueuedAt).toBeGreaterThan(0)
  })

  it('preserves event payload', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    await engine.enqueue(makeEvent({ payload: { name: 'Fanta', price: 150 } }))
    const stored = engine.pending[0]?.event.payload as { name: string; price: number }
    expect(stored.name).toBe('Fanta')
    expect(stored.price).toBe(150)
  })
})

describe('SyncEngineClass — pull', () => {
  it('calls client.query with businessId filter', async () => {
    const { client, queryResult } = mockClient()
    queryResult.syncEvent = []
    const engine = new SyncEngineClass(client, BIZ)
    await engine.pull(makeCursor())
    expect(client.query).toHaveBeenCalledOnce()
    const call = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(call.syncEvent?.$.where.businessId).toBe(BIZ)
  })

  it('returns events newer than lastSyncAt', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const oldEvent: SyncEvent = {
      ...makeEvent({ serverReceivedAt: '2026-09-01T00:00:00Z' }),
      serverReceivedAt: '2026-09-01T00:00:00Z',
    }
    const newEvent: SyncEvent = {
      ...makeEvent({ serverReceivedAt: '2026-09-11T00:00:00Z' }),
      serverReceivedAt: '2026-09-11T00:00:00Z',
    }
    ;(client.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ syncEvent: [oldEvent, newEvent] })

    const cursor = makeCursor({ lastSyncAt: '2026-09-05T00:00:00Z' })
    const result = await engine.pull(cursor)
    expect(result).toHaveLength(1)
    expect(result[0].serverReceivedAt).toBe('2026-09-11T00:00:00Z')
  })

  it('pulling with no lastSyncAt returns all events', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const ev: SyncEvent = { ...makeEvent(), serverReceivedAt: '2026-09-01T00:00:00Z' }
    ;(client.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ syncEvent: [ev] })
    const result = await engine.pull(makeCursor({ lastSyncAt: null as unknown as string }))
    expect(result).toHaveLength(1)
  })

  it('ignores events without serverReceivedAt (not yet synced)', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const ev: SyncEvent = { ...makeEvent(), serverReceivedAt: null }
    ;(client.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ syncEvent: [ev] })
    const result = await engine.pull(makeCursor({ lastSyncAt: '2026-01-01T00:00:00Z' }))
    expect(result).toHaveLength(0)
  })
})

describe('SyncEngineClass — apply', () => {
  it('calls client.transact for create', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    engine.apply(null, makeEvent({ operation: 'create', payload: { name: 'Sprite' } }))
    await Promise.resolve() // let async catch fire
    expect(client.transact).toHaveBeenCalledOnce()
    const step = (client.transact as ReturnType<typeof vi.fn>).mock.calls[0][0][0]
    expect(step[0]).toBe('create')
    expect(step[1]).toBe('product')
  })

  it('calls client.transact for update', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const e = makeEvent({ operation: 'update', entityId: 'pid-123' })
    engine.apply(null, e)
    await Promise.resolve()
    expect(client.transact).toHaveBeenCalledOnce()
    const step = (client.transact as ReturnType<typeof vi.fn>).mock.calls[0][0][0]
    expect(step[0]).toBe('update')
    expect(step[1]).toBe('product')
    expect(step[2]).toBe('pid-123')
  })

  it('calls client.transact for delete', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    engine.apply(null, makeEvent({ operation: 'delete', entityId: 'pid-456' }))
    await Promise.resolve()
    expect(client.transact).toHaveBeenCalledOnce()
    const step = (client.transact as ReturnType<typeof vi.fn>).mock.calls[0][0][0]
    expect(step[0]).toBe('delete')
    expect(step[2]).toBe('pid-456')
  })

  it('transact includes idempotencyKey in create payload', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const e = makeEvent()
    engine.apply(null, e)
    await Promise.resolve()
    const step = (client.transact as ReturnType<typeof vi.fn>).mock.calls[0][0][0]
    expect((step[2] as Record<string, unknown>).idempotencyKey).toBe(e.idempotencyKey)
  })

  it('transact includes idempotencyKey in update payload', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const e = makeEvent({ operation: 'update' })
    engine.apply(null, e)
    await Promise.resolve()
    const step = (client.transact as ReturnType<typeof vi.fn>).mock.calls[0][0][0]
    expect((step[3] as Record<string, unknown>).idempotencyKey).toBe(e.idempotencyKey)
  })

  it('idempotencyKey prevents duplicate apply', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const e = makeEvent()
    const r1 = engine.apply(null, e)
    const r2 = engine.apply(null, e)
    expect(r1).toEqual({ state: 'applied', entityVersion: 1 })
    expect(r2).toEqual({ state: 'no_op' })
    // transact should only be called once
    expect((client.transact as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('wrong businessId returns no_op', () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const r = engine.apply(null, makeEvent({ businessId: asBusinessId('other') }))
    expect(r).toEqual({ state: 'no_op' })
    expect(client.transact).not.toHaveBeenCalled()
  })

  it('local version newer → version_older', () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const r = engine.apply({ version: 5 } as unknown, makeEvent({ entityVersion: 3 }))
    expect(r).toEqual({ state: 'version_older', localEntityVersion: 5, eventEntityVersion: 3 })
    expect(client.transact).not.toHaveBeenCalled()
  })

  it('local version equal → applied', () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const r = engine.apply({ version: 3 } as unknown, makeEvent({ entityVersion: 3 }))
    expect(r).toEqual({ state: 'applied', entityVersion: 3 })
  })

  it('local version older → applied', () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const r = engine.apply({ version: 1 } as unknown, makeEvent({ entityVersion: 3 }))
    expect(r).toEqual({ state: 'applied', entityVersion: 3 })
  })

  it('tombstone → delete step', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    engine.apply(null, makeEvent({ operation: 'tombstone', entityId: 'pid-789' }))
    await Promise.resolve()
    const step = (client.transact as ReturnType<typeof vi.fn>).mock.calls[0][0][0]
    expect(step[0]).toBe('delete')
    expect(step[2]).toBe('pid-789')
  })
})

describe('SyncEngineClass — queue management', () => {
  it('dequeue returns up to n items', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    await engine.enqueue(makeEvent())
    await engine.enqueue(makeEvent())
    await engine.enqueue(makeEvent())
    const items = engine.dequeue(2)
    expect(items).toHaveLength(2)
    expect(engine.size).toBe(1)
  })

  it('dequeue returns all when n exceeds size', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    await engine.enqueue(makeEvent())
    const items = engine.dequeue(100)
    expect(items).toHaveLength(1)
    expect(engine.size).toBe(0)
  })

  it('reset clears queue and idempotency cache', async () => {
    const { client } = mockClient()
    const engine = new SyncEngineClass(client, BIZ)
    const e = makeEvent()
    await engine.enqueue(e)
    engine.apply(null, e)
    engine.reset()
    expect(engine.size).toBe(0)
    // After reset, same idempotencyKey should not be cached
    const r = engine.apply(null, e)
    expect(r).toEqual({ state: 'applied', entityVersion: 1 })
  })
})

describe('SyncEngineClass — InstantClient interface', () => {
  it('satisfies SyncEngine interface', () => {
    const { client } = mockClient()
    const engine: import('../src/index.js').SyncEngine = new SyncEngineClass(client, BIZ)
    expect(typeof engine.enqueue).toBe('function')
    expect(typeof engine.pull).toBe('function')
    expect(typeof engine.apply).toBe('function')
  })
})
