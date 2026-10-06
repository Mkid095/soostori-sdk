/**
 * Regression tests for P0-4: LAN broadcast wire-up in the sync engine.
 * + P0-3b (audit 2026-10-05): tests now use the canonical contract
 *   `SyncEvent` shape (entityKind/operation), not the legacy
 *   `SoostoriEvent` shape (name/entity).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SyncEngine, LAN_BROADCAST_TIMEOUT_MS, type LanClient } from '../src/engine'
import type { CloudClientLike } from '../src/engine'
import type { QueueStorage, OfflineQueueItem } from '../src/queue'
import {
  asDeviceId, asBusinessId, newId,
} from '@soostori/core'
import type { SyncEvent } from '@soostori/contracts'
import { PrimaryDeviceCoordinator } from '../../devices/dist/index.js'

const BUSINESS = asBusinessId('00000000-0000-4000-8000-000000000001')
const DEVICE = asDeviceId('00000000-0000-4000-8000-000000000002')

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

function onlinePrimaryCoordinator(): PrimaryDeviceCoordinator {
  const c = new PrimaryDeviceCoordinator({ shopId: BUSINESS, deviceId: DEVICE as any })
  c.ingestHeartbeat({
    deviceId: asDeviceId('peer-lan-host'),
    shopId: BUSINESS,
    timestamp: new Date().toISOString(),
    isLanHost: true,
    reachable: true,
    stockSequence: 1,
  })
  if (!c.canAuthorStockOps()) {
    throw new Error(
      `onlinePrimaryCoordinator setup failed: state=${JSON.stringify(c.getState())}`,
    )
  }
  return c
}

describe('SyncEngine LAN broadcast (P0-4 + P0-3b regression)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('treats null lanClient as a no-op (default state)', async () => {
    const queue = inMemoryQueue()
    const cloud = mockCloud()
    const engine = new SyncEngine({
      businessId: BUSINESS, deviceId: DEVICE, cloud, queue,
      primary: onlinePrimaryCoordinator(),
    })
    const event = await engine.publish({
      entityKind: 'sale',
      entityId: newId(),
      operation: 'create',
      payload: { saleId: newId(), total: 100, authorizedBy: 'primary', stockAfter: {} },
    })
    expect(event.entityKind).toBe('sale')
    expect(event.operation).toBe('create')
    const pending = await queue.getAll()
    expect(pending).toHaveLength(1)
    expect(pending[0].event.id).toBe(event.id)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('calls lanClient.broadcast with the exact event from publish()', async () => {
    const queue = inMemoryQueue()
    const cloud = mockCloud()
    const engine = new SyncEngine({
      businessId: BUSINESS, deviceId: DEVICE, cloud, queue,
      primary: onlinePrimaryCoordinator(),
    })
    const broadcast = vi.fn<void, [SyncEvent]>()
    const lanClient: LanClient = { broadcast }
    engine.setLanClient(lanClient)

    const event = await engine.publish({
      entityKind: 'sale',
      entityId: newId(),
      operation: 'create',
      payload: { saleId: newId(), total: 250, authorizedBy: 'primary', stockAfter: { p1: 4 } },
    })

    expect(broadcast).toHaveBeenCalledTimes(1)
    expect(broadcast).toHaveBeenCalledWith(event)
    const pending = await queue.getAll()
    expect(pending).toHaveLength(1)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('swallows sync throws from lanClient.broadcast and still queues the event', async () => {
    const queue = inMemoryQueue()
    const cloud = mockCloud()
    const engine = new SyncEngine({
      businessId: BUSINESS, deviceId: DEVICE, cloud, queue,
      primary: onlinePrimaryCoordinator(),
    })
    const lanClient: LanClient = {
      broadcast: () => { throw new Error('socket closed') },
    }
    engine.setLanClient(lanClient)

    const event = await engine.publish({
      entityKind: 'sale',
      entityId: newId(),
      operation: 'create',
      payload: { saleId: newId(), total: 100, authorizedBy: 'primary', stockAfter: {} },
    })

    const pending = await queue.getAll()
    expect(pending).toHaveLength(1)
    expect(pending[0].event.id).toBe(event.id)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('[SyncEngine] LAN broadcast failed')
  })

  it('swallows async rejections from lanClient.broadcast', async () => {
    const queue = inMemoryQueue()
    const cloud = mockCloud()
    const engine = new SyncEngine({
      businessId: BUSINESS, deviceId: DEVICE, cloud, queue,
      primary: onlinePrimaryCoordinator(),
    })
    const lanClient: LanClient = {
      broadcast: async () => { throw new Error('async boom') },
    }
    engine.setLanClient(lanClient)

    await expect(
      engine.publish({
        entityKind: 'sale',
        entityId: newId(),
        operation: 'create',
        payload: { saleId: newId(), total: 100, authorizedBy: 'primary', stockAfter: {} },
      }),
    ).resolves.toBeDefined()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('setLanClient(null) clears the client so subsequent publishes are no-ops', async () => {
    const queue = inMemoryQueue()
    const cloud = mockCloud()
    const engine = new SyncEngine({
      businessId: BUSINESS, deviceId: DEVICE, cloud, queue,
      primary: onlinePrimaryCoordinator(),
    })
    const broadcast = vi.fn<void, [SyncEvent]>()
    engine.setLanClient({ broadcast })
    engine.setLanClient(null)

    await engine.publish({
      entityKind: 'sale',
      entityId: newId(),
      operation: 'create',
      payload: { saleId: newId(), total: 100, authorizedBy: 'primary', stockAfter: {} },
    })

    expect(broadcast).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('exposes LAN_BROADCAST_TIMEOUT_MS as a stable, exported constant', () => {
    expect(LAN_BROADCAST_TIMEOUT_MS).toBe(5_000)
  })

  it('times out a stuck lanClient.broadcast at LAN_BROADCAST_TIMEOUT_MS', async () => {
    const queue = inMemoryQueue()
    const cloud = mockCloud()
    const engine = new SyncEngine({
      businessId: BUSINESS, deviceId: DEVICE, cloud, queue,
      primary: onlinePrimaryCoordinator(),
    })
    const lanClient: LanClient = { broadcast: () => new Promise<void>(() => {}) }
    engine.setLanClient(lanClient)

    const start = Date.now()
    await engine.publish({
      entityKind: 'sale',
      entityId: newId(),
      operation: 'create',
      payload: { saleId: newId(), total: 100, authorizedBy: 'primary', stockAfter: {} },
    })
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(LAN_BROADCAST_TIMEOUT_MS - 50)
    expect(elapsed).toBeLessThan(LAN_BROADCAST_TIMEOUT_MS + 1_000)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const pending = await queue.getAll()
    expect(pending).toHaveLength(1)
  })

  it('does NOT broadcast non-stock events over LAN (LAN is for stock coordination only)', async () => {
    const queue = inMemoryQueue()
    const cloud = mockCloud()
    const engine = new SyncEngine({
      businessId: BUSINESS, deviceId: DEVICE, cloud, queue,
      primary: onlinePrimaryCoordinator(),
    })
    const broadcast = vi.fn<void, [SyncEvent]>()
    engine.setLanClient({ broadcast })

    // 'product' entityKind is NOT in STOCK_SENSITIVE_ENTITY_KINDS — non-stock.
    await engine.publish({
      entityKind: 'product',
      entityId: newId(),
      operation: 'create',
      payload: { name: 'Beans' },
    })

    expect(broadcast).not.toHaveBeenCalled()
    const pending = await queue.getAll()
    expect(pending).toHaveLength(1)
  })

  it('does not call lanClient.broadcast when primary cannot author stock ops', async () => {
    const queue = inMemoryQueue()
    const cloud = mockCloud()
    const primary = new PrimaryDeviceCoordinator({ shopId: BUSINESS, deviceId: DEVICE as any })
    const engine = new SyncEngine({
      businessId: BUSINESS, deviceId: DEVICE, cloud, queue, primary,
    })
    const broadcast = vi.fn<void, [SyncEvent]>()
    engine.setLanClient({ broadcast })

    await engine.publish({
      entityKind: 'sale',
      entityId: newId(),
      operation: 'create',
      payload: { saleId: newId(), total: 100, authorizedBy: 'primary', stockAfter: {} },
    })

    expect(broadcast).not.toHaveBeenCalled()
    const pending = await queue.getAll()
    expect(pending).toHaveLength(1)
  })
})