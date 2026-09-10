/**
 * SaleService — POS sale operations with SyncEvent emission.
 *
 * Emits:
 *   - sale.created   — on createSale()
 *   - sale.voided    — on voidSale()
 *   - sale.refunded  — on refundSale()
 *
 * All mutations are scoped to a single businessId (business isolation).
 * Stock is not managed here — callers (desktop/mobile adapters) are responsible
 * for decrementing/incrementing inventory, or delegating to the inventory adapter.
 */

import type {
  Sale,
  SaleItem,
  Refund,
  CreateSaleInput,
  RefundSaleInput,
  SaleRepository,
  Business,
} from './types.js'
import type { SyncEngine } from '@soostori/contracts'
import {
  newId,
  asSaleId,
  asSaleItemId,
  asSyncEventId,
  asIdempotencyKey,
  type BusinessId,
  type SaleId,
  type SaleItemId,
  type ProductId,
  type EmployeeId,
  type DeviceId,
  type ISO8601,
  type Money,
} from '@soostori/core'
import { SaleNotFoundError, type Receipt } from './types.js'
import { formatReceipt } from './ReceiptFormatter.js'
import type { SyncEvent } from '@soostori/contracts'

// ── Emitted event names ─────────────────────────────────────────────────────────
export type SaleEventName = 'sale.created' | 'sale.voided' | 'sale.refunded'

export class SaleService {
  constructor(
    private readonly store: SaleRepository,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: DeviceId,
    private readonly employeeId: EmployeeId,
  ) {}

  // ── createSale ───────────────────────────────────────────────────────────────

  /**
   * Create a completed sale with all line items.
   *
   * Steps:
   *  1. Validate stock for each line item (caller or adapter handles decrement).
   *  2. Compute subtotal, discounts, total, change.
   *  3. Persist sale + sale items.
   *  4. Emit `sale.created` SyncEvent.
   */
  async createSale(
    input: CreateSaleInput,
    productNames: Map<ProductId, string>,
    business: Business,
    cashierName: string,
  ): Promise<{ sale: Sale; receipt: Receipt }> {
    if (input.businessId !== this.businessId) {
      throw new Error('Business isolation violation')
    }

    const now = new Date().toISOString()
    const saleId = asSaleId(newId())

    // Compute totals
    const lineItems: SaleItem[] = []
    let subtotal: Money = 0

    for (const li of input.lineItems) {
      const itemSubtotal = li.quantity * li.unitPrice
      const itemDiscount = li.discount ?? 0
      const itemTotal = itemSubtotal - itemDiscount
      subtotal += itemTotal

      const itemId = asSaleItemId(newId())
      lineItems.push({
        id: itemId,
        saleId,
        businessId: this.businessId,
        productId: li.productId,
        productName: productNames.get(li.productId) ?? String(li.productId),
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        discount: itemDiscount,
        totalPrice: itemTotal,
        createdAt: now,
        updatedAt: now,
        version: 1,
      })
    }

    const saleDiscount: Money = input.saleDiscount ?? 0
    const taxRate = business.taxRate ?? 0
    const taxableAmount = subtotal - saleDiscount
    const taxAmount: Money = Math.round(taxableAmount * taxRate)
    const totalAmount: Money = taxableAmount + taxAmount
    const changeGiven: Money = Math.max(0, input.amountTendered - totalAmount)

    const sale: Sale = {
      id: saleId,
      businessId: this.businessId,
      registerId: input.registerId,
      cashierId: input.cashierId,
      customerId: input.customerId ?? null,
      status: 'completed',
      subtotal,
      discountAmount: 0, // per-item discounts folded into line items
      saleDiscount,
      taxAmount,
      totalAmount,
      paidAmount: input.amountTendered,
      amountTendered: input.amountTendered,
      changeGiven,
      paymentMethod: input.paymentMethod,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }

    // Persist sale + items
    await this.store.upsertSale(sale)
    for (const item of lineItems) {
      await this.store.upsertSaleItem(item)
    }

    // Emit sale.created
    await this.emitEvent('sale.created', saleId, sale, 'create')

    const receipt = formatReceipt(sale, lineItems, business, cashierName)
    return { sale, receipt }
  }

