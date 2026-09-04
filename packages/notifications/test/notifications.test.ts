import { describe, it, expect, vi } from 'vitest'
import {
  NotificationEngine, NotificationChannelRegistry,
  type NotificationChannel, type RecipientResolver,
} from '../src/index'
import { createEvent, LOW_STOCK_DETECTED as STOCK_LOW, DEBT_PAYMENT_RECORDED } from '@soostori/events'
import type { SoostoriEvent } from '@soostori/events'
import { newId, asShopId, asDeviceId, asUserId } from '@soostori/core'

const SHOP = asShopId('shop-1')

function mockChannel(name: string, enabled = true): NotificationChannel {
  return {
    channelName: name,
    isEnabled: vi.fn(async () => enabled),
    send: vi.fn(async () => {}),
  }
}

const FIXED_RECIPIENT = { userId: asUserId(newId()), shopId: SHOP }

describe('NotificationEngine', () => {
  it('dispatches to enabled channels for events with rules', async () => {
    const channels = new NotificationChannelRegistry()
    const inApp = mockChannel('in_app')
    const whatsapp = mockChannel('whatsapp')
    channels.register(inApp)
    channels.register(whatsapp)

    const resolver: RecipientResolver = {
      resolveRecipients: vi.fn(async () => [FIXED_RECIPIENT]),
    }
    const engine = new NotificationEngine({ channels, resolver })

    const event: SoostoriEvent = createEvent({
      name: STOCK_LOW,
      shopId: SHOP,
      deviceId: asDeviceId('device-1'),
      payload: { productName: 'Coffee', currentStock: 2, threshold: 5 },
    })
    const result = await engine.dispatch(event)
    expect(result).toHaveLength(2)  // in_app + whatsapp
    expect(inApp.send).toHaveBeenCalledTimes(1)
    expect(whatsapp.send).toHaveBeenCalledTimes(1)
  })

  it('skips events without rules', async () => {
    const channels = new NotificationChannelRegistry()
    const inApp = mockChannel('in_app')
    channels.register(inApp)

    const resolver: RecipientResolver = {
      resolveRecipients: vi.fn(async () => [FIXED_RECIPIENT]),
    }
    const engine = new NotificationEngine({ channels, resolver })

    // Use a synthetic event name that has NO rule in NOTIFICATION_RULES.
    // We can't easily access private state, so we'll rely on the engine
    // returning early for unknown event names.
    const event: SoostoriEvent = createEvent({
      name: 'custom.unknown_event' as any,
      shopId: SHOP,
      deviceId: asDeviceId('device-1'),
      payload: {},
    })
    const result = await engine.dispatch(event)
    expect(result).toHaveLength(0)
    expect(inApp.send).not.toHaveBeenCalled()
  })

  it('respects channel disabled state', async () => {
    const channels = new NotificationChannelRegistry()
    const disabled = mockChannel('in_app', false)
    channels.register(disabled)
    const resolver: RecipientResolver = {
      resolveRecipients: vi.fn(async () => [FIXED_RECIPIENT]),
    }
    const engine = new NotificationEngine({ channels, resolver })

    await engine.dispatch(createEvent({
      name: DEBT_PAYMENT_RECORDED, shopId: SHOP, deviceId: asDeviceId('device-1'),
      payload: { debtId: 'd1', paymentId: 'p1', amount: 500 },
    }))
    expect(disabled.send).not.toHaveBeenCalled()
  })

  it('handles one channel failing without breaking others', async () => {
    const channels = new NotificationChannelRegistry()
    // Override default channels to use our test mocks
    const failing = { ...mockChannel('in_app'), send: vi.fn(async () => { throw new Error('boom') }) }
    channels.register(failing as NotificationChannel)
    const resolver: RecipientResolver = {
      resolveRecipients: vi.fn(async () => [FIXED_RECIPIENT]),
    }
    const engine = new NotificationEngine({ channels, resolver })
    engine.setOverride(STOCK_LOW, ['in_app'])

    // dispatch should not throw — it logs the error and returns
    const result = await engine.dispatch(createEvent({
      name: STOCK_LOW, shopId: SHOP, deviceId: asDeviceId('device-1'),
      payload: { productName: 'X', currentStock: 1, threshold: 5 },
    }))
    // The notification is added to `out` BEFORE send() throws,
    // so the array contains 1 (the attempt was made).
    expect(result).toHaveLength(1)
    expect(failing.send).toHaveBeenCalledTimes(1)
  })
})
