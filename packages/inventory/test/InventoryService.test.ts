import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InventoryService, type ReceiveStockInput, type AdjustStockInput, type TransferStockInput, type StockCountInput } from '../src/InventoryService'
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
  outer.categories.set(id as string, cat)
  outer.store.upsertCategory(cat)
  return cat
}

function createProduct(outer: ReturnType<typeof makeStore>, opts: {
  name?: string
  stock?: number
  threshold?: number
  costPrice?: number
  businessId?: BusinessId
} = {}) {
  const cat = createCategory(outer)
  const productId = asProductId(newId())
  const now = new Date().toISOString()
  const product: Product = {
    id: productId,
    businessId: opts.businessId ?? BIZ,
    name: opts.name ?? 'Widget',
    barcode: null,
    sku: null,
    categoryId: cat.id,
    description: null,
    costPrice: opts.costPrice ?? 500_00,
    sellingPrice: 1200_00,
    groupPrices: null,
    isGroup: false,
    unitsPerPackage: 1,
    stockQuantity: opts.stock ?? 0,
    currentStock: opts.stock ?? 0,
    lowStockThreshold: opts.threshold ?? 10,
    trackInventory: true,
    allowSingleUnitSale: true,
    distributorName: null,
    distributorPhone: null,
    image: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
  }
  outer.products.set(productId as string, product)
  outer.store.upsertProduct(product)
  return product
}

function buildInventoryService(mock: ReturnType<typeof makeStore>, repo: ReturnType<typeof makeLedgerRepo>, biz = BIZ) {
  const ledger = new StockMovementLedger(repo.repo, biz as any, DEVICE)
  const syncEngine = new NoOpSyncEngineClass()
  const svc = new InventoryService(mock.store, ledger, syncEngine, biz, DEVICE, EMPLOYEE)
  return { svc, syncEngine, ledger, repo }
}

