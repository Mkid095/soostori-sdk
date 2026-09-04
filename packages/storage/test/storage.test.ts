import { describe, it, expect, vi } from 'vitest'
import { OfflineQueue, type OfflineQueueStorage, type QueuedItem } from '../src/queue'
import { createEvent, SALE_COMPLETED } from '@soostori/events'
import { newId, asShopId, asDeviceId } from '@soostori/core'

const SHOP = asShopId('s')
const DEVICE = asDeviceId('d')

function inMemoryStorage(): OfflineQueueStorage {
  let items: QueuedItem[] = []
  return {
    enqueue: vi.fn(async (item) => { items.push(item) }),
    dequeue: vi.fn(async (id) => { items = items.filter(i => i.id !== id) }),
    list: vi.fn(async () => [...items]),
    replaceAll: vi.fn(async (newItems) => { items = [...newItems] }),
  }
}

describe('OfflineQueue', () => {
  it('enqueue adds event', async () => {
    const storage = inMemoryStorage()
    const queue = new OfflineQueue(storage)
    const event = createEvent({
      name: SALE_COMPLETED, shopId: SHOP, deviceId: DEVICE,
      payload: { saleId: 's1', total: 100 },
    })
    const item = await queue.enqueue(event)
    expect(item.event).toBe(event)
    expect(await queue.list()).toHaveLength(1)
  })

  it('markFailed increments retry with exponential backoff', async () => {
    const storage = inMemoryStorage()
    const queue = new OfflineQueue(storage)
    const event = createEvent({ name: SALE_COMPLETED, shopId: SHOP, deviceId: DEVICE, payload: {} })
    const item = await queue.enqueue(event)

    await queue.markFailed(item.id, 'network error')
    const updated = (await queue.list())[0]
    expect(updated.retryCount).toBe(1)
    expect(updated.lastError).toBe('network error')
    expect(new Date(updated.nextAttemptAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('dueForRetry returns items past nextAttemptAt', async () => {
    const storage = inMemoryStorage()
    const queue = new OfflineQueue(storage)
    const event = createEvent({ name: SALE_COMPLETED, shopId: SHOP, deviceId: DEVICE, payload: {} })
    await queue.enqueue(event)

    const due = await queue.dueForRetry(new Date(Date.now() + 10000))
    expect(due).toHaveLength(1)
  })

  it('dequeue removes item', async () => {
    const storage = inMemoryStorage()
    const queue = new OfflineQueue(storage)
    const event = createEvent({ name: SALE_COMPLETED, shopId: SHOP, deviceId: DEVICE, payload: {} })
    const item = await queue.enqueue(event)
    await queue.dequeue(item.id)
    expect(await queue.list()).toHaveLength(0)
  })
})
