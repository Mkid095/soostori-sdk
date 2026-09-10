/**
 * Sales SDK types — aligned with the Phase 10 brief.
 */

import type { BusinessId, SaleId, SaleItemId, ProductId, CustomerId, EmployeeId, DeviceId, ISO8601, Money } from '@soostori/core'
import type { SyncEngine } from '@soostori/contracts'

// ── Input types ────────────────────────────────────────────────────────────────

export interface CreateSaleInput {
  businessId: BusinessId
  registerId: string
  cashierId: EmployeeId
  customerId?: CustomerId
  lineItems: Array<{
    productId: ProductId
    quantity: number
    unitPrice: number      // KES cents — override if different from product price
    discount?: number      // KES cents — per-item discount
  }>
  saleDiscount?: number    // KES cents — whole-sale discount
  paymentMethod: 'cash' | 'mobile_money' | 'card' | 'credit'
  amountTendered: number   // KES cents
  notes?: string
}

export interface RefundSaleInput {
  saleId: SaleId
  lineItems?: Array<{ productId: ProductId; quantity: number }>  // partial refund — omit for full
  refundAmount: number     // KES cents
  reason: string
  paymentMethod: 'cash' | 'mobile_money' | 'card'
}

// ── Domain entities ────────────────────────────────────────────────────────────

export type SaleStatus = 'completed' | 'voided' | 'refunded'

export interface Sale {
  id: SaleId
  businessId: BusinessId
  registerId: string
  cashierId: EmployeeId
  customerId: CustomerId | null
  status: SaleStatus
  subtotal: Money
  discountAmount: Money       // per-item discounts
  saleDiscount: Money         // whole-sale discount
  taxAmount: Money
  totalAmount: Money
  paidAmount: Money
  amountTendered: Money
  changeGiven: Money
  paymentMethod: 'cash' | 'mobile_money' | 'card' | 'credit'
  notes: string | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

export interface SaleItem {
  id: SaleItemId
  saleId: SaleId
  businessId: BusinessId
  productId: ProductId
  productName: string
  quantity: number
  unitPrice: Money
  discount: Money
  totalPrice: Money
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

export interface Refund {
  id: string
  saleId: SaleId
  businessId: BusinessId
  amount: Money
  reason: string
  paymentMethod: Exclude<CreateSaleInput['paymentMethod'], 'credit'>
  items?: Array<{ productId: ProductId; quantity: number }>
  createdAt: ISO8601
  version: number
}

// ── Receipt ────────────────────────────────────────────────────────────────────

export interface Receipt {
  saleId: SaleId
  businessName: string
  businessAddress?: string
  date: ISO8601
  registerId: string
  cashierName: string
  customerName?: string | null
  lineItems: Array<{
    name: string
    quantity: number
    unitPrice: Money
    discount: Money
    total: Money
  }>
  subtotal: Money
  saleDiscount: Money
  taxAmount: Money
  total: Money
  paymentMethod: string
  amountTendered: Money
  changeGiven: Money
}

export interface Business {
  id: BusinessId
  name: string
  address?: string
  taxRate?: number
}

// ── Repository ─────────────────────────────────────────────────────────────────

export interface SaleRepository {
  getSale(id: SaleId): Promise<Sale | null>
  upsertSale(sale: Sale): Promise<void>
  listSales(businessId: BusinessId, date?: string): Promise<Sale[]>
  getSaleItem(id: SaleItemId): Promise<SaleItem | null>
  upsertSaleItem(item: SaleItem): Promise<void>
  listSaleItems(saleId: SaleId): Promise<SaleItem[]>
  upsertRefund(refund: Refund): Promise<void>
  listRefunds(saleId: SaleId): Promise<Refund[]>
}

export class InsufficientStockError extends Error {
  constructor(productId: ProductId, available: number, requested: number) {
    super(`Insufficient stock for ${productId}: ${available} available, ${requested} requested`)
    this.name = 'InsufficientStockError'
  }
}

export class SaleNotFoundError extends Error {
  constructor(saleId: SaleId) {
    super(`Sale ${saleId} not found`)
    this.name = 'SaleNotFoundError'
  }
}
