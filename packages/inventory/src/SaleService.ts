/**
 * SaleService — sale + sale-item mutation with SyncEvent emission.
 *
 * Emits:
 *   - sale.created      — on confirmSale()
 *   - sale.cancelled    — on cancelSale()
 *   - saleItem.created  — on confirmSale() for each line item
 *
 * Idempotency:
 *   - confirmSale() is idempotent: same idempotencyKey returns the existing sale.
 *   - Stock deduction via ledger is keyed by (saleId, productId) idempotency key —
 *     replay of the same sale does NOT double-deplete stock.
 *   - cancelSale() records a sale.cancelled event; stock is restored via a
 *     compensating 'returned' movement also keyed by idempotencyKey.
 */

import type {
  Sale,
  SaleLineItem,
  SyncEvent,
  SyncEngine,
} from '@soostori/contracts'
import type {
  StockMovement,
} from './types.js'  // ledger's own StockMovement shape
import type {
  BusinessId,
  SaleId,
  SaleItemId,
  ProductId,
  EmployeeId,
  DeviceId,
  CustomerId,
  ISO8601,
  Money,
  IdempotencyKey,
} from '@soostori/core'
import {
  newId,
  asSaleId,
  asSaleItemId,
  asProductId,
  asSyncEventId,
  asIdempotencyKey,
} from '@soostori/core'
import type { StockMovementLedger } from './ledger.js'
import type { SaleRepository } from './repository.js'

export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'transfer' | 'debt'

export interface CreateSaleInput {
  businessId: BusinessId
  type: 'retail' | 'wholesale'
  subtotal: Money
  discountAmount: Money
  taxAmount: Money
  totalAmount: Money
  paidAmount: Money
  paymentMethod: PaymentMethod
  note?: string
  customerId?: CustomerId | null
  /** The idempotency key is supplied by the calling POS to prevent duplicate
   * submission when the same sale is retried after a network failure. */
  idempotencyKey: IdempotencyKey
  items: CreateSaleItemInput[]
}

export interface CreateSaleItemInput {
  productId: ProductId
  productName: string
  variationName?: string | null
  quantity: number
  unitPrice: Money
  discount: Money
  totalPrice: Money
}

export interface SaleResult {
  sale: Sale
  items: SaleLineItem[]
  movements: StockMovement[]
}

/** Alias for the SaleRepository interface from repository.ts. */
export type SaleStore = SaleRepository

function buildSale(
  input: CreateSaleInput,
  id: SaleId,
  now: string,
): Sale {
  return {
    id,
    businessId: input.businessId,
    type: input.type,
    status: 'pending',
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    taxAmount: input.taxAmount,
    totalAmount: input.totalAmount,
    paidAmount: input.paidAmount,
    paymentMethod: input.paymentMethod,
    note: input.note ?? null,
    customerId: input.customerId ?? null,
    employeeId: '' as EmployeeId, // filled by caller
    deviceId: '' as DeviceId,     // filled by caller
    idempotencyKey: input.idempotencyKey,
    items: [],
    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
    version: 1,
  }
}

function buildSaleItem(
  saleId: SaleId,
  input: CreateSaleItemInput,
  businessId: BusinessId,
  id: SaleItemId,
  now: string,
): SaleLineItem {
  return {
    id,
    saleId,
    businessId,
    productId: input.productId,
    productName: input.productName,
    variationName: input.variationName ?? null,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    discount: input.discount,
    totalPrice: input.totalPrice,
    createdAt: now,
    updatedAt: now,
    version: 1,
  }
}

export class SaleService {
  constructor(
    private readonly store: SaleStore,
    private readonly ledger: StockMovementLedger,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: DeviceId,
    private readonly employeeId: EmployeeId,
  ) {}

