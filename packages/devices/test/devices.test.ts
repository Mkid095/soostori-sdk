import { describe, it, expect, vi } from 'vitest'
import { PrimaryDeviceCoordinator } from '../src/index'
import { getEventBus } from '@soostori/events'
import { PRIMARY_DEVICE_ELECTED, PRIMARY_DEVICE_LOST, HOST_TRANSFER } from '@soostori/events'
import { newId, asShopId } from '@soostori/core'

const SHOP = asShopId('shop-1')

describe('PrimaryDeviceCoordinator', () => {
  it('starts with no primary', () => {
    const c = new PrimaryDeviceCoordinator({ shopId: SHOP, deviceId: newId() as any })
    const state = c.getState()
    expect(state.primaryId).toBeNull()
    expect(state.status).toBe('lost')
    expect(c.canAuthorStockOps()).toBe(false)
  })

  it('elects primary on first heartbeat', () => {
    getEventBus().clear()
    const c = new PrimaryDeviceCoordinator({ shopId: SHOP, deviceId: newId() as any })
    const handler = vi.fn()
    const unsub = getEventBus().on(PRIMARY_DEVICE_ELECTED, handler)

    const peerPrimary = newId()
    c.ingestHeartbeat({
      deviceId: peerPrimary as any, shopId: SHOP, timestamp: new Date().toISOString(),
      isPrimary: true, reachable: true, stockSequence: 1,
    })

    expect(c.getState().primaryId).toBe(peerPrimary)
    expect(handler).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('detects primary lost after grace period', () => {
    getEventBus().clear()
    const c = new PrimaryDeviceCoordinator({
      shopId: SHOP, deviceId: newId() as any,
      config: { freshnessMs: 1000, lostGraceMs: 2000 },
    })
    const handler = vi.fn()
    const unsub = getEventBus().on(PRIMARY_DEVICE_LOST, handler)

    const peer = newId() as any
    const old = Date.now() - 5000
    c.ingestHeartbeat({
      deviceId: peer, shopId: SHOP,
      timestamp: new Date(old).toISOString(),
      isPrimary: true, reachable: true, stockSequence: 1,
    })
    c.tick()
    expect(c.getState().status).toBe('lost')
    expect(handler).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('canAuthorStockOps returns true ONLY for online primary', () => {
    // CRITICAL: STALE Primary must NOT authorize stock mutations.
    const c = new PrimaryDeviceCoordinator({
      shopId: SHOP, deviceId: newId() as any,
      config: { freshnessMs: 100, lostGraceMs: 1000 },
    })
    expect(c.canAuthorStockOps()).toBe(false)  // no primary elected

    c.ingestHeartbeat({
      deviceId: newId() as any, shopId: SHOP, timestamp: new Date().toISOString(),
      isPrimary: true, reachable: true, stockSequence: 1,
    })
    expect(c.canAuthorStockOps()).toBe(true)  // online

    c.reset()
    c.ingestHeartbeat({
      deviceId: newId() as any, shopId: SHOP,
      timestamp: new Date(Date.now() - 200).toISOString(),  // older than freshness
      isPrimary: true, reachable: true, stockSequence: 1,
    })
    c.tick()  // tick() advances staleness based on heartbeat age
    expect(c.canAuthorStockOps()).toBe(false)  // STALE — must NOT authorize
  })

  it('canAuthorStockOps returns false when lost, true when online', () => {
    const c = new PrimaryDeviceCoordinator({ shopId: SHOP, deviceId: newId() as any })
    expect(c.canAuthorStockOps()).toBe(false)

    c.ingestHeartbeat({
      deviceId: newId() as any, shopId: SHOP, timestamp: new Date().toISOString(),
      isPrimary: true, reachable: true, stockSequence: 1,
    })
    c.tick()
    expect(c.canAuthorStockOps()).toBe(true)
  })

  it('manual transfer moves primary', () => {
    getEventBus().clear()
    const c = new PrimaryDeviceCoordinator({ shopId: SHOP, deviceId: newId() as any })
    const oldPrimary = newId() as any
    const newPrimary = newId() as any

    c.ingestHeartbeat({
      deviceId: oldPrimary, shopId: SHOP, timestamp: new Date().toISOString(),
      isPrimary: true, reachable: true, stockSequence: 1,
    })
    expect(c.getState().primaryId).toBe(oldPrimary)

    const transferHandler = vi.fn()
    const unsub = getEventBus().on(HOST_TRANSFER, transferHandler)

    c.transferPrimary(newPrimary, oldPrimary)
    expect(c.getState().primaryId).toBe(newPrimary)
    expect(transferHandler).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('transferPrimary throws if not current primary', () => {
    const c = new PrimaryDeviceCoordinator({ shopId: SHOP, deviceId: newId() as any })
    expect(() => c.transferPrimary(newId() as any, newId() as any)).toThrow(/not the current primary/)
  })

  it('listDevices returns all known heartbeats', () => {
    const c = new PrimaryDeviceCoordinator({ shopId: SHOP, deviceId: newId() as any })
    c.ingestHeartbeat({
      deviceId: newId() as any, shopId: SHOP, timestamp: new Date().toISOString(),
      isPrimary: true, reachable: true, stockSequence: 1,
    })
    c.ingestHeartbeat({
      deviceId: newId() as any, shopId: SHOP, timestamp: new Date().toISOString(),
      isPrimary: false, reachable: true, stockSequence: 0,
    })
    expect(c.listDevices()).toHaveLength(2)
  })
})
