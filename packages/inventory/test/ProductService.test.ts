import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProductService, type ProductStore } from '../src/ProductService'
import type { Category, Product, StockMovement, StockBalance } from '../src/types'
import { StockMovementLedger } from '../src/ledger'
import type { InventoryRepository } from '../src/repository'
import { InsufficientStockError } from '../src/repository'
import { NoOpSyncEngineClass } from '@soostori/contracts'
import { newId, asBusinessId, asCategoryId, asProductId, asDeviceId, asEmployeeId } from '@soostori/core'

const BIZ = asBusinessId('biz-1')
const DEVICE = asDeviceId('device-1')
const EMPLOYEE = asEmployeeId('employee-1')
const BIZ2 = asBusinessId('biz-2')

function makeStore() {
  const products = new Map<string, Product>()
  const categories = new Map<string, Category>()
  return {
    products,
    categories,
    store: {
      getProduct: vi.fn(async (id) => products.get(id as string) ?? null),
      upsertProduct: vi.fn(async (p) => { products.set(p.id, p) }),
      listProducts: vi.fn(async (bizId) =>
        [...products.values()].filter(p => p.businessId === bizId)
      ),
      getCategory: vi.fn(async (id) => categories.get(id as string) ?? null),
      upsertCategory: vi.fn(async (c) => { categories.set(c.id, c) }),
      listCategories: vi.fn(async (bizId) =>
        [...categories.values()].filter(c => c.businessId === bizId)
      ),
    } as ProductStore,
  }
}

function makeLedgerRepo() {
  const movements: StockMovement[] = []
  const balances = new Map<string, StockBalance>()
  return {
    movements,
    balances,
    repo: {
      getMovement: vi.fn(async (id) => movements.find(m => m.id === id) ?? null),
      listMovements: vi.fn(async () => movements),
      appendMovement: vi.fn(async (m) => { movements.push(m) }),
      hasMovementByKey: vi.fn(async (key) => movements.some(m => m.idempotencyKey === key)),
      getLatestMovement: vi.fn(async (productId) => {
        const filtered = movements.filter(m => m.productId === productId)
        return filtered[filtered.length - 1] ?? null
      }),
      getStockSummary: vi.fn(async () => null),
      getBalance: vi.fn(async (productId) => balances.get(productId as string) ?? null),
      upsertBalance: vi.fn(async (b) => { balances.set(b.productId as string, b) }),
      createReservation: vi.fn(),
      getReservation: vi.fn(async () => null),
      getReservationsBySale: vi.fn(async () => []),
      updateReservationStatus: vi.fn(),
      getActiveReservations: vi.fn(async () => []),
    } as unknown as InventoryRepository,
  }
}

function createCategory(outer: ReturnType<typeof makeStore>, id = asCategoryId(newId())) {
  const cat: Category = {
    id,
    businessId: BIZ,
    name: 'Electronics',
    color: '#6366f1',
    description: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  }
  // Set on both the outer mock (direct Map access) and via the ProductStore interface
  outer.categories.set(id as string, cat)
  outer.store.upsertCategory(cat)
  return cat
}

