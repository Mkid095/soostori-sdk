/**
 * Sales repository — local persistence abstraction.
 */

import type { Sale, SaleItem, HeldSale, PaginationOptions } from './types.js'
import type { UUID, Money, ISO8601 } from '@soostori/core'

export interface SaleFilter {
  status?: Sale['status']
  startDate?: ISO8601
  endDate?: ISO8601
  customerId?: UUID
  userId?: UUID
  deviceId?: UUID
  paymentMethod?: Sale['paymentMethod']
}

export interface SalesTotals {
  count: number
  total: Money
  byPaymentMethod: Record<string, Money>
}

export interface SalesRepository {
  // Sales
  findById(id: UUID): Promise<Sale | null>
  findMany(filter?: SaleFilter, pagination?: PaginationOptions): Promise<Sale[]>
  create(sale: Sale, items: SaleItem[]): Promise<Sale>
  update(id: UUID, changes: Partial<Sale>): Promise<Sale>
  totals(filter?: SaleFilter): Promise<SalesTotals>

  // Held sales
  findHeldSales(shopId: UUID): Promise<HeldSale[]>
  createHeldSale(data: Omit<HeldSale, 'id' | 'createdAt'>): Promise<HeldSale>
  deleteHeldSale(id: UUID): Promise<void>

  // Items (read-only — items are created with their parent sale)
  findItemsBySaleId(saleId: UUID): Promise<SaleItem[]>
}

export class SaleNotFoundError extends Error {
  constructor(id: UUID) {
    super(`Sale ${id} not found`)
    this.name = 'SaleNotFoundError'
  }
}
