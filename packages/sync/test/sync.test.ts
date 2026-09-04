import { describe, it, expect, vi } from 'vitest'
import { SyncEngine, STOCK_SENSITIVE_EVENTS, type CloudClientLike } from '../src/engine'
import type { QueueStorage, OfflineQueueItem } from '../src/queue'
import { SALE_CONFIRMED, STOCK_LOW, PRODUCT_CREATED, AUTH_LOGIN } from '@soostori/events'
import type { SoostoriEvent } from '@soostori/events'
import {
  asDeviceId, asShopId, asSyncEventId, asUserId, newId,
} from '@soostori/core'

const SHOP = asShopId('shop-1')
const DEVICE = asDeviceId('device-1')

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
  }
}

function mockCloud(): CloudClientLike {
  return {
    query: vi.fn(async () => ({ syncEvents: [] })),
    transact: vi.fn(async () => ({})),
  }
}

function makeEvent(args: {
  name: SoostoriEvent['name']
  idempotencyKey: string
  entityId: string
  entity: string
  deviceId?: ReturnType<typeof asDeviceId>
  payload?: Record<string, unknown>
}): SoostoriEvent {
  const id = asSyncEventId(args.idempotencyKey)
  return {
    id,
    name: args.name,
    version: 1,
    deviceId: args.deviceId ?? DEVICE,
    userId: null,
    shopId: SHOP,
    timestamp: '2026-08-31T00:00:00Z',
    sequence: 1,
    idempotencyKey: id,
    entityId: args.entityId,
    entity: args.entity,
    source: 'cloud',
    payload: args.payload ?? {},
  }
}

describe('SyncEngine', () => {
  describe('event categorization', () => {
    it('marks sale events as stock-sensitive', () => {
      // Direct string check avoids vitest transformer alias issue
      expect(STOCK_SENSITIVE_EVENTS.has('sale.confirmed' as SoostoriEvent['name'])).toBe(true)
      expect(STOCK_SENSITIVE_EVENTS.has('stock.low' as SoostoriEvent['name'])).toBe(true)
    })

    it('marks product events as non-stock', () => {
      expect(STOCK_SENSITIVE_EVENTS.has(PRODUCT_CREATED)).toBe(false)
      expect(STOCK_SENSITIVE_EVENTS.has(AUTH_LOGIN)).toBe(false)
    })
  })

  describe('publish', () => {
    it('queues non-stock events for cloud push', async () => {
      const queue = inMemoryQueue()
      const cloud = mockCloud()
      const engine = new SyncEngine({
        shopId: SHOP, deviceId: DEVICE, cloud, queue,
      })
      const event = await engine.publish({
        name: PRODUCT_CREATED,
        entity: 'product', entityId: newId(),
        payload: { productId: newId(), name: 'X' },
        userId: asUserId(newId()),
      })
      expect(event.name).toBe(PRODUCT_CREATED)
      const pending = await queue.getAll()
      expect(pending).toHaveLength(1)
      expect(pending[0].event.id).toBe(event.id)
    })

    it('queues stock-sensitive events when no primary tracked', async () => {
      const queue = inMemoryQueue()
      const cloud = mockCloud()
      const engine = new SyncEngine({
        shopId: SHOP, deviceId: DEVICE, cloud, queue,
      })
      const event = await engine.publish({
        name: SALE_CONFIRMED,
        entity: 'sale', entityId: newId(),
        payload: { saleId: newId(), total: 100, authorizedBy: 'primary', stockAfter: {} },
      })
      const pending = await queue.getAll()
      expect(pending).toHaveLength(1)
      expect(pending[0].event.id).toBe(event.id)
    })
  })

  describe('pushPending', () => {
    it('pushes pending events to cloud', async () => {
      const queue = inMemoryQueue()
      const cloud = mockCloud()
      cloud.transact.mockResolvedValue({})
      const engine = new SyncEngine({
        shopId: SHOP, deviceId: DEVICE, cloud, queue,
      })
      await engine.publish({
        name: PRODUCT_CREATED,
        entity: 'product', entityId: newId(),
        payload: { name: 'X' },
      })
      const result = await engine.pushPending()
      expect(result.pushed).toBe(1)
      expect(result.failed).toBe(0)
    })

    it('tracks failed pushes', async () => {
      const queue = inMemoryQueue()
      const cloud = mockCloud()
      cloud.transact.mockRejectedValue(new Error('network down'))
      const engine = new SyncEngine({
        shopId: SHOP, deviceId: DEVICE, cloud, queue,
      })
      await engine.publish({
        name: PRODUCT_CREATED,
        entity: 'product', entityId: newId(),
        payload: { name: 'X' },
      })
      const result = await engine.pushPending()
      expect(result.pushed).toBe(0)
      expect(result.failed).toBe(1)
    })
  })

  describe('pullSinceCursor', () => {
    it('returns new events with deduplication', async () => {
      const queue = inMemoryQueue()
      const cloud = mockCloud()
      cloud.query.mockResolvedValue({
        syncEvents: [
          { id: 'e1', shopId: 'shop-1', deviceId: 'd1', entity: 'sale', entityId: 's1', operation: 'sale.confirmed', payload: '{}', syncedAt: '2026-08-31T00:00:00Z' },
          { id: 'e1', shopId: 'shop-1', deviceId: 'd1', entity: 'sale', entityId: 's1', operation: 'sale.confirmed', payload: '{}', syncedAt: '2026-08-31T00:00:01Z' },
        ],
      })
      const engine = new SyncEngine({
        shopId: SHOP, deviceId: DEVICE, cloud, queue,
      })
      const result = await engine.pullSinceCursor()
      expect(result.events).toHaveLength(1)
    })
  })

  describe('detectConflict', () => {
    it('flags duplicate idempotency keys', () => {
      const engine = new SyncEngine({
        shopId: SHOP, deviceId: DEVICE, cloud: mockCloud(), queue: inMemoryQueue(),
      })
      const a = makeEvent({
        name: 'sale.confirmed', idempotencyKey: 'k1', entityId: 's1', entity: 'sale',
      })
      const b = { ...a, deviceId: asDeviceId('d2') }
      const result = engine.detectConflict(a, b)
      expect(result.conflict).toBe(true)
      expect(result.reason).toBe('DUPLICATE_EVENT')
    })

    it('flags cross-device sales as stock conflict', () => {
      const engine = new SyncEngine({
        shopId: SHOP, deviceId: DEVICE, cloud: mockCloud(), queue: inMemoryQueue(),
      })
      const a = makeEvent({
        name: 'sale.confirmed', idempotencyKey: 'k1', entityId: 's1', entity: 'sale',
      })
      const b = {
        ...a,
        idempotencyKey: asSyncEventId('k2'),
        deviceId: asDeviceId('d2'),
      }
      const result = engine.detectConflict(a, b)
      expect(result.conflict).toBe(true)
      expect(result.reason).toBe('INSUFFICIENT_STOCK')
    })

    it('does not flag same-device events', () => {
      const engine = new SyncEngine({
        shopId: SHOP, deviceId: DEVICE, cloud: mockCloud(), queue: inMemoryQueue(),
      })
      const a = makeEvent({
        name: 'sale.confirmed', idempotencyKey: 'k1', entityId: 's1', entity: 'sale',
      })
      const b = { ...a, idempotencyKey: asSyncEventId('k2') }
      const result = engine.detectConflict(a, b)
      expect(result.conflict).toBe(false)
    })
  })
})