  /**
   * Create and confirm a sale in one atomic-ish step.
   *
   * Idempotent: if a sale with the same idempotencyKey already exists,
   * returns that sale without re-deducting stock.
   */
  async confirmSale(input: CreateSaleInput): Promise<SaleResult> {
    if (input.businessId !== this.businessId) throw new Error('Business isolation violation')

    // ── Idempotency check ──────────────────────────────────────────────────
    const existing = await this.store.getSaleByIdempotencyKey(input.idempotencyKey)
    if (existing) {
      // Already processed — return as-is (caller must check version)
      const items = await this.store.listSaleItems(existing.id)
      return { sale: existing, items, movements: [] }
    }

    const now = new Date().toISOString()
    const saleId = asSaleId(newId())

    // ── Build and persist sale ─────────────────────────────────────────────
    const sale: Sale = {
      ...buildSale(input, saleId, now),
      employeeId: this.employeeId,
      deviceId: this.deviceId,
    }

    // ── Build sale items + deduct stock ────────────────────────────────────
    const items: SaleLineItem[] = []
    const movements: StockMovement[] = []

    for (const itemInput of input.items) {
      const itemId = asSaleItemId(newId())
      const item = buildSaleItem(saleId, itemInput, this.businessId, itemId, now)
      items.push(item)
      await this.store.upsertSaleItem(item)

      // Stock deduction — keyed by (saleId, productId) so replay does NOT
      // double-deplete. The idempotencyKey encodes both references.
      const movementIdempotencyKey = asIdempotencyKey(
        `${saleId}:${itemInput.productId}`,
      )
      const movement = await this.ledger.apply({
        productId: itemInput.productId,
        type: 'sold',
        quantity: -itemInput.quantity,
        referenceId: saleId,
        referenceType: 'sale',
        reason: 'sale_confirmed',
        actorType: 'employee',
        actorId: this.employeeId,
        idempotencyKey: movementIdempotencyKey,
      })
      movements.push(movement)
    }

    sale.status = 'confirmed'
    sale.confirmedAt = now
    sale.version = 1
    await this.store.upsertSale(sale)

    // ── Emit sync events ────────────────────────────────────────────────────
    await this.emitSaleEvent('sale.created', sale, 'create')

    for (const item of items) {
      await this.emitSaleItemEvent('saleItem.created', item, 'create')
    }

    return { sale, items, movements }
  }

  /**
   * Cancel a sale: mark it cancelled and restore stock.
   *
   * Idempotent: if the sale is already cancelled, returns without re-restoring.
   */
  async cancelSale(saleId: SaleId, reason?: string): Promise<Sale> {
    const sale = await this.store.getSale(saleId)
    if (!sale) throw new Error(`Sale ${saleId} not found`)
    if (sale.businessId !== this.businessId) throw new Error('Business isolation violation')
    if (sale.status === 'cancelled') return sale  // idempotent

    const now = new Date().toISOString()
    const items = await this.store.listSaleItems(saleId)

    // Restore stock per item — keyed by (saleId, productId) so replay is safe.
    for (const item of items) {
      const movementIdempotencyKey = asIdempotencyKey(
        `cancel:${saleId}:${item.productId}`,
      )
      await this.ledger.apply({
        productId: item.productId,
        type: 'returned',
        quantity: item.quantity,
        referenceId: saleId,
        referenceType: 'sale',
        reason: reason ?? 'sale_cancelled',
        actorType: 'employee',
        actorId: this.employeeId,
        idempotencyKey: movementIdempotencyKey,
      })
    }

    const cancelled: Sale = {
      ...sale,
      status: 'cancelled',
      updatedAt: now,
      version: sale.version + 1,
    }
    await this.store.upsertSale(cancelled)

    await this.emitSaleEvent('sale.cancelled', cancelled, 'update')

    return cancelled
  }

  async getSale(id: SaleId): Promise<Sale | null> {
    const sale = await this.store.getSale(id)
    if (!sale) return null
    if (sale.businessId !== this.businessId) return null
    return sale
  }

  async listSales(): Promise<Sale[]> {
    return this.store.listSales(this.businessId)
  }

  async getSaleItems(saleId: SaleId): Promise<SaleLineItem[]> {
    return this.store.listSaleItems(saleId)
  }

  // ── Private emit helpers ─────────────────────────────────────────────────────

  private async emitSaleEvent(
    eventType: 'sale.created' | 'sale.cancelled',
    entity: Sale,
    syncOp: SyncEvent['operation'],
  ): Promise<void> {
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: entity.idempotencyKey,
      businessId: this.businessId,
      entityKind: 'sale',
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

  private async emitSaleItemEvent(
    eventType: 'saleItem.created',
    entity: SaleLineItem,
    syncOp: SyncEvent['operation'],
  ): Promise<void> {
    // Use composite idempotency key: saleId + itemId to avoid collisions
    // across different sales.
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: asIdempotencyKey(`${entity.saleId}:${entity.id}`),
      businessId: this.businessId,
      entityKind: 'saleLineItem',
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
