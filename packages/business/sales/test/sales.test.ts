import { describe, it, expect, vi } from 'vitest'
import { SalesService, SaleNotFoundError } from '../src/index'
import { checkStockForSale, computeSaleTotals, buildSaleRequest } from '../src/index'
import { getEventBus } from '@soostori/events'
import { SALE_REJECTED, SALE_CONFIRMED, SALE_COMPLETED } from '@soostori/events'
import { newId, asShopId, asDeviceId } from '@soostori/core'

const SHOP = asShopId('shop-1')
const PRIMARY = asDeviceId('primary-1')

function makeProduct(id: string, stock: number, active = true) {
  return {
    id: id as any,
    shopId: SHOP,
    categoryId: null,
    name: `Product ${id}`,
    sku: null, barcode: null, description: null, imageUrl: null,
    costPrice: 0, sellingPrice: 100, discountPrice: null,
    unit: 'piece' as const,
    stockQuantity: stock, currentStock: stock, lowStockThreshold: 5,
    trackInventory: true, hasVariants: false, allowSingleUnitSale: true,
    groupPrices: null, unitsPerPackage: null,
    boxBuyingPrice: null, bulkSellingPrice: null,
    distributorName: null, distributorPhone: null,
    isActive: active, deletedAt: null, expiryDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function mockProductsRepo(products: Record<string, ReturnType<typeof makeProduct>>) {
  return {
    findById: vi.fn(async (id: string) => products[id] ?? null),
    findByBarcode: vi.fn(async () => null),
    findMany: vi.fn(async () => Object.values(products)),
    create: vi.fn(async () => { throw new Error('not impl') }),
    update: vi.fn(async () => { throw new Error('not impl') }),
    softDelete: vi.fn(async () => {}),
    findCategoryById: vi.fn(async () => null),
    findCategories: vi.fn(async () => []),
    createCategory: vi.fn(async () => { throw new Error('not impl') }),
    updateCategory: vi.fn(async () => { throw new Error('not impl') }),
    findVariants: vi.fn(async () => []),
    createVariant: vi.fn(async () => { throw new Error('not impl') }),
    decrementStock: vi.fn(async (id: string, qty: number) => {
      if (products[id]) products[id].currentStock -= qty
    }),
    incrementStock: vi.fn(async (id: string, qty: number) => {
      if (products[id]) products[id].currentStock += qty
    }),
    setStock: vi.fn(async () => {}),
  }
}

function mockSalesRepo() {
  const sales: Record<string, any> = {}
  return {
    findById: vi.fn(async (id: string) => sales[id] ?? null),
    findMany: vi.fn(async () => Object.values(sales)),
    create: vi.fn(async (sale: any) => { sales[sale.id] = sale; return sale }),
    update: vi.fn(async (id: string, changes: any) => {
      if (!sales[id]) throw new SaleNotFoundError(id)
      sales[id] = { ...sales[id], ...changes }
      return sales[id]
    }),
    totals: vi.fn(async () => ({ count: 0, total: 0, byPaymentMethod: {} })),
    findHeldSales: vi.fn(async () => []),
    createHeldSale: vi.fn(async () => { throw new Error('not impl') }),
    deleteHeldSale: vi.fn(async () => {}),
    findItemsBySaleId: vi.fn(async () => []),
  }
}

describe('computeSaleTotals', () => {
  it('sums quantities × unit prices', () => {
    expect(computeSaleTotals([
      { quantity: 2, unitPrice: 100 },
      { quantity: 3, unitPrice: 50 },
    ])).toEqual({ subtotal: 350, total: 350 })
  })

  it('subtracts per-item discounts', () => {
    expect(computeSaleTotals([
      { quantity: 2, unitPrice: 100, discount: 20 },
    ])).toEqual({ subtotal: 200, total: 180 })
  })
})

describe('checkStockForSale', () => {
  it('approves when stock sufficient', async () => {
    const products = { 'p1': makeProduct('p1', 10) }
    const repo = mockProductsRepo(products)
    const result = await checkStockForSale({
      idempotencyKey: newId() as any,
      shopId: SHOP,
      items: [{ productId: 'p1' as any, quantity: 3 }],
      paymentMethod: 'cash', paidAmount: 300, deviceId: PRIMARY, userId: 'u' as any,
    }, repo as any)
    expect(result.ok).toBe(true)
    expect(result.stockAfter?.['p1']).toBe(7)
  })

  it('rejects when stock insufficient', async () => {
    const products = { 'p1': makeProduct('p1', 1) }
    const repo = mockProductsRepo(products)
    const result = await checkStockForSale({
      idempotencyKey: newId() as any,
      shopId: SHOP,
      items: [{ productId: 'p1' as any, quantity: 5 }],
      paymentMethod: 'cash', paidAmount: 500, deviceId: PRIMARY, userId: 'u' as any,
    }, repo as any)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('INSUFFICIENT_STOCK')
  })

  it('rejects when product disabled', async () => {
    const products = { 'p1': makeProduct('p1', 10, false) }
    const repo = mockProductsRepo(products)
    const result = await checkStockForSale({
      idempotencyKey: newId() as any,
      shopId: SHOP,
      items: [{ productId: 'p1' as any, quantity: 1 }],
      paymentMethod: 'cash', paidAmount: 100, deviceId: PRIMARY, userId: 'u' as any,
    }, repo as any)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('PRODUCT_DISABLED')
  })
})

describe('SalesService.authorize', () => {
  it('emits SALE_CONFIRMED on stock available', async () => {
    getEventBus().clear()
    const products = { 'p1': makeProduct('p1', 10) }
    const sales = mockSalesRepo()
    const service = new SalesService(sales as any, mockProductsRepo(products) as any, SHOP, PRIMARY)
    const handler = vi.fn()
    const unsub = getEventBus().on(SALE_CONFIRMED, handler)

    const req = buildSaleRequest({
      shopId: SHOP, items: [{ productId: 'p1' as any, quantity: 2 }],
      paymentMethod: 'cash', paidAmount: 200, deviceId: PRIMARY, userId: 'u' as any,
    })
    const result = await service.authorize(req)
    expect(result.status).toBe('confirmed')
    expect(handler).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('emits SALE_REJECTED on insufficient stock', async () => {
    getEventBus().clear()
    const products = { 'p1': makeProduct('p1', 0) }
    const sales = mockSalesRepo()
    const service = new SalesService(sales as any, mockProductsRepo(products) as any, SHOP, PRIMARY)
    const handler = vi.fn()
    const unsub = getEventBus().on(SALE_REJECTED, handler)

    const req = buildSaleRequest({
      shopId: SHOP, items: [{ productId: 'p1' as any, quantity: 1 }],
      paymentMethod: 'cash', paidAmount: 100, deviceId: PRIMARY, userId: 'u' as any,
    })
    const result = await service.authorize(req)
    expect(result.status).toBe('rejected')
    expect(result.rejectionReason).toBe('INSUFFICIENT_STOCK')
    expect(handler).toHaveBeenCalledTimes(1)
    unsub()
  })
})

describe('SalesService.commit', () => {
  it('creates sale and decrements stock', async () => {
    getEventBus().clear()
    const products: Record<string, any> = { 'p1': makeProduct('p1', 5) }
    const sales = mockSalesRepo()
    const service = new SalesService(sales as any, mockProductsRepo(products) as any, SHOP, PRIMARY)
    const handler = vi.fn()
    const unsub = getEventBus().on(SALE_COMPLETED, handler)

    const saleId = newId() as any
    await service.commit({
      saleId,
      items: [{ productId: 'p1' as any, productName: 'A', quantity: 2, unitPrice: 100, totalPrice: 200 }],
      paymentMethod: 'cash', paidAmount: 200,
      deviceId: PRIMARY, userId: 'u' as any,
    })

    expect(sales.create).toHaveBeenCalledTimes(1)
    expect(products['p1'].currentStock).toBe(3)
    expect(handler).toHaveBeenCalledTimes(1)
    unsub()
  })
})
