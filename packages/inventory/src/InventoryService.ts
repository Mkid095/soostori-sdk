/**
 * InventoryService — stock operations beyond what ProductService.adjustStock covers.
 *
 * Exposes:
 *   - receiveStock      → increases stock (from supplier)
 *   - adjustStock       → manual correction ±
 *   - transferStock     → moves stock between businesses
 *   - countStock        → physical count vs system count → variance adjustments
 *   - getLowStockProducts
 *   - getInventoryValuation
 *
 * Emits: inventory.received | inventory.adjusted | inventory.transferred | inventory.counted
 */

import type { SyncEvent, SyncEngine } from '@soostori/contracts'
import type {
  BusinessId, ProductId, EmployeeId, DeviceId, Product, StockMovement,
} from '@soostori/inventory'
import type { StockMovementLedger } from './ledger.js'
import type { ProductStore } from './ProductService.js'
import { InsufficientStockError } from './repository.js'
import { newId, asSyncEventId, asIdempotencyKey } from '@soostori/core'

// ── Input types ────────────────────────────────────────────────────────────────

export interface ReceiveStockInput {
  businessId: BusinessId
  productId: ProductId
  quantity: number          // positive integer
  supplier?: string
  notes?: string
}

export interface AdjustStockInput {
  businessId: BusinessId
  productId: ProductId
  delta: number             // positive or negative
  reason: AdjustStockReason
  notes?: string
}

export type AdjustStockReason =
  | 'breakage'
  | 'theft'
  | 'correction'
  | 'return'
  | 'other'

export interface TransferStockInput {
  fromBusinessId: BusinessId
  toBusinessId: BusinessId
  productId: ProductId
  quantity: number
}

export interface StockCountInput {
  businessId: BusinessId
  counts: Array<{ productId: ProductId; counted: number; system: number }>
}

export interface LowStockAlert {
  productId: ProductId
  productName: string
  currentStock: number
  threshold: number
}

export interface InventoryValuationEntry {
  productId: ProductId
  name: string
  quantity: number
  costPrice: number   // KES cents
  value: number       // quantity × costPrice  (KES cents)
}

// ── Service ────────────────────────────────────────────────────────────────────

export class InventoryService {
  constructor(
    private readonly store: ProductStore,
    private readonly ledger: StockMovementLedger,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: DeviceId,
    private readonly employeeId: EmployeeId,
  ) {}

  // ── receiveStock ─────────────────────────────────────────────────────────────

  async receiveStock(input: ReceiveStockInput): Promise<StockMovement> {
    if (input.businessId !== this.businessId) throw new Error('Access denied')
    const product = await this.store.getProduct(input.productId)
    if (!product) throw new Error(`Product ${input.productId} not found`)
    if (product.businessId !== this.businessId) throw new Error('Access denied')

    const movement = await this.ledger.apply({
      productId: input.productId,
      type: 'received',
      quantity: input.quantity,
      reason: input.supplier ?? 'receive',
      actorType: 'employee',
      actorId: this.employeeId,
      idempotencyKey: asIdempotencyKey(newId()),
    })

    await this.store.upsertProduct({
      ...product,
      currentStock: movement.balanceAfter,
      stockQuantity: movement.balanceAfter,
      updatedAt: new Date().toISOString(),
      version: product.version + 1,
    })

    await this.emit('inventory.received', movement, input)
    return movement
  }

  // ── adjustStock ──────────────────────────────────────────────────────────────

  async adjustStock(input: AdjustStockInput): Promise<StockMovement> {
    if (input.businessId !== this.businessId) throw new Error('Access denied')
    const product = await this.store.getProduct(input.productId)
    if (!product) throw new Error(`Product ${input.productId} not found`)
    if (product.businessId !== this.businessId) throw new Error('Access denied')

    // Ledger rejects if resulting balance would go negative
    const movement = await this.ledger.apply({
      productId: input.productId,
      type: 'adjusted',
      quantity: input.delta,
      reason: input.reason,
      actorType: 'employee',
      actorId: this.employeeId,
      idempotencyKey: asIdempotencyKey(newId()),
    })

    await this.store.upsertProduct({
      ...product,
      currentStock: movement.balanceAfter,
      stockQuantity: movement.balanceAfter,
      updatedAt: new Date().toISOString(),
      version: product.version + 1,
    })

    await this.emit('inventory.adjusted', movement, input)
    return movement
  }

  // ── transferStock ───────────────────────────────────────────────────────────