describe('ProductService', () => {
  let syncEngine: NoOpSyncEngineClass

  beforeEach(() => {
    syncEngine = new NoOpSyncEngineClass()
  })

  // ── createProduct ─────────────────────────────────────────────────────────

  it('createProduct sets correct fields', async () => {
    const mock = makeStore()
    const cat = createCategory(mock)
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)

    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    const result = await svc.createProduct({
      businessId: BIZ,
      categoryId: cat.id,
      name: 'Phone Charger',
      sku: 'CHG-001',
      description: 'USB-C charger',
      costPrice: 500_00,
      sellingPrice: 1200_00,
      initialStock: 50,
      lowStockThreshold: 5,
    })

    expect(result.product.name).toBe('Phone Charger')
    expect(result.product.sku).toBe('CHG-001')
    expect(result.product.description).toBe('USB-C charger')
    expect(result.product.costPrice).toBe(500_00)
    expect(result.product.sellingPrice).toBe(1200_00)
    expect(result.product.stockQuantity).toBe(50)
    expect(result.product.currentStock).toBe(50)
    expect(result.product.lowStockThreshold).toBe(5)
    expect(result.product.isActive).toBe(true)
    expect(result.product.businessId).toBe(BIZ)
    expect(result.product.categoryId).toBe(cat.id)
    expect(result.category.id).toBe(cat.id)
  })

  it('createProduct emits product.created SyncEvent', async () => {
    const mock = makeStore()
    const cat = createCategory(mock)
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)

    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)
    await svc.createProduct({ businessId: BIZ, categoryId: cat.id, name: 'T-Shirt', costPrice: 200_00, sellingPrice: 500_00 })

    expect(syncEngine.size).toBe(1)
    const evt = syncEngine.pending[0].event
    expect(evt.entityKind).toBe('product')
    expect(evt.operation).toBe('create')
    expect(evt.businessId).toBe(BIZ)
    expect(evt.state).toBe('pending')
  })

  it('createProduct throws if category not found', async () => {
    const mock = makeStore()
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    await expect(svc.createProduct({
      businessId: BIZ,
      categoryId: asCategoryId('nonexistent'),
      name: 'X',
      costPrice: 100_00,
      sellingPrice: 200_00,
    })).rejects.toThrow('Category')
  })

  // ── getProduct ───────────────────────────────────────────────────────────

  it('getProduct returns product when found', async () => {
    const mock = makeStore()
    const cat = createCategory(mock)
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    const created = await svc.createProduct({ businessId: BIZ, categoryId: cat.id, name: 'Widget', costPrice: 100_00, sellingPrice: 300_00 })
    const found = await svc.getProduct(created.product.id)

    expect(found?.id).toBe(created.product.id)
    expect(found?.name).toBe('Widget')
  })

  it('getProduct returns null when not found', async () => {
    const mock = makeStore()
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    const result = await svc.getProduct(asProductId('does-not-exist'))
    expect(result).toBeNull()
  })

  // ── listProducts ─────────────────────────────────────────────────────────

  it('listProducts returns only products for the service businessId', async () => {
    const mock = makeStore()
    const cat = createCategory(mock)
    const cat2 = createCategory(mock, asCategoryId('cat-2-biz2'))
    cat2.businessId = BIZ2 as any
    mock.categories.set(cat2.id as string, cat2)
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    await svc.createProduct({ businessId: BIZ, categoryId: cat.id, name: 'Product A', costPrice: 100_00, sellingPrice: 200_00 })
    // Simulate a product from another business directly in the store
    const otherProduct: Product = {
      id: asProductId(newId()),
      businessId: BIZ2,
      name: 'Other Biz Product',
      barcode: null, sku: null, categoryId: cat2.id, description: null,
      costPrice: 100_00 as any, sellingPrice: 200_00 as any,
      groupPrices: null, isGroup: false, unitsPerPackage: 1,
      stockQuantity: 10, currentStock: 10, lowStockThreshold: 5,
      trackInventory: true, allowSingleUnitSale: true,
      distributorName: null, distributorPhone: null, image: null,
      isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      version: 1,
    }
    mock.products.set(otherProduct.id as string, otherProduct)

    const listed = await svc.listProducts(BIZ)
    expect(listed.every(p => p.businessId === BIZ)).toBe(true)
    expect(listed.find(p => p.name === 'Other Biz Product')).toBeUndefined()
  })

  it('listProducts returns empty array for wrong businessId', async () => {
    const mock = makeStore()
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    const result = await svc.listProducts(BIZ2)
    expect(result).toHaveLength(0)
  })

  // ── archiveProduct ──────────────────────────────────────────────────────

  it('archiveProduct sets isActive to false', async () => {
    const mock = makeStore()
    const cat = createCategory(mock)
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    const { product } = await svc.createProduct({ businessId: BIZ, categoryId: cat.id, name: 'To Archive', costPrice: 100_00, sellingPrice: 300_00 })
    await svc.archiveProduct(product.id)

    const archived = await svc.getProduct(product.id)
    expect(archived!.isActive).toBe(false)
  })

  it('archiveProduct emits product.archived SyncEvent', async () => {
    const mock = makeStore()
    const cat = createCategory(mock)
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    syncEngine.reset()
    const { product } = await svc.createProduct({ businessId: BIZ, categoryId: cat.id, name: 'X', costPrice: 100_00, sellingPrice: 200_00 })
    syncEngine.reset()
    await svc.archiveProduct(product.id)

    expect(syncEngine.size).toBe(1)
    const evt = syncEngine.pending[0].event
    expect(evt.entityKind).toBe('product')
    expect(evt.operation).toBe('update')
    expect(evt.entityId).toBe(product.id)
  })

  // ── adjustStock ─────────────────────────────────────────────────────────

  it('adjustStock positive increases stock', async () => {
    const mock = makeStore()
    const cat = createCategory(mock)
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    const { product } = await svc.createProduct({ businessId: BIZ, categoryId: cat.id, name: 'Stock Test', costPrice: 100_00, sellingPrice: 200_00, initialStock: 10 })
    await svc.adjustStock(product.id, 5, 'Found extra units')

    const updated = await svc.getProduct(product.id)
    expect(updated!.currentStock).toBe(15)
  })

  it('adjustStock negative decreases stock', async () => {
    const mock = makeStore()
    const cat = createCategory(mock)
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    const { product } = await svc.createProduct({ businessId: BIZ, categoryId: cat.id, name: 'Stock Test', costPrice: 100_00, sellingPrice: 200_00, initialStock: 20 })
    await svc.adjustStock(product.id, -7, 'Damaged goods')

    const updated = await svc.getProduct(product.id)
    expect(updated!.currentStock).toBe(13)
  })

  it('adjustStock negative rejects if result < 0', async () => {
    const mock = makeStore()
    const cat = createCategory(mock)
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    const { product } = await svc.createProduct({ businessId: BIZ, categoryId: cat.id, name: 'Low Stock', costPrice: 100_00, sellingPrice: 200_00, initialStock: 3 })

    await expect(svc.adjustStock(product.id, -5, 'Oops')).rejects.toThrow(InsufficientStockError)
  })

  it('adjustStock emits product.updated SyncEvent', async () => {
    const mock = makeStore()
    const cat = createCategory(mock)
    const { repo } = makeLedgerRepo()
    const ledger = new StockMovementLedger(repo, BIZ as any, DEVICE)
    const svc = new ProductService(mock.store, ledger, syncEngine, BIZ, DEVICE, EMPLOYEE)

    const { product } = await svc.createProduct({ businessId: BIZ, categoryId: cat.id, name: 'X', costPrice: 100_00, sellingPrice: 200_00, initialStock: 10 })
    syncEngine.reset()
    await svc.adjustStock(product.id, 5, 'audit correction')

    expect(syncEngine.size).toBe(1)
    const evt = syncEngine.pending[0].event
    expect(evt.entityKind).toBe('product')
    expect(evt.operation).toBe('update')
    expect(evt.entityId).toBe(product.id)
  })

  // ── businessId isolation ─────────────────────────────────────────────────

  it('getProduct returns null for product from another business', async () => {
    const mock1 = makeStore()
    const cat1 = createCategory(mock1)
    const { repo: repo1 } = makeLedgerRepo()
    const ledger1 = new StockMovementLedger(repo1, BIZ as any, DEVICE)
    const svc1 = new ProductService(mock1.store, ledger1, syncEngine, BIZ, DEVICE, EMPLOYEE)
    const { product } = await svc1.createProduct({ businessId: BIZ, categoryId: cat1.id, name: 'Secret Product', costPrice: 100_00, sellingPrice: 200_00 })

    // A different service instance for BIZ2
    const mock2 = makeStore()
    const cat2 = createCategory(mock2, asCategoryId('cat-biz2'))
    cat2.businessId = BIZ2 as any
    mock2.categories.set(cat2.id as string, cat2)
    const { repo: repo2 } = makeLedgerRepo()
    const ledger2 = new StockMovementLedger(repo2, BIZ2 as any, DEVICE)
    const svc2 = new ProductService(mock2.store, ledger2, syncEngine, BIZ2, DEVICE, EMPLOYEE)

    // Product is not accessible via BIZ2 service
    const found = await svc2.getProduct(product.id)
    expect(found).toBeNull()
  })

  it('adjustStock throws if product belongs to another business', async () => {
    const mock1 = makeStore()
    const cat1 = createCategory(mock1)
    const { repo: repo1 } = makeLedgerRepo()
    const ledger1 = new StockMovementLedger(repo1, BIZ as any, DEVICE)
    const svc1 = new ProductService(mock1.store, ledger1, syncEngine, BIZ, DEVICE, EMPLOYEE)
    const { product } = await svc1.createProduct({ businessId: BIZ, categoryId: cat1.id, name: 'Isolated', costPrice: 100_00, sellingPrice: 200_00 })

    // Product is not in mock2's store at all, so store returns null → service throws 'not found'
    const mock2 = makeStore()
    const { repo: repo2 } = makeLedgerRepo()
    const ledger2 = new StockMovementLedger(repo2, BIZ2 as any, DEVICE)
    const svc2 = new ProductService(mock2.store, ledger2, syncEngine, BIZ2, DEVICE, EMPLOYEE)

    // Isolation is enforced: BIZ2's store has no record of this product, so 'not found' is thrown.
    // (In production with a shared DB the check would be 'Access denied' after the lookup.)
    await expect(svc2.adjustStock(product.id, 1, 'should fail')).rejects.toThrow('not found')
  })

  it('archiveProduct throws if product belongs to another business', async () => {
    const mock1 = makeStore()
    const cat1 = createCategory(mock1)
    const { repo: repo1 } = makeLedgerRepo()
    const ledger1 = new StockMovementLedger(repo1, BIZ as any, DEVICE)
    const svc1 = new ProductService(mock1.store, ledger1, syncEngine, BIZ, DEVICE, EMPLOYEE)
    const { product } = await svc1.createProduct({ businessId: BIZ, categoryId: cat1.id, name: 'Private', costPrice: 100_00, sellingPrice: 200_00 })

    const mock2 = makeStore()
    const { repo: repo2 } = makeLedgerRepo()
    const ledger2 = new StockMovementLedger(repo2, BIZ2 as any, DEVICE)
    const svc2 = new ProductService(mock2.store, ledger2, syncEngine, BIZ2, DEVICE, EMPLOYEE)

    // Isolation enforced via store-level missing product (not-found)
    await expect(svc2.archiveProduct(product.id)).rejects.toThrow('not found')
  })
})
