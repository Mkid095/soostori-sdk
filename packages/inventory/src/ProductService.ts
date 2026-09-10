/**
 * ProductService — product CRUD + stock adjustment with SyncEvent emission.
 *
 * Emits: product.created | product.updated | product.archived
 */

import type { Product, Category, SyncEvent, SyncEngine } from '@soostori/contracts'
import type { BusinessId, CategoryId, ProductId, EmployeeId, DeviceId } from '@soostori/core'
import { newId, asProductId, asCategoryId, asSyncEventId, asIdempotencyKey } from '@soostori/core'
import type { StockMovementLedger } from './ledger.js'
import { InsufficientStockError } from './repository.js'

export interface CreateProductInput {
  businessId: BusinessId
  categoryId: CategoryId
  name: string
  sku?: string
  description?: string
  costPrice: number   // KES cents
  sellingPrice: number // KES cents
  initialStock?: number
  lowStockThreshold?: number
}

export interface ProductResult {
  product: Product
  category: Category
}

export interface ProductStore {
  getProduct(id: ProductId): Promise<Product | null>
  upsertProduct(product: Product): Promise<void>
  listProducts(businessId: BusinessId): Promise<Product[]>
  getCategory(id: CategoryId): Promise<Category | null>
  upsertCategory(category: Category): Promise<void>
  listCategories(businessId: BusinessId): Promise<Category[]>
}

function buildProduct(input: CreateProductInput, id: ProductId, now: string): Product {
  return {
    id,
    businessId: input.businessId,
    name: input.name,
    barcode: null,
    sku: input.sku ?? null,
    categoryId: input.categoryId,
    description: input.description ?? null,
    costPrice: input.costPrice as Product['costPrice'],
    sellingPrice: input.sellingPrice as Product['sellingPrice'],
    groupPrices: null,
    isGroup: false,
    unitsPerPackage: 1,
    stockQuantity: input.initialStock ?? 0,
    currentStock: input.initialStock ?? 0,
    lowStockThreshold: input.lowStockThreshold ?? 10,
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
}

function buildCategory(input: { businessId: BusinessId; name: string; description?: string; parentId?: CategoryId }, id: CategoryId, now: string): Category {
  return {
    id,
    businessId: input.businessId,
    name: input.name,
    color: '#6366f1',
    description: input.description ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
  }
}

export class ProductService {
  constructor(
    private readonly store: ProductStore,
    private readonly ledger: StockMovementLedger,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: DeviceId,
    private readonly employeeId: EmployeeId,
  ) {}

  async createProduct(input: CreateProductInput): Promise<ProductResult> {
    const category = await this.store.getCategory(input.categoryId)
    if (!category) throw new Error(`Category ${input.categoryId} not found`)
    if (category.businessId !== this.businessId) throw new Error('Category does not belong to this business')

    const now = new Date().toISOString()
    const productId = asProductId(newId())
    const product = buildProduct(input, productId, now)

    await this.store.upsertProduct(product)

    // If initial stock is provided, apply an opening-stock movement
    if ((input.initialStock ?? 0) > 0) {
      await this.ledger.apply({
        productId,
        type: 'received',
        quantity: input.initialStock!,
        actorType: 'system',
        reason: 'initial_stock',
        idempotencyKey: asIdempotencyKey(newId()),
      })
    }

    await this.emit('product.created', product, 'create')

    return { product, category }
  }

  async getProduct(id: ProductId): Promise<Product | null> {
    const product = await this.store.getProduct(id)
    if (!product) return null
    if (product.businessId !== this.businessId) return null  // enforce isolation before revealing existence
    return product
  }

  async listProducts(businessId: BusinessId): Promise<Product[]> {
    if (businessId !== this.businessId) return []
    return this.store.listProducts(businessId)
  }

  async archiveProduct(id: ProductId): Promise<void> {
    const product = await this.store.getProduct(id)
    if (!product) throw new Error(`Product ${id} not found`)
    if (product.businessId !== this.businessId) throw new Error('Access denied')

    const now = new Date().toISOString()
    const updated: Product = { ...product, isActive: false, updatedAt: now, version: product.version + 1 }
    await this.store.upsertProduct(updated)

    await this.emit('product.archived', updated, 'update')
  }

  async adjustStock(id: ProductId, delta: number, reason: string): Promise<import('@soostori/inventory').StockMovement> {
    const product = await this.store.getProduct(id)
    if (!product) throw new Error(`Product ${id} not found`)
    if (product.businessId !== this.businessId) throw new Error('Access denied')

    // Reject if it would drive stock negative
    if (product.currentStock + delta < 0) {
      throw new InsufficientStockError(id, product.currentStock, Math.abs(delta))
    }

    const movement = await this.ledger.apply({
      productId: id,
      type: 'adjusted',
      quantity: delta,
      actorType: 'employee',
      actorId: this.employeeId,
      reason,
      idempotencyKey: asIdempotencyKey(newId()),
    })

    // Refresh product currentStock after ledger apply
    const updatedProduct: Product = {
      ...product,
      currentStock: movement.balanceAfter,
      stockQuantity: movement.balanceAfter,
      updatedAt: new Date().toISOString(),
      version: product.version + 1,
    }
    await this.store.upsertProduct(updatedProduct)

    await this.emit('product.updated', updatedProduct, 'update')

    return movement
  }

  private async emit(operation: 'product.created' | 'product.updated' | 'product.archived', entity: Product, syncOp: SyncEvent['operation']): Promise<void> {
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: asIdempotencyKey(newId()),
      businessId: this.businessId,
      entityKind: 'product',
      entityId: entity.id,
      operation: syncOp,
      originatingDeviceId: this.deviceId,
      originatingEmployeeId: this.employeeId,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: entity.version,
      payload: entity as unknown as Record<string, unknown>,
      state: 'pending',
    }
    await this.syncEngine.enqueue(event)
  }
}
