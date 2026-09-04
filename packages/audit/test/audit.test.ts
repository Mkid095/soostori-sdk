import { describe, it, expect, vi } from 'vitest'
import { AuditRecorder, AuditAppendError } from '../src/index'
import type { AuditStorage, AuditEntry } from '../src/index'
import { getEventBus } from '@soostori/events'
import { createEvent, SALE_CONFIRMED, PRODUCT_CREATED } from '@soostori/events'
import { newId, asShopId, asDeviceId, asUserId } from '@soostori/core'

const SHOP = asShopId('s')

function mockStorage(): AuditStorage & { entries: AuditEntry[] } {
  const entries: AuditEntry[] = []
  return {
    entries,
    append: vi.fn(async (e) => { entries.push(e) }),
    query: vi.fn(async () => [...entries]),
    countByEventName: vi.fn(async () => ({})),
  }
}

describe('AuditRecorder', () => {
  it('records auditable event', async () => {
    const storage = mockStorage()
    const recorder = new AuditRecorder(storage)
    const event = createEvent({
      name: SALE_CONFIRMED, shopId: SHOP, deviceId: asDeviceId('d'),
      userId: asUserId('u1'),
      entityId: 's1', entity: 'sale',
      payload: { saleId: 's1', total: 100, authorizedBy: 'p', stockAfter: {} },
    })
    const entry = await recorder.record(event)
    expect(entry.eventName).toBe('sale.confirmed')
    expect(entry.action).toBe('sale.complete')
    expect(entry.actorId).toBe('u1')
    expect(entry.entityType).toBe('sale')
    expect(storage.entries).toHaveLength(1)
  })

  it('rejects non-auditable event', async () => {
    const recorder = new AuditRecorder(mockStorage())
    const event = createEvent({
      name: 'sale.pending' as any, shopId: SHOP, deviceId: asDeviceId('d'),
      payload: {},
    })
    await expect(recorder.record(event)).rejects.toThrow(/not auditable/)
  })

  it('attaches to event bus and auto-records', async () => {
    getEventBus().clear()
    const storage = mockStorage()
    const recorder = new AuditRecorder(storage)
    const unsub = recorder.attach(() => getEventBus())

    await getEventBus().publish(createEvent({
      name: PRODUCT_CREATED, shopId: SHOP, deviceId: asDeviceId('d'),
      entityId: 'p1', entity: 'product',
      payload: { productId: 'p1', name: 'X' },
    }))

    expect(storage.entries).toHaveLength(1)
    expect(storage.entries[0].eventName).toBe('product.created')
    unsub()
  })
})
