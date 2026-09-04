import { describe, it, expect, vi } from 'vitest'
import {
  ALL_EVENTS, SALE_CONFIRMED, SALE_REJECTED, PRODUCT_CREATED,
  STOCK_RESERVED, SUBSCRIPTION_PAYMENT_CONFIRMED, isSoostoriEvent, eventCategory,
} from '../src/catalog'
import { createEvent, isEventBefore, isSameEvent } from '../src/envelope'
import { EventBus } from '../src/bus'
import { newId, asShopId, asDeviceId, asUserId } from '@soostori/core'

const SHOP = asShopId('shop-1')
const DEVICE = asDeviceId('device-1')

describe('event catalog', () => {
  it('has consistent category naming', () => {
    for (const name of ALL_EVENTS) {
      const [category, action] = name.split('.')
      expect(action).toBeTruthy()
      expect(name.startsWith(`${category}.`)).toBe(true)
    }
  })

  it('includes critical POS events', () => {
    expect(ALL_EVENTS).toContain('sale.pending')
    expect(ALL_EVENTS).toContain('sale.confirmed')
    expect(ALL_EVENTS).toContain('sale.rejected')
  })

  it('includes stock lifecycle events', () => {
    expect(ALL_EVENTS).toContain('stock.received')
    expect(ALL_EVENTS).toContain('stock.adjusted')
    expect(ALL_EVENTS).toContain('stock.reserved')  // primary device authorizes
    expect(ALL_EVENTS).toContain('stock.released')
    expect(ALL_EVENTS).toContain('stock.low')
  })

  it('includes primary device events', () => {
    expect(ALL_EVENTS).toContain('device.primary_elected')
    expect(ALL_EVENTS).toContain('device.primary_lost')
    expect(ALL_EVENTS).toContain('device.host_transfer')
  })

  it('includes subscription + commission events', () => {
    expect(ALL_EVENTS).toContain('subscription.payment_confirmed')
    expect(ALL_EVENTS).toContain('subscription.conversion_recorded')
    expect(ALL_EVENTS).toContain('subscription.commission_generated')
  })

  it('isSoostoriEvent validates correctly', () => {
    expect(isSoostoriEvent('sale.confirmed')).toBe(true)
    expect(isSoostoriEvent('made.up.event')).toBe(false)
  })

  it('eventCategory extracts correctly', () => {
    expect(eventCategory(SALE_CONFIRMED)).toBe('sale')
    expect(eventCategory(PRODUCT_CREATED)).toBe('product')
    expect(eventCategory(STOCK_RESERVED)).toBe('stock')
    expect(eventCategory(SUBSCRIPTION_PAYMENT_CONFIRMED)).toBe('subscription')
  })
})

describe('envelope', () => {
  it('createEvent generates required fields', () => {
    const e = createEvent({
      name: SALE_CONFIRMED,
      shopId: SHOP, deviceId: DEVICE,
      payload: { saleId: 's1', total: 500, authorizedBy: 'primary', stockAfter: {} },
    })
    expect(e.id).toBeTruthy()
    expect(e.idempotencyKey).toBeTruthy()
    expect(e.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(e.version).toBe(1)
    expect(e.source).toBe('local')
  })

  it('createEvent respects provided fields', () => {
    const userId = asUserId('u1')
    const e = createEvent({
      name: PRODUCT_CREATED,
      shopId: SHOP, deviceId: DEVICE,
      userId,
      entityId: 'p1',
      entity: 'product',
      source: 'lan',
      payload: { productId: 'p1', name: 'X' },
    })
    expect(e.userId).toBe(userId)
    expect(e.entityId).toBe('p1')
    expect(e.source).toBe('lan')
  })

  it('isEventBefore orders by sequence then timestamp', () => {
    const a = createEvent({ name: SALE_CONFIRMED, shopId: SHOP, deviceId: DEVICE, payload: {}, sequence: 5 })
    const b = createEvent({ name: SALE_CONFIRMED, shopId: SHOP, deviceId: DEVICE, payload: {}, sequence: 10 })
    expect(isEventBefore(a, b)).toBe(true)
    expect(isEventBefore(b, a)).toBe(false)
  })

  it('isSameEvent uses idempotency key', () => {
    const a = createEvent({ name: SALE_REJECTED, shopId: SHOP, deviceId: DEVICE, payload: {} })
    const b = { ...a, deviceId: asDeviceId('different') }
    expect(isSameEvent(a, b)).toBe(true)
  })
})

describe('EventBus', () => {
  it('subscribes and publishes', async () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on(SALE_CONFIRMED, handler)

    const evt = createEvent({ name: SALE_CONFIRMED, shopId: SHOP, deviceId: DEVICE, payload: {} })
    await bus.publish(evt)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('filters by name', async () => {
    const bus = new EventBus()
    const confirmedHandler = vi.fn()
    const rejectedHandler = vi.fn()
    bus.on(SALE_CONFIRMED, confirmedHandler)
    bus.on(SALE_REJECTED, rejectedHandler)

    await bus.publish(createEvent({ name: SALE_CONFIRMED, shopId: SHOP, deviceId: DEVICE, payload: {} }))
    await bus.publish(createEvent({ name: SALE_REJECTED, shopId: SHOP, deviceId: DEVICE, payload: {} }))
    expect(confirmedHandler).toHaveBeenCalledTimes(1)
    expect(rejectedHandler).toHaveBeenCalledTimes(1)
  })

  it('filters by category', async () => {
    const bus = new EventBus()
    const saleHandler = vi.fn()
    bus.onCategory('sale.', saleHandler)

    await bus.publish(createEvent({ name: SALE_CONFIRMED, shopId: SHOP, deviceId: DEVICE, payload: {} }))
    await bus.publish(createEvent({ name: PRODUCT_CREATED, shopId: SHOP, deviceId: DEVICE, payload: {} }))
    expect(saleHandler).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe removes handler', async () => {
    const bus = new EventBus()
    const handler = vi.fn()
    const unsubscribe = bus.on(SALE_CONFIRMED, handler)
    unsubscribe()
    await bus.publish(createEvent({ name: SALE_CONFIRMED, shopId: SHOP, deviceId: DEVICE, payload: {} }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('handler error does not block other handlers', async () => {
    const bus = new EventBus()
    const bad = vi.fn(() => { throw new Error('boom') })
    const good = vi.fn()
    bus.on(SALE_CONFIRMED, bad)
    bus.on(SALE_CONFIRMED, good)
    await bus.publish(createEvent({ name: SALE_CONFIRMED, shopId: SHOP, deviceId: DEVICE, payload: {} }))
    expect(good).toHaveBeenCalledTimes(1)
  })
})
