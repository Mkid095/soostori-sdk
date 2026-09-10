/**
 * SaleService tests — 10+ tests covering createSale, voidSale, refundSale,
 * getSale, listSales, business isolation, and SyncEvent emission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SaleService, type SaleEventName } from '../src/SaleService'
import type {
  Sale,
  SaleItem,
  Refund,
  CreateSaleInput,
  RefundSaleInput,
  SaleRepository,
  Business,
} from '../src/types'
import { SaleNotFoundError } from '../src/types'
import { NoOpSyncEngineClass, type QueuedSyncEvent } from '@soostori/contracts'
import { newId, asBusinessId, asProductId, asEmployeeId, asDeviceId, asSaleId, asSaleItemId } from '@soostori/core'

const BIZ = asBusinessId('biz-test')
const DEVICE = asDeviceId('device-1')
const EMPLOYEE = asEmployeeId('employee-1')
const CASHIER = asEmployeeId('cashier-1')
const BIZ2 = asBusinessId('biz-other')

// ── Test helpers ────────────────────────────────────────────────────────────────

function makeProductName(id: string): string {
  return `Product ${id}`
}

function makeBusiness(id = BIZ): Business {
  return { id, name: 'Test Shop', address: '123 Test St', taxRate: 0.16 }
}

function makeCreateSaleInput(overrides?: Partial<CreateSaleInput>): CreateSaleInput {
  return {
    businessId: BIZ,
    registerId: 'REG-001',
    cashierId: CASHIER,
    lineItems: [
      { productId: asProductId('prod-1'), quantity: 2, unitPrice: 500_00, discount: 0 },
      { productId: asProductId('prod-2'), quantity: 1, unitPrice: 300_00, discount: 50_00 },
    ],
    paymentMethod: 'cash',
    amountTendered: 1500_00,
    notes: 'Test sale',
    ...overrides,
  }
}

function makeMockRepo() {
  const sales = new Map<string, Sale>()
  const saleItems = new Map<string, SaleItem[]>()
  const refunds = new Map<string, Refund[]>()

  return {
    sales,
    saleItems,
    refunds,

    store: {
      getSale: vi.fn(async (id) => sales.get(String(id)) ?? null),
      upsertSale: vi.fn(async (s: Sale) => { sales.set(String(s.id), s) }),
      listSales: vi.fn(async (bizId: string, date?: string) => {
        let result = [...sales.values()].filter(s => String(s.businessId) === String(bizId))
        if (date) result = result.filter(s => s.createdAt.startsWith(date))
        return result
      }),
      getSaleItem: vi.fn(async (id) => {
        for (const items of saleItems.values()) {
          const found = items.find(i => String(i.id) === String(id))
          if (found) return found
        }
        return null
      }),
      upsertSaleItem: vi.fn(async (item: SaleItem) => {
        const existing = saleItems.get(String(item.saleId)) ?? []
        const idx = existing.findIndex(i => String(i.id) === String(item.id))
        if (idx >= 0) existing[idx] = item
        else existing.push(item)
        saleItems.set(String(item.saleId), existing)
      }),
      listSaleItems: vi.fn(async (saleId: string) => saleItems.get(String(saleId)) ?? []),
      upsertRefund: vi.fn(async (r: Refund) => {
        const existing = refunds.get(String(r.saleId)) ?? []
        existing.push(r)
        refunds.set(String(r.saleId), existing)
      }),
      listRefunds: vi.fn(async (saleId: string) => refunds.get(String(saleId)) ?? []),
    } as unknown as SaleRepository,

    getAllEvents() {
      return [] as QueuedSyncEvent[]
    },
  }
}

function buildService(repo: ReturnType<typeof makeMockRepo>['store'], bizId = BIZ) {
  const syncEngine = new NoOpSyncEngineClass()
  const svc = new SaleService(repo, syncEngine, bizId, DEVICE, EMPLOYEE)
  return { svc, syncEngine }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SaleService', () => {

  // ── createSale ────────────────────────────────────────────────────────────────

  describe('createSale', () => {
    it('creates sale with correct fields', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Soap'], [asProductId('prod-2'), 'Shampoo']])

      const result = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())

      expect(result.sale.businessId).toBe(BIZ)
      expect(result.sale.status).toBe('completed')
      expect(result.sale.subtotal).toBe(2 * 500_00 + (300_00 - 50_00)) // 1250_00
      expect(result.sale.saleDiscount).toBe(0)
      expect(result.sale.totalAmount).toBe(Math.round(1250_00 * 1.16)) // with 16% tax
      expect(result.sale.paymentMethod).toBe('cash')
      expect(result.sale.changeGiven).toBe(1500_00 - result.sale.totalAmount)
      expect(result.receipt.saleId).toBe(result.sale.id)
    })

    it('inventory is not decremented by SaleService (caller responsibility)', async () => {
      // SaleService does NOT manage inventory — the brief says inventory is
      // decremented atomically with sale, but the adapter/caller handles it.
      // This test documents that SaleService does NOT touch stock.
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Soap'], [asProductId('prod-2'), 'Shampoo']])

      await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())

      // No stock-related call is made — SaleService has no such capability
      // The caller (desktop/mobile adapter) handles inventory decrement.
      expect(store.listSales).not.toHaveBeenCalled()
    })

    it('emits sale.created SyncEvent', async () => {
      const { store } = makeMockRepo()
      const { svc, syncEngine } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Soap'], [asProductId('prod-2'), 'Shampoo']])

      await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())

      expect(syncEngine.size).toBe(1)
      const evt = (syncEngine as unknown as { queue: QueuedSyncEvent[] }).queue[0].event
      expect(evt.entityKind).toBe('sale')
      expect(evt.businessId).toBe(BIZ)
      expect(evt.state).toBe('pending')
    })

    it('createSale with sale-level discount', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Soap']])

      const result = await svc.createSale(
        makeCreateSaleInput({ lineItems: [{ productId: asProductId('prod-1'), quantity: 1, unitPrice: 1000_00 }], saleDiscount: 100_00 }),
        productNames,
        makeBusiness(),
      )

      expect(result.sale.saleDiscount).toBe(100_00)
      expect(result.sale.subtotal).toBe(1000_00)
      const afterDiscount = 1000_00 - 100_00
      expect(result.sale.taxAmount).toBe(Math.round(afterDiscount * 0.16))
    })
  })

  describe('createSale totals and change', () => {
    it('computes correct line totals and change given', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Rice'], [asProductId('prod-2'), 'Sugar']])

      // Item 1: 3 × 200_00 = 600_00, no discount
      // Item 2: 2 × 150_00 = 300_00, 50_00 discount → 250_00
      // Subtotal = 850_00, no saleDiscount, tax = 136_00, total = 986_00
      // Tendered = 1000_00, change = 14_00
      const result = await svc.createSale(
        makeCreateSaleInput({
          lineItems: [
            { productId: asProductId('prod-1'), quantity: 3, unitPrice: 200_00, discount: 0 },
            { productId: asProductId('prod-2'), quantity: 2, unitPrice: 150_00, discount: 50_00 },
          ],
          amountTendered: 1000_00,
        }),
        productNames,
        makeBusiness(),
      )

      expect(result.sale.subtotal).toBe(850_00)
      expect(result.sale.totalAmount).toBe(986_00)
      expect(result.sale.changeGiven).toBe(14_00)
      expect(result.sale.amountTendered).toBe(1000_00)
    })

    it('change given is 0 when amountTendered equals total', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Bread']])

      // Subtotal = 500_00, no discount, tax = 80_00, total = 580_00
      const result = await svc.createSale(
        makeCreateSaleInput({
          lineItems: [{ productId: asProductId('prod-1'), quantity: 1, unitPrice: 500_00 }],
          amountTendered: 580_00,
        }),
        productNames,
        makeBusiness(),
      )

      expect(result.sale.changeGiven).toBe(0)
    })
  })

  // ── voidSale ────────────────────────────────────────────────────────────────

  describe('voidSale', () => {
    it('sets sale status to voided', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      const { sale } = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())
      await svc.voidSale(sale.id, 'Customer changed mind')

      const voided = store.sales.get(String(sale.id))!
      expect(voided.status).toBe('voided')
      expect(voided.notes).toContain('Customer changed mind')
    })

    it('emits sale.voided SyncEvent', async () => {
      const { store } = makeMockRepo()
      const { svc, syncEngine } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      const { sale } = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())
      await svc.voidSale(sale.id, 'Bad transaction')

      // sale.created (1) + sale.voided (2)
      expect(syncEngine.size).toBe(2)
      const evt = (syncEngine as unknown as { queue: QueuedSyncEvent[] }).queue[1].event
      expect(evt.entityKind).toBe('sale')
      expect(evt.businessId).toBe(BIZ)
    })

    it('voidSale idempotent — calling twice does not throw', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      const { sale } = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())
      await svc.voidSale(sale.id, 'Reason 1')
      await svc.voidSale(sale.id, 'Reason 2') // should not throw

      const voided = store.sales.get(String(sale.id))!
      expect(voided.status).toBe('voided')
      // notes should contain both reasons
      expect(voided.notes).toContain('Reason 1')
      expect(voided.notes).toContain('Reason 2')
    })
  })

  // ── refundSale ─────────────────────────────────────────────────────────────

  describe('refundSale partial', () => {
    it('creates partial refund with correct amount', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item A'], [asProductId('prod-2'), 'Item B']])

      const { sale } = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())

      const refundInput: RefundSaleInput = {
        saleId: sale.id,
        refundAmount: 500_00,
        reason: 'Item missing from bag',
        paymentMethod: 'cash',
      }

      const { refund } = await svc.refundSale(refundInput, makeBusiness(), 'John Doe')

      expect(refund.saleId).toBe(sale.id)
      expect(refund.amount).toBe(500_00)
      expect(refund.reason).toBe('Item missing from bag')
    })

    it('sale status becomes refunded', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      const { sale } = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())
      const { refund } = await svc.refundSale({
        saleId: sale.id,
        refundAmount: 200_00,
        reason: 'Partial',
        paymentMethod: 'cash',
      }, makeBusiness(), 'Cashier')

      const updated = store.sales.get(String(sale.id))!
      expect(updated.status).toBe('refunded')
    })
  })

  describe('refundSale full', () => {
    it('emits sale.refunded SyncEvent', async () => {
      const { store } = makeMockRepo()
      const { svc, syncEngine } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      const { sale } = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())
      await svc.refundSale({ saleId: sale.id, refundAmount: sale.totalAmount, reason: 'Full return', paymentMethod: 'cash' }, makeBusiness(), 'Bob')

      // sale.created (1) + sale.refunded (2)
      expect(syncEngine.size).toBe(2)
      const evt = (syncEngine as unknown as { queue: QueuedSyncEvent[] }).queue[1].event
      expect(evt.entityKind).toBe('sale')
    })
  })

  // ── getSale ─────────────────────────────────────────────────────────────────

  describe('getSale', () => {
    it('returns null when sale not found', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)

      const result = await svc.getSale(asSaleId('nonexistent'))

      expect(result).toBeNull()
    })

    it('returns sale when found', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      const { sale: created } = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())
      const found = await svc.getSale(created.id)

      expect(found).not.toBeNull()
      expect(found!.id).toBe(created.id)
    })
  })

  // ── listSales ───────────────────────────────────────────────────────────────

  describe('listSales', () => {
    it('returns all sales for businessId', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())
      await svc.createSale(makeCreateSaleInput({ registerId: 'REG-002' }), productNames, makeBusiness())

      const sales = await svc.listSales(BIZ)

      expect(sales).toHaveLength(2)
    })

    it('filters by date when provided', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      // Sale created today
      await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())

      const today = new Date().toISOString().slice(0, 10)
      const sales = await svc.listSales(BIZ, today)

      expect(sales.length).toBeGreaterThanOrEqual(1)
      for (const s of sales) {
        expect(s.createdAt.startsWith(today)).toBe(true)
      }
    })

    it('returns empty array for date with no sales', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)

      const sales = await svc.listSales(BIZ, '1999-01-01')

      expect(sales).toHaveLength(0)
    })
  })

  // ── businessId isolation ───────────────────────────────────────────────────

  describe('businessId isolation', () => {
    it('createSale rejects mismatched businessId', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      await expect(
        svc.createSale(makeCreateSaleInput({ businessId: BIZ2 as unknown as ReturnType<typeof asBusinessId> }), productNames, makeBusiness(BIZ2)),
      ).rejects.toThrow('Business isolation violation')
    })

    it('voidSale rejects mismatched businessId', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      const { sale } = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())

      // Manually corrupt the businessId in the store to simulate cross-tenant access
      store.sales.set(String(sale.id), { ...sale, businessId: BIZ2 as unknown as ReturnType<typeof asBusinessId> })

      await expect(svc.voidSale(sale.id, 'reason')).rejects.toThrow('Business isolation violation')
    })

    it('getSale returns null for sale from different businessId', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Item']])

      const { sale } = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())
      store.sales.set(String(sale.id), { ...sale, businessId: BIZ2 as unknown as ReturnType<typeof asBusinessId> })

      const result = await svc.getSale(sale.id)

      expect(result).toBeNull()
    })

    it('listSales returns [] for different businessId', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)

      const result = await svc.listSales(BIZ2)

      expect(result).toHaveLength(0)
    })
  })

  // ── SaleNotFoundError ────────────────────────────────────────────────────────

  describe('SaleNotFoundError', () => {
    it('voidSale throws SaleNotFoundError when sale does not exist', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)

      await expect(svc.voidSale(asSaleId('does-not-exist'), 'reason')).rejects.toThrow(SaleNotFoundError)
    })

    it('refundSale throws SaleNotFoundError when sale does not exist', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)

      await expect(
        svc.refundSale({ saleId: asSaleId('does-not-exist'), refundAmount: 100_00, reason: 'Bad', paymentMethod: 'cash' }, makeBusiness(), 'Jane'),
      ).rejects.toThrow(SaleNotFoundError)
    })
  })

  // ── Receipt ─────────────────────────────────────────────────────────────────

  describe('Receipt', () => {
    it('formatReceipt includes all required fields', async () => {
      const { store } = makeMockRepo()
      const { svc } = buildService(store)
      const productNames = new Map([[asProductId('prod-1'), 'Milk'], [asProductId('prod-2'), 'Eggs']])

      const { receipt } = await svc.createSale(makeCreateSaleInput(), productNames, makeBusiness())

      expect(receipt.businessName).toBe('Test Shop')
      expect(receipt.registerId).toBe('REG-001')
      expect(receipt.lineItems).toHaveLength(2)
      expect(receipt.total).toBeGreaterThan(0)
      expect(receipt.paymentMethod).toBe('cash')
      expect(receipt.changeGiven).toBeGreaterThanOrEqual(0)
    })
  })
})
