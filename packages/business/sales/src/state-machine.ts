/**
 * Sale state machine.
 *
 * Two-phase commit:
 *
 *   PHASE 1 (request)         PHASE 2 (confirmation)
 *   ─────────────────         ───────────────────────
 *   Terminal ─── SALE_REQUEST ───► Primary
 *   Terminal ◄── SALE_ACCEPTED ──── Primary  (after stock check)
 *   Terminal                commits local record
 *   Terminal ─── SALE_CONFIRM ───► Primary
 *   Terminal ◄── SALE_CONFIRMED ─── Primary  (broadcast to all)
 *
 * Terminal MUST show "pending" UI between phase 1 and phase 2.
 * Stock reservation happens at phase 1 (locked by Primary).
 */

import type { Sale, SaleRequest, SaleResponse, SaleRejectionReason } from './types.js'
import type { ProductRepository } from '@soostori/products'
import type { UUID } from '@soostori/core'
import { newId } from '@soostori/core'

/** Result of stock check before authorizing a sale. */
export interface StockCheckResult {
  ok: boolean
  reason?: SaleRejectionReason
  message?: string
  stockAfter?: Record<string, number>
}

/** Check if sale can proceed given current stock. */
export async function checkStockForSale(
  request: SaleRequest,
  products: ProductRepository
): Promise<StockCheckResult> {
  const stockAfter: Record<string, number> = {}

  for (const item of request.items) {
    const product = await products.findById(item.productId)
    if (!product) {
      return { ok: false, reason: 'INVALID_PAYLOAD', message: `Product ${item.productId} not found` }
    }
    if (!product.isActive) {
      return { ok: false, reason: 'PRODUCT_DISABLED', message: `Product ${product.name} is disabled` }
    }
    const available = product.currentStock
    if (available < item.quantity) {
      return {
        ok: false,
        reason: 'INSUFFICIENT_STOCK',
        message: `Insufficient stock for ${product.name}: ${available} available, ${item.quantity} requested`,
      }
    }
    stockAfter[item.productId] = available - item.quantity
  }
  return { ok: true, stockAfter }
}

/** Build sale request — what a terminal sends to the Primary. */
export function buildSaleRequest(args: {
  shopId: UUID
  items: Array<{ productId: UUID; quantity: number }>
  paymentMethod: SaleRequest['paymentMethod']
  paidAmount: SaleRequest['paidAmount']
  customerId?: UUID | null
  customerName?: string | null
  deviceId: UUID
  userId: UUID
  note?: string | null
  discountAmount?: number
}): SaleRequest {
  return {
    idempotencyKey: newId() as UUID,
    shopId: args.shopId,
    items: args.items,
    paymentMethod: args.paymentMethod,
    paidAmount: args.paidAmount,
    customerId: args.customerId,
    customerName: args.customerName,
    deviceId: args.deviceId,
    userId: args.userId,
    note: args.note,
    discountAmount: args.discountAmount,
  }
}

/** Compute totals from sale items. */
export function computeSaleTotals(items: Array<{ quantity: number; unitPrice: number; discount?: number }>): {
  subtotal: number
  total: number
} {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const discount = items.reduce((sum, i) => sum + (i.discount ?? 0), 0)
  return { subtotal, total: subtotal - discount }
}
