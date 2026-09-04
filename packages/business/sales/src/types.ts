/**
 * Sales domain — extracted from Desktop's sales/sale_items/held_sales tables.
 *
 * Sale state machine (Option C):
 *
 *   Terminal                        Primary Device                  Other terminals
 *      │                                  │                              │
 *      ├─ SALE_REQUEST ────────────────► │                              │
 *      │                                  ├─ Stock check                 │
 *      │                                  ├─ SALE_ACCEPTED / REJECTED    │
 *      │ ◄── SALE_RESPONSE ─────────────┤                              │
 *      │                                  ├─ Broadcast                   │
 *      │                                  ├─────────────────────────────►│
 *
 * Stock-sensitive operations ALWAYS route through the Primary Device.
 * Non-stock operations (refunds, notes) can execute locally with sync later.
 */

import type { Money, ISO8601, UUID } from '@soostori/core'

export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'transfer' | 'debt'

export type SaleType = 'retail' | 'wholesale'

export type SaleStatus = 'pending' | 'confirmed' | 'rejected' | 'completed' | 'refunded' | 'cancelled'

export interface SaleItem {
  id: UUID
  saleId: UUID
  productId: UUID | null
  productName: string
  variationName: string | null
  quantity: number
  unitPrice: Money
  discount: Money
  totalPrice: Money
}

export interface Sale {
  id: UUID
  shopId: UUID
  type: SaleType
  status: SaleStatus
  /** Employee who initiated the sale. */
  userId: UUID
  /** Device that initiated the sale (may differ from primary). */
  deviceId: UUID
  /** Primary Device that authorized stock. May differ from deviceId when stock-routed. */
  authorizedBy: UUID | null

  subtotal: Money
  discountAmount: Money
  taxAmount: Money
  totalAmount: Money
  paidAmount: Money
  paymentMethod: PaymentMethod
  note: string | null
  customerId: UUID | null
  customerName: string | null
  customerIdNumber: string | null
  itemsSummary: string | null

  createdAt: ISO8601
  updatedAt: ISO8601
  confirmedAt: ISO8601 | null
}

/** Held (parked) sale for later completion. */
export interface HeldSale {
  id: UUID
  shopId: UUID
  name: string | null
  /** JSON-serialized cart. */
  cartItems: string
  paymentMethod: PaymentMethod
  createdAt: ISO8601
  /** Employee who held the sale. */
  userId: UUID
}

/** Sale request — what a terminal sends to the Primary Device. */
export interface SaleRequest {
  idempotencyKey: UUID
  shopId: UUID
  items: Array<{ productId: UUID; quantity: number }>
  paymentMethod: PaymentMethod
  paidAmount: Money
  customerId?: UUID | null
  customerName?: string | null
  deviceId: UUID
  userId: UUID
  note?: string | null
  /** Discount applied at terminal level. */
  discountAmount?: Money
}

/** Sale response — what the Primary Device sends back. */
export interface SaleResponse {
  idempotencyKey: UUID
  status: SaleStatus
  /** Reason for rejection (if rejected). */
  rejectionReason?: SaleRejectionReason
  message?: string
  sale?: Sale
  /** Stock snapshot after the sale (for terminal display). */
  stockAfter?: Record<string, number>
}

export type SaleRejectionReason =
  | 'INSUFFICIENT_STOCK'
  | 'INVALID_PAYLOAD'
  | 'PERMISSION_DENIED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'PRODUCT_DISABLED'
  | 'PRIMARY_UNAVAILABLE_OFFLINE_TOO_LONG'
