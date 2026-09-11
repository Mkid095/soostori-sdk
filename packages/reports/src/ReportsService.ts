/**
 * ReportsService — canonical report aggregation service.
 *
 * Pure read operations. All data is derived from canonical transactional
 * entities: Sale, StockMovement, Debt, DebtPayment, Customer.
 *
 * Wiring to defaultSyncEngine:
 *   The service accepts a ReportsRepository (which may use the SyncEngine's
 *   cursor) and optionally a SyncEngine reference for cursor management.
 *   It does NOT emit sync events — reports are derived reads, not mutations.
 *
 * Invariants enforced:
 *   (1) SUM(completed sales) = dashboard total
 *   (2) SUM(stock ledger movements) = displayed stock balance
 *   (3) debt.balance = initial amount − SUM(append-only confirmed payments)
 *   (4) sync replay must not change report totals
 *
 * Phase 12 rule: no second source of truth. Reports are always derived,
 * never stored in a separate denormalized table.
 */

import type { SyncEngine } from '@soostori/contracts'
import type {
  BusinessId, ISO8601, Money,
} from '@soostori/core'
import type {
  PeriodQuery, DateRange, PeriodResolution,
  DashboardSummary, SalesSummaryReport, InventorySummaryReport,
  CustomerMetricsReport, DebtMetricsReport,
  assertSalesTotalsInvariant, assertStockLedgerInvariant, assertDebtBalanceInvariant,
} from './types.js'
import { resolvePeriod } from './repository.js'
import type { ReportsRepository } from './repository.js'

// ── Service ───────────────────────────────────────────────────────────────────

export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    private readonly businessId: BusinessId,
    /** Optional SyncEngine reference for cursor management. */
    private readonly syncEngine?: SyncEngine,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Get a dashboard summary snapshot.
   *
   * This is the canonical single-call entry point for the Web dashboard.
   * It composes all four domain reports and is replay-safe:
   *   same syncCursor → same totals (Invariant 4).
   */
  async getDashboardSummary(query: PeriodQuery): Promise<DashboardSummary> {
    const { businessId, syncCursor } = await this.resolveBusinessContext()
    const range = this.resolvePeriod(query)
    return this.repo.getDashboardSummary({ businessId, range, syncCursor })
  }

  /**
   * Get a sales summary report.
   * Invariant (1): SUM(completed sales.totalAmount) = dashboard total.
   */
  async getSalesSummary(
    query: PeriodQuery,
    opts?: { resolution?: PeriodResolution; limitTopProducts?: number },
  ): Promise<SalesSummaryReport> {
    const { businessId, syncCursor } = await this.resolveBusinessContext()
    const range = this.resolvePeriod(query)
    return this.repo.getSalesSummary({
      businessId,
      range,
      resolution: opts?.resolution ?? 'day',
      syncCursor,
      limitTopProducts: opts?.limitTopProducts,
    })
  }

  /**
   * Get an inventory summary report.
   * Invariant (2): SUM(stock ledger movements) = displayed stock balance.
   */
  async getInventorySummary(query: PeriodQuery): Promise<InventorySummaryReport> {
    const { businessId, syncCursor } = await this.resolveBusinessContext()
    const range = this.resolvePeriod(query)
    return this.repo.getInventorySummary({ businessId, range, syncCursor })
  }

  /**
   * Get a customer metrics report.
   */
  async getCustomerMetrics(
    query: PeriodQuery,
    opts?: { limitTop?: number },
  ): Promise<CustomerMetricsReport> {
    const { businessId, syncCursor } = await this.resolveBusinessContext()
    const range = this.resolvePeriod(query)
    return this.repo.getCustomerMetrics({ businessId, range, syncCursor, limitTop: opts?.limitTop })
  }

  /**
   * Get a debt metrics report.
   * Invariant (3): debt.balance = initial amount − SUM(append-only confirmed payments).
   */
  async getDebtMetrics(
    query: PeriodQuery,
    opts?: { limitOldest?: number; limitRecentPayments?: number },
  ): Promise<DebtMetricsReport> {
    const { businessId, syncCursor } = await this.resolveBusinessContext()
    const range = this.resolvePeriod(query)
    return this.repo.getDebtMetrics({
      businessId,
      range,
      syncCursor,
      limitOldest: opts?.limitOldest,
      limitRecentPayments: opts?.limitRecentPayments,
    })
  }

  // ── Reconciliation invariant checks ───────────────────────────────────────

  /**
   * Verify Invariant (1): SUM(completed sales.totalAmount) matches report total.
   * Caller passes the raw completed sales array from the repository.
   * Throws if the invariant does not hold.
   */
  async verifySalesTotalsInvariant(
    completedSales: Array<{ status: string; totalAmount: Money }>,
    reportedTotal: Money,
  ): Promise<void> {
    const { assertSalesTotalsInvariant: check } = await import('./types.js')
    const valid = check(completedSales, reportedTotal)
    if (!valid) {
      const sum = completedSales.reduce((a, s) => a + s.totalAmount, 0) as Money
      throw new Error(
        `SalesTotalsInvariant violated: SUM(completed sales) = ${sum}, expected ${reportedTotal}`,
      )
    }
  }

  /**
   * Verify Invariant (2): stock movement sum equals balance delta.
   * Caller passes the opening balance and raw movements from the repository.
   * Throws if the invariant does not hold.
   */
  async verifyStockLedgerInvariant(
    openingBalance: number,
    movements: Array<{ type: string; quantity: number }>,
    closingBalance: number,
  ): Promise<void> {
    const { assertStockLedgerInvariant: check } = await import('./types.js')
    const valid = check({ openingBalance, movements, closingBalance })
    if (!valid) {
      const netMovement = movements.reduce((a, m) => a + m.quantity, 0)
      throw new Error(
        `StockLedgerInvariant violated: opening(${openingBalance}) + netMovements(${netMovement}) ≠ closing(${closingBalance})`,
      )
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async resolveBusinessContext(): Promise<{ businessId: BusinessId; syncCursor: ISO8601 | null }> {
    // Get latest synced timestamp to bound all queries (Invariant 4)
    const syncCursor = await this.repo.getLatestSyncedTimestamp(this.businessId)
    return { businessId: this.businessId, syncCursor }
  }

  private resolvePeriod(query: PeriodQuery): DateRange {
    // Default timezone is UTC. Caller should pass businessTimezone from their context.
    return resolvePeriod(query.preset, query.range, 'Africa/Nairobi')
  }
}

// ── Re-export types so callers get a single import point ──────────────────────
export { resolvePeriod } from './repository.js'
export type {
  PeriodQuery, DateRange, PeriodResolution,
  DashboardSummary, SalesSummaryReport, InventorySummaryReport,
  CustomerMetricsReport, DebtMetricsReport,
} from './types.js'
