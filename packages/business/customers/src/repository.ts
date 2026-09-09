import type { Customer, CustomerRiskFlag } from './types.js'
import type { PaginationOptions } from './types.js'
import type { UUID } from '@soostori/core'

export interface CustomerFilter {
  search?: string
  activeOnly?: boolean
  flaggedOnly?: boolean
}

export interface CustomersRepository {
  findById(id: UUID): Promise<Customer | null>
  findByPhone(shopId: UUID, phone: string): Promise<Customer | null>
  findMany(filter?: CustomerFilter, pagination?: PaginationOptions): Promise<Customer[]>
  create(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Customer>
  update(id: UUID, changes: Partial<Customer>): Promise<Customer>
  /** Total outstanding debt for this customer. */
  getOutstandingDebt(id: UUID): Promise<number>

  // Risk flags
  findFlags(customerId: UUID): Promise<CustomerRiskFlag[]>
  createFlag(data: Omit<CustomerRiskFlag, 'id' | 'flaggedAt' | 'clearedAt'>): Promise<CustomerRiskFlag>
  clearFlag(flagId: UUID): Promise<void>
}

export class CustomerNotFoundError extends Error {
  constructor(id: UUID) {
    super(`Customer ${id} not found`)
    this.name = 'CustomerNotFoundError'
  }
}
