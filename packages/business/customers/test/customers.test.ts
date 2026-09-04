import { describe, it, expect, vi } from 'vitest'
import { CustomersService, CustomerNotFoundError } from '../src/index'
import { getEventBus } from '@soostori/events'
import { CUSTOMER_CREATED, CUSTOMER_FLAGGED } from '@soostori/events'
import { newId, asShopId, asDeviceId } from '@soostori/core'

const SHOP = asShopId('shop-1')
const DEVICE = asDeviceId('device-1')

function makeCustomer() {
  return {
    id: newId() as any,
    shopId: SHOP,
    name: 'Jane',
    phone: '0712345678', email: null, idNumber: null, address: null, notes: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function mockRepo() {
  const store = new Map<string, any>()
  const flags: any[] = []
  return {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    findByPhone: vi.fn(async () => null),
    findMany: vi.fn(async () => [...store.values()]),
    create: vi.fn(async (data: any) => {
      const c = { ...data, id: newId() }
      store.set(c.id, c)
      return c
    }),
    update: vi.fn(async (id: string, changes: any) => {
      if (!store.has(id)) throw new CustomerNotFoundError(id)
      const c = { ...store.get(id), ...changes, updatedAt: new Date().toISOString() }
      store.set(id, c)
      return c
    }),
    getOutstandingDebt: vi.fn(async () => 0),
    findFlags: vi.fn(async () => flags.filter(f => f.customerId === 'x')),
    createFlag: vi.fn(async (data: any) => {
      const flag = { ...data, id: newId(), flaggedAt: new Date().toISOString(), clearedAt: null }
      flags.push(flag)
      return flag
    }),
    clearFlag: vi.fn(async () => {}),
  }
}

describe('CustomersService', () => {
  it('create emits CUSTOMER_CREATED', async () => {
    getEventBus().clear()
    const repo = mockRepo()
    const service = new CustomersService(repo as any, SHOP, DEVICE)
    const handler = vi.fn()
    const unsub = getEventBus().on(CUSTOMER_CREATED, handler)

    const c = await service.create({ name: 'Jane', shopId: SHOP } as any)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].entityId).toBe(c.id)
    unsub()
  })

  it('flag emits CUSTOMER_FLAGGED', async () => {
    getEventBus().clear()
    const repo = mockRepo()
    const service = new CustomersService(repo as any, SHOP, DEVICE)
    const handler = vi.fn()
    const unsub = getEventBus().on(CUSTOMER_FLAGGED, handler)

    await service.flag(newId() as any, 'bad debt history')
    expect(handler).toHaveBeenCalledTimes(1)
    unsub()
  })
})
