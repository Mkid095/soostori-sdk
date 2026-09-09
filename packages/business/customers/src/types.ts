/**
 * Customer domain — extracted from Desktop's customers table.
 */

import type { ISO8601, UUID } from '@soostori/core'

export interface Customer {
  id: UUID
  shopId: UUID
  name: string
  phone: string | null
  email: string | null
  /** National ID / passport — used for cross-shop risk warning. */
  idNumber: string | null
  address: string | null
  notes: string | null
  isActive: boolean
  createdAt: ISO8601
  updatedAt: ISO8601
}

/** Customer risk flag — separate from customer identity. */
export interface CustomerRiskFlag {
  id: UUID
  customerId: UUID
  reason: string
  flaggedBy: string
  flaggedAt: ISO8601
  /** When the flag was acknowledged/cleared. */
  clearedAt: ISO8601 | null
}

/** Pagination options for repository queries. */
export interface PaginationOptions {
  limit?: number
  offset?: number
}
