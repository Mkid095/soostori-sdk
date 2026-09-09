import type { Debt, DebtPayment } from './types.js'
import type { PaginationOptions } from './types.js'
import type { UUID, Money, ISO8601 } from '@soostori/core'

export interface DebtFilter {
  customerId?: UUID
  status?: Debt['status']
  overdue?: boolean
}

export interface DebtsRepository {
  findById(id: UUID): Promise<Debt | null>
  findMany(filter?: DebtFilter, pagination?: PaginationOptions): Promise<Debt[]>
  create(data: Omit<Debt, 'id' | 'createdAt' | 'updatedAt' | 'amountPaid' | 'status'>): Promise<Debt>
  update(id: UUID, changes: Partial<Debt>): Promise<Debt>
  getTotalOwed(customerId: UUID): Promise<Money>
  getOverdueAsOf(date: ISO8601): Promise<Debt[]>

  createPayment(data: Omit<DebtPayment, 'id' | 'createdAt'>): Promise<DebtPayment>
  listPayments(debtId: UUID): Promise<DebtPayment[]>
}
