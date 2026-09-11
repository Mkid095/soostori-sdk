/**
 * PackageRepository — data access contract for commercial package operations.
 *
 * Platform implementations provide FIDScript-backed persistence.
 * Tests use an in-memory mock.
 */

import type { BusinessId, PackageId, SalespersonProfileId } from '@soostori/core'
import type { Package, CommissionLedgerEntry } from '@soostori/contracts'

export interface CreatePackageInput {
  businessId: BusinessId
  name: string
  amount: number
  salespersonId: SalespersonProfileId
  influencerId?: string
}

export interface PackageRepository {
  /**
   * Query all active packages enrolled by a specific salesperson.
   */
  findBySalespersonId(salespersonCloudId: string): Promise<Package[]>

  /**
   * Query the business linked to a specific package.
   */
  getBusinessForPackage(packageId: PackageId): Promise<{ id: BusinessId; name: string } | null>

  /**
   * Query commission ledger entries for a salesperson in a billing period.
   */
  getCommissionLedger(salespersonCloudId: string, period: string): Promise<CommissionLedgerEntry[]>

  /**
   * Upsert a package (enroll-confirm flow on Web).
   */
  upsertPackage(input: CreatePackageInput): Promise<Package>
}
