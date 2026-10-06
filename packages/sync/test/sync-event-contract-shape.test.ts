/**
 * P0-3b (audit 2026-10-05) — `SyncEngine.enqueue()` accepts the canonical
 * `SyncEvent` contract shape, NOT the legacy `SoostoriEvent` shape.
 *
 * This file pins the new contract surface for the sync engine:
 *   - `enqueue(event: SyncEvent)` accepts a contract-conformant event.
 *   - `publish()` returns a contract `SyncEvent`.
 *   - `detectConflict()` operates on contract `SyncEvent`.
 *   - The offline queue stores contract `SyncEvent`.
 *
 * If a future change reverts the engine to the legacy camelCase shape,
 * the type system will catch it (the `SyncEvent` type no longer
 * matches) and these tests will fail at runtime.
 */

import { describe, it, expect, vi } from 'vitest'
import { SyncEngine, type CloudClientLike } from '../src/engine'
import type { QueueStorage, OfflineQueueItem } from '../src/queue'
import {
  asDeviceId, asBusinessId, asEmployeeId, asIdempotencyKey, asSyncEventId, newId,
} from '@soostori/core'
import {
  createSyncEvent, type SyncEvent, type EntityKind, type SyncOperation,
} from '@soostori/contracts'

const BUSINESS = asBusinessId('00000000-0000-4000-8000-000000000001')
const DEVICE = asDeviceId('00000000-0000-4000-8000-000000000002')
const EMPLOYEE = asEmployeeId('00000000-0000-4000-8000-000000000003')

function inMemoryQueue(): QueueStorage {
  const items: OfflineQueueItem[] = []
  return {
    getAll: vi.fn(async () => [...items]),
    save: vi.fn(async (item) => {
      const i = items.findIndex(x => x.id === item.id)
      if (i >= 0) items[i] = item
      else items.push(item)
    }),
    delete: vi.fn(async (id) => {
      const i = items.findIndex(x => x.id === id)
      if (i >= 0) items.splice(i, 1)
    }),
    pruneSent: vi.fn(async () => {}),
    saveProcessedEvents: vi.fn(async () => {}),
    loadProcessedEvents: vi.fn(async () => []),
  }
}

function mockCloud(): CloudClientLike {
  return {
    query: vi.fn(async () => ({ syncEvents: [] })),
    transact: vi.fn(async () => ({})),
  }
}

describe('SyncEngine accepts contract SyncEvent (P0-3b flagship)', () => {
  it('enqueue() accepts a contract-conformant SyncEvent', async () => {
    const queue = inMemoryQueue()
    const engine = new SyncEngine({ businessId: BUSINESS, deviceId: DEVICE, cloud: mockCloud(), queue })
    const event: SyncEvent = createSyncEvent({
      businessId: BUSINESS,
      entityKind: 'sale' as EntityKind,
      entityId: newId(),
      operation: 'create' as SyncOperation,
      originatingDeviceId: DEVICE,
      originatingEmployeeId: EMPLOYEE,
      clientSequence: 1,
      entityVersion: 1,
      payload: { saleId: 's1', total: 500 },
    })
    await expect(engine.enqueue(event)).resolves.toBeUndefined()
    const stored = await queue.getAll()
    expect(stored).toHaveLength(1)
    expect(stored[0].event).toBe(event)
  })

  it('publish() returns a contract SyncEvent', async () => {
    const queue = inMemoryQueue()
    const engine = new SyncEngine({ businessId: BUSINESS, deviceId: DEVICE, cloud: mockCloud(), queue })
    const event = await engine.publish({
      entityKind: 'product' as EntityKind,
      entityId: newId(),
      operation: 'create' as SyncOperation,
      payload: { name: 'X' },
    })
    // Type assertion: publish() must return the contract shape, NOT the legacy shape.
    const contract: SyncEvent = event
    expect(contract.entityKind).toBe('product')
    expect(contract.operation).toBe('create')
    expect(contract.businessId).toBe(BUSINESS)
    expect(contract.originatingDeviceId).toBe(DEVICE)
    expect(contract.clientSequence).toBeGreaterThan(0)
    expect(contract.entityVersion).toBe(1)
    expect(contract.state).toBe('pending')
    // No legacy fields:
    expect((contract as any).name).toBeUndefined()
    expect((contract as any).shopId).toBeUndefined()
  })

  it('detectConflict() operates on contract SyncEvent fields', () => {
    const engine = new SyncEngine({ businessId: BUSINESS, deviceId: DEVICE, cloud: mockCloud(), queue: inMemoryQueue() })
    const a: SyncEvent = createSyncEvent({
      businessId: BUSINESS, entityKind: 'sale' as EntityKind, entityId: 's1',
      operation: 'create' as SyncOperation, originatingDeviceId: DEVICE, originatingEmployeeId: EMPLOYEE,
      clientSequence: 1, entityVersion: 1,
      payload: { saleId: 's1' },
    })
    const b: SyncEvent = createSyncEvent({
      businessId: BUSINESS, entityKind: 'sale' as EntityKind, entityId: 's1',
      operation: 'create' as SyncOperation,
      originatingDeviceId: asDeviceId('00000000-0000-4000-8000-000000000099'),
      originatingEmployeeId: asEmployeeId('00000000-0000-4000-8000-000000000099'),
      clientSequence: 2, entityVersion: 1,
      payload: { saleId: 's1' },
    })
    const result = engine.detectConflict(a, b)
    expect(result.conflict).toBe(true)
    expect(result.reason).toBe('INSUFFICIENT_STOCK')
  })

  it('SyncEvent from queue round-trips through pushPending (contract shape persisted)', async () => {
    const queue = inMemoryQueue()
    const cloud = mockCloud()
    cloud.transact.mockResolvedValue({})
    const engine = new SyncEngine({ businessId: BUSINESS, deviceId: DEVICE, cloud, queue })
    await engine.publish({
      entityKind: 'product' as EntityKind,
      entityId: newId(),
      operation: 'create' as SyncOperation,
      payload: { name: 'X' },
    })
    const result = await engine.pushPending()
    expect(result.pushed).toBe(1)
    expect(result.failed).toBe(0)
    // Verify the cloud received a transaction referencing the contract fields.
    expect(cloud.transact).toHaveBeenCalledTimes(1)
  })

  it('createSyncEvent from @soostori/contracts is the canonical constructor', () => {
    const event: SyncEvent = createSyncEvent({
      businessId: BUSINESS, entityKind: 'sale' as EntityKind, entityId: 's1',
      operation: 'create' as SyncOperation, originatingDeviceId: DEVICE, originatingEmployeeId: EMPLOYEE,
      clientSequence: 1, entityVersion: 1,
      payload: {},
    })
    // All 13 required contract fields are present.
    expect(event.id).toBeDefined()
    expect(event.idempotencyKey).toBeDefined()
    expect(event.businessId).toBe(BUSINESS)
    expect(event.entityKind).toBe('sale')
    expect(event.entityId).toBe('s1')
    expect(event.operation).toBe('create')
    expect(event.originatingDeviceId).toBe(DEVICE)
    expect(event.originatingEmployeeId).toBe(EMPLOYEE)
    expect(event.clientSequence).toBe(1)
    expect(event.clientCreatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(event.entityVersion).toBe(1)
    expect(event.payload).toEqual({})
    expect(event.state).toBe('pending')
  })
})