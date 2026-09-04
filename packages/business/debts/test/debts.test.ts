import { describe, it, expect, vi } from 'vitest'
import { DebtsService } from '../src/index'
import { getEventBus } from '@soostori/events'
import { DEBT_CREATED, DEBT_PAYMENT_RECORDED } from '@soostori/events'
import { newId, asShopId, asDeviceId } from '@soostori/core'

const SHOP = asShopId('s')
const DEVICE = asDeviceId('d')

function mockRepo() {
  const debts = new Map<string, any>()
  const payments: any[] = []
  return {
    findById: vi.fn(async (id: string) => debts.get(id) ?? null),
    findMany: vi.fn(async () => [...debts.values()]),
    create: vi.fn(async (data: any) => {
      const d = { ...data, id: newId(), amountPaid: 0, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      debts.set(d.id, d)
      return d
    }),
    update: vi.fn(async (id: string, changes: any) => {
      const d = { ...debts.get(id), ...changes, updatedAt: new Date().toISOString() }
      debts.set(id, d)
      return d
    }),
    getTotalOwed: vi.fn(async () => 0),
    getOverdueAsOf: vi.fn(async () => []),
    createPayment: vi.fn(async (data: any) => {
      const p = { ...data, id: newId(), createdAt: new Date().toISOString() }
      payments.push(p)
      return p
    }),
    listPayments: vi.fn(async (debtId: string) => payments.filter(p => p.debtId === debtId)),
  }
}

describe('DebtsService', () => {
  it('create emits DEBT_CREATED', async () => {
    getEventBus().clear()
    const repo = mockRepo()
    const service = new DebtsService(repo as any, SHOP, DEVICE)
    const handler = vi.fn()
    const unsub = getEventBus().on(DEBT_CREATED, handler)

    await service.create({ customerId: newId() as any, saleId: null, amount: 500, dueDate: null, notes: null, shopId: SHOP })
    expect(handler).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('recordPayment updates status to paid when fully paid', async () => {
    getEventBus().clear()
    const repo = mockRepo()
    const service = new DebtsService(repo as any, SHOP, DEVICE)
    const debt = await service.create({ customerId: newId() as any, saleId: null, amount: 500, dueDate: null, notes: null, shopId: SHOP })

    const paymentHandler = vi.fn()
    const unsub = getEventBus().on(DEBT_PAYMENT_RECORDED, paymentHandler)

    const result = await service.recordPayment(debt.id, 500, 'cash', 'TXN001')
    expect(result.debt.status).toBe('paid')
    expect(result.debt.amountPaid).toBe(500)
    expect(paymentHandler).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('recordPayment partial keeps status pending', async () => {
    getEventBus().clear()
    const repo = mockRepo()
    const service = new DebtsService(repo as any, SHOP, DEVICE)
    const debt = await service.create({ customerId: newId() as any, saleId: null, amount: 1000, dueDate: null, notes: null, shopId: SHOP })

    const result = await service.recordPayment(debt.id, 300, 'cash')
    expect(result.debt.status).toBe('partial')
    expect(result.debt.amountPaid).toBe(300)
  })
})
