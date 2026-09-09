/**
 * Sales service — primary device authorization + terminal commit logic.
 *
 * IMPORTANT: In a multi-terminal setup, this service is invoked on the
 * PRIMARY DEVICE for stock validation. Terminals send SALE_REQUEST
 * via @soostori/lan; this service runs only on the Primary.
 */

import type { SaleRequest, SaleResponse } from './types.js'
import type { SalesRepository } from './repository.js'
import type { ProductRepository } from '@soostori/products'
import { checkStockForSale, computeSaleTotals } from './state-machine.js'
import { newId, type UUID, type Money, type UserId } from '@soostori/core'
import { asShopId, asDeviceId, asUserId } from '@soostori/core'
import { createEvent, SALE_PENDING, SALE_CONFIRMED, SALE_REJECTED, SALE_COMPLETED, SALE_REFUNDED } from '@soostori/events'
import { getEventBus } from '@soostori/events'

export class SalesService {
  constructor(
    private readonly sales: SalesRepository,
    private readonly products: ProductRepository,
    private readonly shopId: UUID,
    private readonly primaryDeviceId: UUID,
    /**
     * Optional guard: called before commit to verify stock-sensitive operations
     * are permitted. If not provided, commit proceeds (caller guarantees authorization).
     *
     * Desktop orchestrator injects a checkPrimary() equivalent here so commit()
     * cannot be called when Primary is stale/lost.
     */
    private readonly canCommit?: () => void,
  ) {}

  /**
   * Primary Device entry point: validate stock and authorize (or reject).
   *
   * Called by @soostori/lan when a terminal sends SALE_REQUEST.
   */
  async authorize(request: SaleRequest): Promise<SaleResponse> {
    const stockCheck = await checkStockForSale(request, this.products)
    if (!stockCheck.ok) {
      await getEventBus().publish(createEvent({
        name: SALE_REJECTED,
        shopId: asShopId(this.shopId),
        deviceId: asDeviceId(this.primaryDeviceId),
        entityId: request.idempotencyKey,
        entity: 'sale',
        payload: {
          saleId: request.idempotencyKey,
          reason: stockCheck.reason!,
          message: stockCheck.message ?? 'Stock check failed',
        },
      }))
      return {
        idempotencyKey: request.idempotencyKey,
        status: 'rejected',
        rejectionReason: stockCheck.reason,
        message: stockCheck.message,
      }
    }

    const { subtotal, total } = computeSaleTotals(
      request.items.map(i => ({ quantity: i.quantity, unitPrice: 0 })),
    )

    await getEventBus().publish(createEvent({
      name: SALE_CONFIRMED,
      shopId: asShopId(this.shopId),
      deviceId: asDeviceId(this.primaryDeviceId),
      entityId: request.idempotencyKey,
      entity: 'sale',
      payload: {
        saleId: request.idempotencyKey,
        total,
        authorizedBy: String(this.primaryDeviceId),
        stockAfter: stockCheck.stockAfter ?? {},
      },
    }))

    return {
      idempotencyKey: request.idempotencyKey,
      status: 'confirmed',
      sale: undefined,
      stockAfter: stockCheck.stockAfter,
    }
  }

  /**
   * Terminal commits the sale after receiving primary ack.
   * Checks Primary authorization, validates stock, and is idempotent.
   */
  async commit(args: {
    saleId: UUID
    items: Array<{ productId: UUID; productName: string; quantity: number; unitPrice: number; discount?: number; totalPrice: number; variationName?: string }>
    paymentMethod: SaleRequest['paymentMethod']
    paidAmount: Money
    customerId?: UUID | null
    customerName?: string | null
    note?: string | null
    discountAmount?: number
    taxAmount?: number
    deviceId: UUID
    userId: UUID
  }): Promise<{ saleId: UUID }> {
    const saleId = args.saleId as UUID

    // Primary authorization guard - throws if Primary is not available.
    this.canCommit?.()

    // Idempotent replay guard: if sale already exists, do NOT re-decrement stock.
    const existing = await this.sales.findById(saleId)
    if (existing) return { saleId }

    // Stock check - validates stock is available AND product is active.
    // Defense-in-depth: also checked in authorize(), but commit can be called
    // directly in offline/host mode without going through authorize().
    const stockCheck = await checkStockForSale({
      idempotencyKey: saleId,
      shopId: asShopId(this.shopId),
      items: args.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      paymentMethod: args.paymentMethod,
      paidAmount: args.paidAmount,
      deviceId: asDeviceId(this.primaryDeviceId),
      userId: String(args.userId ?? ''),
    }, this.products)
    if (!stockCheck.ok) {
      throw Object.assign(
        new Error(`Stock check failed: ${stockCheck.message ?? stockCheck.reason}`),
        { code: 'STOCK_CHECK_FAILED', reason: stockCheck.reason },
      )
    }

    const { subtotal, total } = computeSaleTotals(
      args.items.map(i => ({ quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount ?? 0 })),
    )
    const now = new Date().toISOString()

    await this.sales.create({
      id: saleId,
      shopId: asShopId(this.shopId),
      type: 'retail',
      status: 'completed',
      userId: String(args.userId ?? ''),
      deviceId: asDeviceId(args.deviceId),
      authorizedBy: this.primaryDeviceId,
      subtotal,
      discountAmount: args.discountAmount ?? 0,
      taxAmount: args.taxAmount ?? 0,
      totalAmount: total,
      paidAmount: args.paidAmount,
      paymentMethod: args.paymentMethod,
      note: args.note ?? null,
      customerId: args.customerId ?? null,
      customerName: args.customerName ?? null,
      customerIdNumber: null,
      itemsSummary: `${args.items.length} item${args.items.length === 1 ? '' : 's'}`,
      createdAt: now,
      updatedAt: now,
      confirmedAt: now,
    }, args.items.map(i => ({
      id: newId() as UUID,
      saleId,
      productId: i.productId,
      productName: i.productName,
      variationName: i.variationName ?? null,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount ?? 0,
      totalPrice: i.totalPrice,
    })))

    // Decrement stock for each item
    for (const item of args.items) {
      await this.products.decrementStock(item.productId, item.quantity)
    }

    await getEventBus().publish(createEvent({
      name: SALE_COMPLETED,
      shopId: asShopId(this.shopId),
      deviceId: asDeviceId(args.deviceId),
      entityId: saleId,
      entity: 'sale',
      payload: { saleId, total },
    }))

    return { saleId }
  }

  async refund(saleId: UUID, _reason: string): Promise<void> {
    const sale = await this.sales.findById(saleId)
    if (!sale) throw new Error(`Sale ${saleId} not found`)
    await this.sales.update(saleId, { status: 'refunded' })
    await getEventBus().publish(createEvent({
      name: SALE_REFUNDED,
      shopId: asShopId(this.shopId),
      deviceId: asDeviceId(this.primaryDeviceId),
      entityId: saleId,
      entity: 'sale',
      payload: { saleId, amount: sale.totalAmount },
    }))
  }
}
