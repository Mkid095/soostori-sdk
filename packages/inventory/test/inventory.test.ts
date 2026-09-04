import { describe, it, expect, vi } from 'vitest'
import { StockMovementLedger } from '../src/index'
import type { InventoryRepository } from '../src/repository'
import type { StockMovement, StockBalance } from '../src/types'
import { InsufficientStockError } from '../src/repository'
import { newId, asShopId, asDeviceId } from '@soostori/core'

const SHOP = asShopId('shop-1')
const DEVICE = asDeviceId('device-1')

function mockRepo(): InventoryRepository {
  const movements: StockMovement[] = []
  const balances = new Map<string, StockBalance>()
  const reservations: any[] = []
  return {
    getMovement: vi.fn(async (id) => movements.find(m => m.id === id) ?? null),
    listMovements: vi.fn(async (filter) => {
      return movements.filter(m => {
        if (filter?.productId && m.productId !== filter.productId) return false
        if (filter?.type && m.type !== filter.type) return false
        return true
      })
    }),
    appendMovement: vi.fn(async (m) => { movements.push(m) }),
    hasMovementByKey: vi.fn(async (key) => movements.some(m => m.idempotencyKey === key)),
    getLatestMovement: vi.fn(async (productId) => {
      const filtered = movements.filter(m => m.productId === productId)
      return filtered[filtered.length - 1] ?? null
    }),
    getStockSummary: vi.fn(async () => null),
    getBalance: vi.fn(async (productId) => balances.get(productId) ?? null),
    upsertBalance: vi.fn(async (b) => { balances.set(b.productId, b) }),
    createReservation: vi.fn(async (r) => { reservations.push(r) }),
    getReservation: vi.fn(async (id) => reservations.find(r => r.id === id) ?? null),
    getReservationsBySale: vi.fn(async (saleId) => reservations.filter(r => r.saleId === saleId)),
    updateReservationStatus: vi.fn(async (id, status) => {
      const r = reservations.find(x => x.id === id)
      if (r) r.status = status
    }),
    getActiveReservations: vi.fn(async (productId) =>
      reservations.filter(r => r.productId === productId && r.status === 'active')
    ),
  }
}

describe('StockMovementLedger', () => {
  it('initial receive sets balance', async () => {
    const repo = mockRepo()
    const ledger = new StockMovementLedger(repo, SHOP, DEVICE)
    const productId = newId() as any

    const movement = await ledger.apply({
      productId, type: 'received', quantity: 100,
      actorType: 'employee', actorId: newId() as any, reason: 'PO-1',
    })

    expect(movement.balanceAfter).toBe(100)
    expect(movement.sequence).toBe(1)
    expect(await ledger.getQuantity(productId)).toBe(100)
  })

  it('subsequent movements increment sequence', async () => {
    const repo = mockRepo()
    const ledger = new StockMovementLedger(repo, SHOP, DEVICE)
    const productId = newId() as any

    await ledger.apply({ productId, type: 'received', quantity: 100, actorType: 'employee' })
    await ledger.apply({ productId, type: 'sold', quantity: -30, actorType: 'employee' })
    await ledger.apply({ productId, type: 'sold', quantity: -10, actorType: 'employee' })

    expect(await ledger.getQuantity(productId)).toBe(60)
  })

  it('throws on insufficient stock', async () => {
    const repo = mockRepo()
    const ledger = new StockMovementLedger(repo, SHOP, DEVICE)
    const productId = newId() as any

    await ledger.apply({ productId, type: 'received', quantity: 5, actorType: 'employee' })
    await expect(ledger.apply({
      productId, type: 'sold', quantity: -10, actorType: 'employee',
    })).rejects.toThrow(InsufficientStockError)
  })

  it('idempotency: same key returns existing movement', async () => {
    const repo = mockRepo()
    const ledger = new StockMovementLedger(repo, SHOP, DEVICE)
    const productId = newId() as any
    const key = newId() as any

    const m1 = await ledger.apply({
      productId, type: 'received', quantity: 50,
      actorType: 'employee', idempotencyKey: key,
    })
    const m2 = await ledger.apply({
      productId, type: 'received', quantity: 50,
      actorType: 'employee', idempotencyKey: key,
    })

    expect(m1.id).toBe(m2.id)  // Replay: same movement returned
    expect(await ledger.getQuantity(productId)).toBe(50)  // Not doubled
  })

  it('reserve locks stock without consuming', async () => {
    const repo = mockRepo()
    const ledger = new StockMovementLedger(repo, SHOP, DEVICE)
    const productId = newId() as any

    await ledger.apply({ productId, type: 'received', quantity: 100, actorType: 'employee' })
    const { reserved, reservationId } = await ledger.reserve({
      saleId: newId() as any, productId, quantity: 30,
    })

    expect(reserved).toBe(true)
    expect(reservationId).toBeTruthy()
    expect(await ledger.getQuantity(productId)).toBe(100)  // Quantity unchanged
  })

  it('reserve rejects when insufficient', async () => {
    const repo = mockRepo()
    const ledger = new StockMovementLedger(repo, SHOP, DEVICE)
    const productId = newId() as any
    await ledger.apply({ productId, type: 'received', quantity: 5, actorType: 'employee' })

    const { reserved } = await ledger.reserve({
      saleId: newId() as any, productId, quantity: 10,
    })
    expect(reserved).toBe(false)
  })

  it('commit reservation deducts stock', async () => {
    const repo = mockRepo()
    const ledger = new StockMovementLedger(repo, SHOP, DEVICE)
    const productId = newId() as any

    await ledger.apply({ productId, type: 'received', quantity: 100, actorType: 'employee' })
    const { reservationId } = await ledger.reserve({
      saleId: newId() as any, productId, quantity: 30,
    })

    await ledger.commitReservation(reservationId, { actorType: 'employee' })

    expect(await ledger.getQuantity(productId)).toBe(70)
  })

  it('release reservation frees stock without deduction', async () => {
    const repo = mockRepo()
    const ledger = new StockMovementLedger(repo, SHOP, DEVICE)
    const productId = newId() as any

    await ledger.apply({ productId, type: 'received', quantity: 100, actorType: 'employee' })
    const { reservationId } = await ledger.reserve({
      saleId: newId() as any, productId, quantity: 30,
    })

    await ledger.releaseReservation(reservationId)
    expect(await ledger.getQuantity(productId)).toBe(100)
  })

  it('getHistory returns full ledger', async () => {
    const repo = mockRepo()
    const ledger = new StockMovementLedger(repo, SHOP, DEVICE)
    const productId = newId() as any

    await ledger.apply({ productId, type: 'received', quantity: 50, actorType: 'employee' })
    await ledger.apply({ productId, type: 'sold', quantity: -20, actorType: 'employee' })
    await ledger.apply({ productId, type: 'adjusted', quantity: 5, actorType: 'employee' })

    const history = await ledger.getHistory(productId)
    expect(history).toHaveLength(3)
    expect(history.map(m => m.type)).toEqual(['received', 'sold', 'adjusted'])
    expect(history.map(m => m.balanceAfter)).toEqual([50, 30, 35])
  })
})
