/**
 * Canonical entity contract — Part 3: Sale / SaleLineItem / Customer / Debt / DebtPayment / Expense.
 *
 * §16–§19 of the Soostori vision.
 */

import type {
  BusinessId, SaleId, SaleItemId, CustomerId, DebtId, DebtPaymentId, ExpenseId,
  EmployeeId, DeviceId, UserId, ProductId,
  ISO8601, Money, IdempotencyKey,
} from '@soostori/core'

// ── Sale (§16) ────────────────────────────────────────────────────────────────
export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'transfer' | 'debt'

export interface Sale {
  id: SaleId
  businessId: BusinessId
  type: 'retail' | 'wholesale'
  /** Sale state machine: pending → confirmed ↔ rejected | completed | refunded | cancelled. */
  status: 'pending' | 'confirmed' | 'rejected' | 'completed' | 'refunded' | 'cancelled'
  subtotal: Money
  discountAmount: Money
  taxAmount: Money
  totalAmount: Money
  paidAmount: Money
  paymentMethod: PaymentMethod
  note?: string | null
  customerId?: CustomerId | null
  employeeId: EmployeeId
  deviceId: DeviceId
  /** UUID per sale — prevents duplicate submission on offline replay (§16, §6). */
  idempotencyKey: IdempotencyKey
  items?: SaleLineItem[]
  createdAt: ISO8601
  updatedAt: ISO8601
  confirmedAt?: ISO8601 | null
  version: number
}

/**
 * SaleLineItem — individual line on a Sale.
 *
 * Stock authority: stock effects of these lines are produced via StockMovement
 * events (Primary Device authority, §12).
 */
export interface SaleLineItem {
  id: SaleItemId
  saleId: SaleId
  businessId: BusinessId
  productId: ProductId
  productName: string
  variationName?: string | null
  quantity: number
  unitPrice: Money
  discount: Money
  totalPrice: Money
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── Customer (§17) ────────────────────────────────────────────────────────────
export interface Customer {
  id: CustomerId
  businessId: BusinessId
  name: string
  phone?: string | null
  email?: string | null
  /** National ID / passport — used for cross-shop risk warning. */
  idNumber?: string | null
  address?: string | null
  notes?: string | null
  /** Cached outstanding balance across all open Debts — updated on Debt mutations. */
  balance: Money
  status: 'active' | 'inactive' | 'blacklisted'
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── Debt (§18) ────────────────────────────────────────────────────────────────
export type DebtStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'written_off'

export interface Debt {
  id: DebtId
  businessId: BusinessId
  customerId: CustomerId
  /** Null when debt is opened manually (advance credit) — §18. */
  saleId?: SaleId | null
  amount: Money
  /** Cached sum of confirmed DebtPayment rows. */
  balance: Money
  status: DebtStatus
  dueDate?: ISO8601 | null
  notes?: string | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── DebtPayment (§18, §40) ────────────────────────────────────────────────────
export interface DebtPayment {
  id: DebtPaymentId
  businessId: BusinessId
  debtId: DebtId
  amount: Money
  employeeId: EmployeeId
  paymentMethod: Exclude<PaymentMethod, 'debt'>
  /** External reference — mobile money txid, bank slip, etc. */
  paymentRef?: string | null
  /** UUID per payment — prevents duplicate submission on offline replay (§18, §6). */
  idempotencyKey: IdempotencyKey
  timestamp: ISO8601
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── Expense (§19) ─────────────────────────────────────────────────────────────
export type ExpenseStatus = 'pending' | 'approved' | 'paid'

export interface Expense {
  id: ExpenseId
  businessId: BusinessId
  categoryName: string
  amount: Money
  employeeId: EmployeeId
  note?: string | null
  /** YYYY-MM-DD user-facing date — expense entry date. */
  date: string
  /** Free-form external reference (receipt number, transfer ref). */
  reference?: string | null
  status: ExpenseStatus
  /** Set when status transitions to 'paid'. */
  paidAt?: ISO8601 | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}
