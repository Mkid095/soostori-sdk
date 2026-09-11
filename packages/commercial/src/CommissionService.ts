/**
 * CommissionService — aggregates package enrollments and commission shares.
 *
 * Used by the salesperson dashboard to show commission earnings per enrolled
 * business, computed from the active Package records synced to FIDScript.
 */

import { calculateCommission } from '@soostori/contracts'
import type { PackageRepository } from './PackageRepository.js'
import type { CommissionSummary, EnrolledBusiness } from './types.js'

export class CommissionService {
  constructor(private readonly packageRepo: PackageRepository) {}

  /**
   * Build a full commission summary for a salesperson.
   *
   * Fetches all active packages for the salesperson, resolves business names,
   * calculates the commission split per package, and aggregates totals.
   */
  async getCommissionSummary(salespersonCloudId: string): Promise<CommissionSummary> {
    const packages = await this.packageRepo.findBySalespersonId(salespersonCloudId)
    const activePackages = packages.filter(p => p.isActive)

    const enrolledBusinesses: EnrolledBusiness[] = await Promise.all(
      activePackages.map(async (pkg) => {
        const business = await this.packageRepo.getBusinessForPackage(pkg.id)
        const commission = calculateCommission(pkg.amount)
        return {
          businessId: pkg.businessId,
          businessName: business?.name ?? 'Unknown',
          packageAmount: pkg.amount,
          companyShare: commission.companyShare,
          salespersonShare: commission.salespersonShare,
          influencerShare: commission.influencerShare,
          enrolledAt: pkg.createdAt,
        } satisfies EnrolledBusiness
      }),
    )

    const totalSalesperson = enrolledBusinesses.reduce((sum, b) => sum + b.salespersonShare, 0)
    const totalCompany = enrolledBusinesses.reduce((sum, b) => sum + b.companyShare, 0)

    return {
      enrolledBusinesses,
      totalSalespersonCommission: totalSalesperson,
      totalCompanyCommission: totalCompany,
    }
  }
}