  async transferStock(input: TransferStockInput): Promise<{ fromMovement: StockMovement; toMovement: StockMovement }> {
    if (input.fromBusinessId !== this.businessId) throw new Error('Access denied')

    const product = await this.store.getProduct(input.productId)
    if (!product) throw new Error(`Product ${input.productId} not found`)
    if (product.businessId !== this.businessId) throw new Error('Access denied')

    // Deduct from source
    const fromMovement = await this.ledger.apply({
      productId: input.productId,
      type: 'transferred',
      quantity: -input.quantity,
      referenceId: input.toBusinessId,
      referenceType: 'transfer',
      reason: `transfer_to:${input.toBusinessId}`,
      actorType: 'employee',
      actorId: this.employeeId,
      idempotencyKey: asIdempotencyKey(newId()),
    })

    // NOTE: The `to` business receives stock via its own InventoryService instance
    // (or a cross-business movement path). Here we emit the event so the caller
    // can relay to the destination business's sync pipeline.

    await this.store.upsertProduct({
      ...product,
      currentStock: fromMovement.balanceAfter,
      stockQuantity: fromMovement.balanceAfter,
      updatedAt: new Date().toISOString(),
      version: product.version + 1,
    })

    // Synthesise the to-movement (destination business applies it via its own ledger)
    const now = new Date().toISOString()
    const toMovement: StockMovement = {
      id: newId() as StockMovement['id'],
      shopId: input.toBusinessId as StockMovement['shopId'],
      productId: input.productId,
      productVariantId: null,
      type: 'received',
      quantity: input.quantity,
      balanceAfter: input.quantity, // will be recomputed by destination ledger
      referenceId: input.fromBusinessId,
      referenceType: 'transfer',
      reason: `transfer_from:${input.fromBusinessId}`,
      actorType: 'employee',
      actorId: this.employeeId,
      deviceId: this.deviceId,
      timestamp: now,
      sequence: 0,
      idempotencyKey: asIdempotencyKey(newId()),
      syncedAt: null,
    }

    await this.emit('inventory.transferred', { fromMovement, toMovement }, input)
    return { fromMovement, toMovement }
  }

  // ── countStock ───────────────────────────────────────────────────────────────

  async countStock(input: StockCountInput): Promise<{ adjustments: StockMovement[] }> {
    if (input.businessId !== this.businessId) throw new Error('Access denied')

    const adjustments: StockMovement[] = []

    for (const count of input.counts) {
      const product = await this.store.getProduct(count.productId)
      if (!product) throw new Error(`Product ${count.productId} not found`)
      if (product.businessId !== this.businessId) throw new Error('Access denied')

      const variance = count.counted - count.system
      if (variance === 0) continue  // no adjustment needed

      const movement = await this.ledger.apply({
        productId: count.productId,
        type: 'adjusted',
        quantity: variance,
        reason: 'stocktake',
        actorType: 'employee',
        actorId: this.employeeId,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      await this.store.upsertProduct({
        ...product,
        currentStock: movement.balanceAfter,
        stockQuantity: movement.balanceAfter,
        updatedAt: new Date().toISOString(),
        version: product.version + 1,
      })

      adjustments.push(movement)
    }

    await this.emit('inventory.counted', { adjustments }, input)
    return { adjustments }
  }

  // ── getLowStockProducts ─────────────────────────────────────────────────────

  async getLowStockProducts(_businessId: BusinessId): Promise<LowStockAlert[]> {
    // businessId enforced at service instantiation level (this.businessId)
    const products = await this.store.listProducts(this.businessId)
    return products
      .filter(p => p.isActive && p.currentStock <= p.lowStockThreshold)
      .map(p => ({
        productId: p.id,
        productName: p.name,
        currentStock: p.currentStock,
        threshold: p.lowStockThreshold,
      }))
  }

  // ── getInventoryValuation ───────────────────────────────────────────────────

  async getInventoryValuation(_businessId: BusinessId): Promise<InventoryValuationEntry[]> {
    const products = await this.store.listProducts(this.businessId)
    return products
      .filter(p => p.isActive)
      .map(p => ({
        productId: p.id,
        name: p.name,
        quantity: p.currentStock,
        costPrice: p.costPrice,
        value: Math.round(p.currentStock * p.costPrice),
      }))
  }

  // ── emit ────────────────────────────────────────────────────────────────────

  private async emit(
    eventType: 'inventory.received' | 'inventory.adjusted' | 'inventory.transferred' | 'inventory.counted',
    payload: unknown,
    _input: unknown,
  ): Promise<void> {
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: asIdempotencyKey(newId()),
      businessId: this.businessId,
      entityKind: 'inventory',
      entityId: (payload as any)?.fromMovement?.id ?? (payload as any)?.id ?? newId() as any,
      operation: 'update',
      originatingDeviceId: this.deviceId,
      originatingEmployeeId: this.employeeId,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: 1,
      payload: payload as Record<string, unknown>,
      state: 'pending',
    }
    await this.syncEngine.enqueue(event)
  }
}
