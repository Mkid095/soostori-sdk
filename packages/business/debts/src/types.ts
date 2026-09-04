/**
 * Debt/credit domain — extracted from Desktop's debts + debt_payments tables.
 *
 * Debts are non-stock operations and can run offline.
 */

import type { Money, ISO8601, UUID } from '@soostori/core'

export type DebtStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'written_off'

export interface Debt {
  id: UUID
  shopId: UUID
  customerId: UUID
  saleId: UUID | null
  amount: Money
  amountPaid: Money
  status: DebtStatus
  dueDate: ISO8601 | null
  notes: string | null
  createdAt: ISO8601
  updatedAt: ISO8601
}

export interface DebtPayment {
  id: UUID
  debtId: UUID
  amount: Money
  paymentMethod: 'cash' | 'mobile_money' | 'card' | 'transfer'
  reference: string | null
  notes: string | null
  createdAt: ISO8601
  userId: UUID
}