describe('InventoryService', () => {

  // ── receiveStock ─────────────────────────────────────────────────────────────

  describe('receiveStock', () => {
    it('creates a StockMovement and increases product stock', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 20 })
      const { svc, repo: r } = buildInventoryService(mock, repo)

      const movement = await svc.receiveStock({
        businessId: BIZ,
        productId: product.id,
        quantity: 50,
        supplier: 'Acme Corp',
        notes: 'PO-001',
      })

      expect(movement.type).toBe('received')
      expect(movement.quantity).toBe(50)
      expect(movement.balanceAfter).toBe(70)

      const updated = await mock.store.getProduct(product.id)
      expect(updated!.currentStock).toBe(70)
      expect(r.movements).toHaveLength(1)
    })

    it('rejects receive for wrong businessId', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock)
      const { svc } = buildInventoryService(mock, repo)

      await expect(svc.receiveStock({
        businessId: BIZ2,
        productId: product.id,
        quantity: 10,
      })).rejects.toThrow('Access denied')
    })

    it('rejects receive for nonexistent product', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const { svc } = buildInventoryService(mock, repo)

      await expect(svc.receiveStock({
        businessId: BIZ,
        productId: asProductId('does-not-exist'),
        quantity: 10,
      })).rejects.toThrow('not found')
    })
  })

  // ── adjustStock ─────────────────────────────────────────────────────────────

  describe('adjustStock', () => {
    it('positive delta increases stock', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 10 })
      const { svc } = buildInventoryService(mock, repo)

      const movement = await svc.adjustStock({
        businessId: BIZ,
        productId: product.id,
        delta: 5,
        reason: 'correction',
      })

      expect(movement.type).toBe('adjusted')
      expect(movement.quantity).toBe(5)
      expect(movement.balanceAfter).toBe(15)
    })

    it('negative delta decreases stock', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 10 })
      const { svc } = buildInventoryService(mock, repo)

      const movement = await svc.adjustStock({
        businessId: BIZ,
        productId: product.id,
        delta: -3,
        reason: 'breakage',
      })

      expect(movement.quantity).toBe(-3)
      expect(movement.balanceAfter).toBe(7)
    })

    it('rejects adjustment that would drive stock below zero', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 5 })
      const { svc } = buildInventoryService(mock, repo)

      await expect(svc.adjustStock({
        businessId: BIZ,
        productId: product.id,
        delta: -10,
        reason: 'theft',
      })).rejects.toThrow(InsufficientStockError)
    })

    it('rejects adjustment for wrong businessId', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock)
      const { svc } = buildInventoryService(mock, repo)

      await expect(svc.adjustStock({
        businessId: BIZ2,
        productId: product.id,
        delta: 1,
        reason: 'correction',
      })).rejects.toThrow('Access denied')
    })
  })

  // ── transferStock ────────────────────────────────────────────────────────────

  describe('transferStock', () => {
    it('creates both from and to movements', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 100 })
      const { svc } = buildInventoryService(mock, repo)

      const result = await svc.transferStock({
        fromBusinessId: BIZ,
        toBusinessId: BIZ2,
        productId: product.id,
        quantity: 30,
      })

      expect(result.fromMovement.type).toBe('transferred')
      expect(result.fromMovement.quantity).toBe(-30)
      expect(result.fromMovement.balanceAfter).toBe(70)

      expect(result.toMovement.type).toBe('received')
      expect(result.toMovement.quantity).toBe(30)
    })

    it('rejects transfer from wrong businessId', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 100 })
      const { svc } = buildInventoryService(mock, repo)

      await expect(svc.transferStock({
        fromBusinessId: BIZ2,
        toBusinessId: BIZ,
        productId: product.id,
        quantity: 10,
      })).rejects.toThrow('Access denied')
    })

    it('rejects transfer when stock is insufficient', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 5 })
      const { svc } = buildInventoryService(mock, repo)

      await expect(svc.transferStock({
        fromBusinessId: BIZ,
        toBusinessId: BIZ2,
        productId: product.id,
        quantity: 10,
      })).rejects.toThrow(InsufficientStockError)
    })
  })

  // ── countStock ───────────────────────────────────────────────────────────────

  describe('countStock', () => {
    it('creates adjustments for products with variance', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product1 = createProduct(mock, { stock: 100 })
      const product2 = createProduct(mock, { stock: 50 })
      const { svc } = buildInventoryService(mock, repo)

      const result = await svc.countStock({
        businessId: BIZ,
        counts: [
          { productId: product1.id, counted: 95, system: 100 },  // -5
          { productId: product2.id, counted: 60, system: 50 },    // +10
        ],
      })

      expect(result.adjustments).toHaveLength(2)
      const adj1 = result.adjustments.find(a => a.productId === product1.id)
      expect(adj1!.quantity).toBe(-5)
      const adj2 = result.adjustments.find(a => a.productId === product2.id)
      expect(adj2!.quantity).toBe(10)
    })

    it('skips products where counted equals system (zero variance)', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 100 })
      const { svc } = buildInventoryService(mock, repo)

      const result = await svc.countStock({
        businessId: BIZ,
        counts: [{ productId: product.id, counted: 100, system: 100 }],
      })

      expect(result.adjustments).toHaveLength(0)
    })

    it('rejects countStock for wrong businessId', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock)
      const { svc } = buildInventoryService(mock, repo)

      await expect(svc.countStock({
        businessId: BIZ2,
        counts: [{ productId: product.id, counted: 10, system: 5 }],
      })).rejects.toThrow('Access denied')
    })
  })

  // ── getLowStockProducts ───────────────────────────────────────────────────────

  describe('getLowStockProducts', () => {
    it('returns only products where quantity <= threshold', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      createProduct(mock, { name: 'Normal', stock: 50, threshold: 10 })
      createProduct(mock, { name: 'Low Stock', stock: 5, threshold: 10 })
      createProduct(mock, { name: 'Exactly Threshold', stock: 10, threshold: 10 })
      createProduct(mock, { name: 'Inactive', stock: 1, threshold: 10, businessId: BIZ2 as any })
      const { svc } = buildInventoryService(mock, repo)

      const alerts = await svc.getLowStockProducts(BIZ)

      expect(alerts).toHaveLength(2)
      expect(alerts.map(a => a.productName).sort()).toEqual(['Exactly Threshold', 'Low Stock'])
      for (const a of alerts) {
        expect(a.currentStock).toBeLessThanOrEqual(a.threshold)
      }
    })

    it('returns empty array when no products are low stock', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      createProduct(mock, { name: 'Well Stocked', stock: 100, threshold: 10 })
      const { svc } = buildInventoryService(mock, repo)

      const alerts = await svc.getLowStockProducts(BIZ)
      expect(alerts).toHaveLength(0)
    })

    it('businessId isolation: only returns products for the service businessId', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      createProduct(mock, { name: 'Biz1 Product', stock: 2, threshold: 10 })
      createProduct(mock, { name: 'Biz2 Product', stock: 2, threshold: 10, businessId: BIZ2 as any })
      const { svc } = buildInventoryService(mock, repo)

      const alerts = await svc.getLowStockProducts(BIZ)
      expect(alerts).toHaveLength(1)
      expect(alerts[0].productName).toBe('Biz1 Product')
    })
  })

  // ── getInventoryValuation ───────────────────────────────────────────────────

  describe('getInventoryValuation', () => {
    it('returns quantity * costPrice for each active product', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      createProduct(mock, { name: 'Item A', stock: 10, costPrice: 500_00 })  // value = 5000_00
      createProduct(mock, { name: 'Item B', stock: 3, costPrice: 1200_00 })   // value = 3600_00
      const { svc } = buildInventoryService(mock, repo)

      const valuation = await svc.getInventoryValuation(BIZ)

      expect(valuation).toHaveLength(2)
      const itemA = valuation.find(v => v.name === 'Item A')!
      expect(itemA.quantity).toBe(10)
      expect(itemA.costPrice).toBe(500_00)
      expect(itemA.value).toBe(5000_00)

      const itemB = valuation.find(v => v.name === 'Item B')!
      expect(itemB.value).toBe(3600_00)
    })

    it('returns empty array when no active products', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const { svc } = buildInventoryService(mock, repo)

      const valuation = await svc.getInventoryValuation(BIZ)
      expect(valuation).toHaveLength(0)
    })
  })

  // ── SyncEvent emission ───────────────────────────────────────────────────────

  describe('SyncEvent emission', () => {
    it('emits inventory.received on receiveStock', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 0 })
      const { svc, syncEngine } = buildInventoryService(mock, repo)

      await svc.receiveStock({ businessId: BIZ, productId: product.id, quantity: 10 })

      expect(syncEngine.size).toBe(1)
      const evt = syncEngine.pending[0].event
      expect(evt.entityKind).toBe('inventory')
      expect(evt.businessId).toBe(BIZ)
      expect(evt.state).toBe('pending')
    })

    it('emits inventory.adjusted on adjustStock', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 10 })
      const { svc, syncEngine } = buildInventoryService(mock, repo)

      await svc.adjustStock({ businessId: BIZ, productId: product.id, delta: 5, reason: 'correction' })

      expect(syncEngine.size).toBe(1)
      expect(syncEngine.pending[0].event.entityKind).toBe('inventory')
    })

    it('emits inventory.transferred on transferStock', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 100 })
      const { svc, syncEngine } = buildInventoryService(mock, repo)

      await svc.transferStock({ fromBusinessId: BIZ, toBusinessId: BIZ2, productId: product.id, quantity: 20 })

      expect(syncEngine.size).toBe(1)
      expect(syncEngine.pending[0].event.entityKind).toBe('inventory')
    })

    it('emits inventory.counted on countStock', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 50 })
      const { svc, syncEngine } = buildInventoryService(mock, repo)

      await svc.countStock({ businessId: BIZ, counts: [{ productId: product.id, counted: 45, system: 50 }] })

      expect(syncEngine.size).toBe(1)
      expect(syncEngine.pending[0].event.entityKind).toBe('inventory')
    })

    it('each mutation emits exactly one event', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock, { stock: 10 })
      const { svc, syncEngine } = buildInventoryService(mock, repo)

      await svc.receiveStock({ businessId: BIZ, productId: product.id, quantity: 5 })
      await svc.adjustStock({ businessId: BIZ, productId: product.id, delta: 2, reason: 'correction' })

      expect(syncEngine.size).toBe(2)
    })
  })

  // ── businessId isolation ─────────────────────────────────────────────────────

  describe('businessId isolation', () => {
    it('operations reject if businessId does not match service instance', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      const product = createProduct(mock)
      const { svc } = buildInventoryService(mock, repo, BIZ2)

      for (const op of [
        () => svc.receiveStock({ businessId: BIZ, productId: product.id, quantity: 5 }),
        () => svc.adjustStock({ businessId: BIZ, productId: product.id, delta: 1, reason: 'correction' }),
        () => svc.countStock({ businessId: BIZ, counts: [] }),
      ]) {
        await expect(op()).rejects.toThrow('Access denied')
      }
    })

    it('getLowStockProducts only sees own business products', async () => {
      const mock = makeStore()
      const { repo } = makeLedgerRepo()
      createProduct(mock, { name: 'My Low', stock: 2, threshold: 10 })
      createProduct(mock, { name: 'Other Low', stock: 2, threshold: 10, businessId: BIZ2 as any })
      const { svc } = buildInventoryService(mock, repo, BIZ2)

      const alerts = await svc.getLowStockProducts(BIZ2)
      expect(alerts).toHaveLength(1)
      expect(alerts[0].productName).toBe('My Low')
    })
  })
})
