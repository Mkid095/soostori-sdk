import { describe, it, expect, vi } from 'vitest'
import { ProductService, ProductNotFoundError } from '../src/index'
import type { ProductRepository } from '../src/repository'
import type { Product } from '../src/types'
import { getEventBus } from '@soostori/events'
import { PRODUCT_CREATED, PRICE_CHANGED } from '@soostori/events'
import { newId, asShopId, asDeviceId } from '@soostori/core'

const SHOP = asShopId('shop-1')
const DEVICE = asDeviceId('device-1')

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: newId() as Product['id'],
    shopId: SHOP,
    categoryId: null,
    name: 'Test Product',
    sku: null, barcode: null, description: null, imageUrl: null,
    costPrice: 0, sellingPrice: 100, discountPrice: null,
    unit: 'piece',
    stockQuantity: 0, currentStock: 0, lowStockThreshold: 5,
    trackInventory: true, hasVariants: false, allowSingleUnitSale: true,
    groupPrices: null, unitsPerPackage: null,
    boxBuyingPrice: null, bulkSellingPrice: null,
    distributorName: null, distributorPhone: null,
    isActive: true, deletedAt: null, expiryDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function mockRepo(): ProductRepository {
  const store = new Map<string, Product>()
  return {
    findById: vi.fn(async id => store.get(id) ?? null),
    findByBarcode: vi.fn(async b => [...store.values()].find(p => p.barcode === b) ?? null),
    findMany: vi.fn(async () => [...store.values()]),
    create: vi.fn(async data => {
      const p = makeProduct({ ...data, shopId: SHOP, currentStock: data.stockQuantity })
      store.set(p.id, p)
      return p
    }),
    update: vi.fn(async (id, changes) => {
      const existing = store.get(id)
      if (!existing) throw new ProductNotFoundError(id)
      const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() }
      store.set(id, updated)
      return updated
    }),
    softDelete: vi.fn(async id => { store.delete(id) }),
    findCategoryById: vi.fn(async () => null),
    findCategories: vi.fn(async () => []),
    createCategory: vi.fn(async () => { throw new Error('not impl') }),
    updateCategory: vi.fn(async () => { throw new Error('not impl') }),
    findVariants: vi.fn(async () => []),
    createVariant: vi.fn(async () => { throw new Error('not impl') }),
    decrementStock: vi.fn(async (id, qty) => {
      const p = store.get(id)
      if (!p) throw new ProductNotFoundError(id)
      store.set(id, { ...p, currentStock: p.currentStock - qty })
    }),
    incrementStock: vi.fn(async (id, qty) => {
      const p = store.get(id)
      if (!p) throw new ProductNotFoundError(id)
      store.set(id, { ...p, currentStock: p.currentStock + qty })
    }),
    setStock: vi.fn(async (id, newQty) => {
      const p = store.get(id)
      if (!p) throw new ProductNotFoundError(id)
      store.set(id, { ...p, currentStock: newQty })
    }),
  }
}

describe('ProductService', () => {
  it('create emits PRODUCT_CREATED event', async () => {
    getEventBus().clear()
    const repo = mockRepo()
    const service = new ProductService(repo, SHOP, DEVICE)
    const handler = vi.fn()
    const unsub = getEventBus().on(PRODUCT_CREATED, handler)

    const product = await service.create({ name: 'X', sellingPrice: 100 } as any)
    expect(product.name).toBe('X')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].entityId).toBe(product.id)
    unsub()
  })

  it('update with price change emits PRICE_CHANGED', async () => {
    getEventBus().clear()
    const repo = mockRepo()
    const service = new ProductService(repo, SHOP, DEVICE)
    const product = await service.create({ name: 'X', sellingPrice: 100 } as any)

    const priceHandler = vi.fn()
    const unsub = getEventBus().on(PRICE_CHANGED, priceHandler)

    await service.update(product.id, { sellingPrice: 150 })
    expect(priceHandler).toHaveBeenCalledTimes(1)
    expect(priceHandler.mock.calls[0][0].payload.oldPrice).toBe(100)
    expect(priceHandler.mock.calls[0][0].payload.newPrice).toBe(150)
    unsub()
  })

  it('update without price change does not emit PRICE_CHANGED', async () => {
    getEventBus().clear()
    const repo = mockRepo()
    const service = new ProductService(repo, SHOP, DEVICE)
    const product = await service.create({ name: 'X', sellingPrice: 100 } as any)

    const priceHandler = vi.fn()
    const unsub = getEventBus().on(PRICE_CHANGED, priceHandler)
    await service.update(product.id, { name: 'Y' })

    expect(priceHandler).not.toHaveBeenCalled()
    unsub()
  })

  it('delete emits PRODUCT_DELETED', async () => {
    getEventBus().clear()
    const repo = mockRepo()
    const service = new ProductService(repo, SHOP, DEVICE)
    const product = await service.create({ name: 'X', sellingPrice: 100 } as any)

    const handler = vi.fn()
    const unsub = getEventBus().on('product.deleted', handler)
    await service.delete(product.id)
    expect(handler).toHaveBeenCalledTimes(1)
    unsub()
  })
})
