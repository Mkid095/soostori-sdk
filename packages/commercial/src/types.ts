/**
 * Commercial package types — commission summary for salesperson dashboard.
 */

import type { BusinessId, ISO8601, Money } from '@soostori/core'

/**
 * Commission summary for a single enrolled business.
 */
export interface EnrolledBusiness {
  businessId: BusinessId
  businessName: string
  packageAmount: Money
  companyShare: Money
  salespersonShare: Money
  influencerShare: Money
  enrolledAt: ISO8601
}

/**
 * Full commission summary for a salesperson.
 */
export interface CommissionSummary {
  totalSalespersonCommission: Money
  totalCompanyCommission: Money
  enrolledBusinesses: EnrolledBusiness[]
}