  // ── voidSale ────────────────────────────────────────────────────────────────

  /**
   * Void a sale — marks it voided. Caller is responsible for restoring stock.
   * Emits `sale.voided` SyncEvent.
   */
  async voidSale(saleId: SaleId, reason: string): Promise<void> {
    const sale = await this.store.getSale(saleId)
    if (!sale) throw new SaleNotFoundError(saleId)
    if (sale.businessId !== this.businessId) throw new Error('Business isolation violation')
    if (sale.status === 'voided') return // idempotent

    const now = new Date().toISOString()
    const voided: Sale = {
      ...sale,
      status: 'voided',
      notes: sale.notes ? `${sale.notes}\n[VOIDED: ${reason}]` : `[VOIDED: ${reason}]`,
      updatedAt: now,
      version: sale.version + 1,
    }

    await this.store.upsertSale(voided)
    await this.emitEvent('sale.voided', saleId, voided, 'update')
  }

  // ── refundSale ──────────────────────────────────────────────────────────────

  /**
   * Refund a sale — full or partial. Caller is responsible for restoring stock.
   * Emits `sale.refunded` SyncEvent.
   */
  async refundSale(
    input: RefundSaleInput,
    business: Business,
    cashierName: string,
  ): Promise<{ refund: Refund; receipt: Receipt }> {
    const sale = await this.store.getSale(input.saleId)
    if (!sale) throw new SaleNotFoundError(input.saleId)
    if (sale.businessId !== this.businessId) throw new Error('Business isolation violation')
    if (sale.status === 'voided') throw new Error('Cannot refund a voided sale')
    if (sale.status === 'refunded') throw new Error('Sale already refunded')

    const now = new Date().toISOString()
    const refundId = newId()

    const refund: Refund = {
      id: refundId,
      saleId: sale.id,
      businessId: this.businessId,
      amount: input.refundAmount,
      reason: input.reason,
      paymentMethod: input.paymentMethod,
      items: input.lineItems,
      createdAt: now,
      version: 1,
    }

    await this.store.upsertRefund(refund)

    // Update sale status
    const updatedSale: Sale = {
      ...sale,
      status: 'refunded',
      updatedAt: now,
      version: sale.version + 1,
    }
    await this.store.upsertSale(updatedSale)

    await this.emitEvent('sale.refunded', sale.id, updatedSale, 'update')

    const items = await this.store.listSaleItems(sale.id)
    const receipt = formatReceipt(updatedSale, items, business, cashierName, refund)
    return { refund, receipt }
  }

  // ── getSale ─────────────────────────────────────────────────────────────────

  async getSale(saleId: SaleId): Promise<Sale | null> {
    const sale = await this.store.getSale(saleId)
    if (!sale) return null
    if (sale.businessId !== this.businessId) return null
    return sale
  }

  // ── listSales ───────────────────────────────────────────────────────────────

  async listSales(businessId: BusinessId, date?: string): Promise<Sale[]> {
    if (businessId !== this.businessId) return []
    const all = await this.store.listSales(this.businessId, date)
    if (!date) return all
    return all.filter(s => s.createdAt.startsWith(date))
  }

  // ── Private emit ────────────────────────────────────────────────────────────

  private async emitEvent(
    name: SaleEventName,
    entityId: SaleId,
    entity: Sale,
    operation: 'create' | 'update' | 'delete',
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = { ...entity }
    // Avoid circular reference in payload — items are synced separately
    ;(payload as Record<string, unknown>).items = undefined

    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: asIdempotencyKey(newId()),
      businessId: this.businessId,
      entityKind: 'sale',
      entityId: String(entityId),
      operation,
      originatingDeviceId: this.deviceId,
      originatingEmployeeId: this.employeeId,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString() as ISO8601,
      entityVersion: entity.version,
      payload,
      state: 'pending',
    }

    await this.syncEngine.enqueue(event)
  }
}
