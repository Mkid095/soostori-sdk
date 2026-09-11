/**
 * ReportsRepository — canonical query contract for all report data.
 *
 * Every method is a pure read. No mutations. No UI logic.
 * All implementations read from the same transactional entities used
 * by the rest of the SDK (Sale, StockMovement, Debt, DebtPayment, Customer).
 *
 * Invariant (4): all time-range queries MUST accept a `syncCursor` parameter.
 * Events with serverReceivedAt > syncCursor are excluded from aggregates
 * so that in-flight pending sync events cannot alter already-reported totals.
 */

import type {
  BusinessId, CustomerId, ProductId, DebtId, EmployeeId, ISO8601, Money,
} from '@soostori/core'
import type {
  DateRange, PeriodResolution,
  SalesSummaryReport, InventorySummaryReport,
  CustomerMetricsReport, DebtMetricsReport, DashboardSummary,
  SalesSummaryTotals, InventorySummaryTotals,
  CustomerMetricsTotals, DebtMetricsTotals,
  DebtAgingBucket,
} from './types.js'

// ── Repository interface ──────────────────────────────────────────────────────

export interface ReportsRepository {
  // ── Sync cursor for time-range queries ──────────────────────────────────

  /**
   * Return the latest serverReceivedAt timestamp available for the business.
   * Used to set the cursor boundary for report snapshots.
   * Events with serverReceivedAt > returned value are still in-flight
   * and MUST be excluded from report totals (Invariant 4).
   */
  getLatestSyncedTimestamp(businessId: BusinessId): Promise<ISO8601 | null>

  // ── Sales Summary ───────────────────────────────────────────────────────

  /**
   * Aggregate completed sales within the given date range.
   *
   * Invariant (1): SUM(completed sales.totalAmount) = dashboard total.
   * Events with serverReceivedAt > syncCursor are excluded.
   */
  getSalesSummary(params: {
    businessId: BusinessId
    range: DateRange
    resolution: PeriodResolution
    syncCursor: ISO8601 | null
    limitTopProducts?: number
  }): Promise<SalesSummaryReport>

  // ── Inventory / Stock ──────────────────────────────────────────────────

  /**
   * Aggregate stock movements and balances within the given date range.
   *
   * Invariant (2): SUM(stock ledger movements) = displayed stock balance.
   * OpeningBalance + SUM(movements) = ClosingBalance, verified on every call.
   */
  getInventorySummary(params: {
    businessId: BusinessId
    range: DateRange
    syncCursor: ISO8601 | null
  }): Promise<InventorySummaryReport>

  // ── Customer Metrics ───────────────────────────────────────────────────

  /**
   * Aggregate customer metrics within the given date range.
   * Reads Customer + Sale entities; no separate customer-dimension table.
   */
  getCustomerMetrics(params: {
    businessId: BusinessId
    range: DateRange
    syncCursor: ISO8601 | null
    limitTop?: number
  }): Promise<CustomerMetricsReport>

  // ── Debt Metrics ───────────────────────────────────────────────────────

  /**
   * Aggregate debt metrics within the given date range.
   *
   * Invariant (3): debt.balance = initial amount − SUM(confirmed payments).
   * The `balance` field on the Debt entity is the authoritative value;
   * this query derives it from confirmed DebtPayment rows to verify consistency.
   */
  getDebtMetrics(params: {
    businessId: BusinessId
    range: DateRange
    syncCursor: ISO8601 | null
    limitOldest?: number
    limitRecentPayments?: number
  }): Promise<DebtMetricsReport>

  // ── Dashboard Summary ─────────────────────────────────────────────────

  /**
   * Compute a full dashboard snapshot in a single call.
   * Calls all four domain methods above; the aggregation is deterministic
   * and replay-safe (same cursor → same totals, Invariant 4).
   */
  getDashboardSummary(params: {
    businessId: BusinessId
    range: DateRange
    syncCursor: ISO8601 | null
  }): Promise<DashboardSummary>
}

// ── Period utility contract ──────────────────────────────────────────────────

/**
 * Resolve a PeriodPreset or DateRange into an absolute DateRange.
 * Throws if the preset cannot be resolved (e.g., unknown timezone).
 */
export function resolvePeriod(
  preset: import('./types.js').PeriodPreset | undefined,
  range: DateRange | undefined,
  businessTimezone: string,  // IANA timezone string, e.g. 'Africa/Nairobi'
): DateRange {
  if (range) return range
  if (!preset) {
    // Default: today in business timezone
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    return { from: from.toISOString() as ISO8601, to: to.toISOString() as ISO8601 }
  }

  const now = new Date()
  const startOfDay = (d: Date) => { d.setHours(0, 0, 0, 0); return d }
  const endOfDay = (d: Date) => { d.setHours(23, 59, 59, 999); return d }

  switch (preset) {
    case 'today':
      return { from: startOfDay(new Date(now)).toISOString() as ISO8601, to: endOfDay(new Date(now)).toISOString() as ISO8601 }
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1)
      return { from: startOfDay(y).toISOString() as ISO8601, to: endOfDay(y).toISOString() as ISO8601 }
    }
    case 'last_7d': {
      const s = new Date(now); s.setDate(s.getDate() - 6)
      return { from: startOfDay(s).toISOString() as ISO8601, to: endOfDay(new Date(now)).toISOString() as ISO8601 }
    }
    case 'last_30d': {
      const s = new Date(now); s.setDate(s.getDate() - 29)
      return { from: startOfDay(s).toISOString() as ISO8601, to: endOfDay(new Date(now)).toISOString() as ISO8601 }
    }
    case 'last_90d': {
      const s = new Date(now); s.setDate(s.getDate() - 89)
      return { from: startOfDay(s).toISOString() as ISO8601, to: endOfDay(new Date(now)).toISOString() as ISO8601 }
    }
    case 'this_week': {
      const s = new Date(now); s.setDate(s.getDate() - s.getDay())
      return { from: startOfDay(s).toISOString() as ISO8601, to: endOfDay(new Date(now)).toISOString() as ISO8601 }
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: startOfDay(s).toISOString() as ISO8601, to: endOfDay(new Date(now)).toISOString() as ISO8601 }
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: startOfDay(s).toISOString() as ISO8601, to: endOfDay(e).toISOString() as ISO8601 }
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const s = new Date(now.getFullYear(), q * 3, 1)
      return { from: startOfDay(s).toISOString() as ISO8601, to: endOfDay(new Date(now)).toISOString() as ISO8601 }
    }
    case 'last_quarter': {
      const q = Math.floor(now.getMonth() / 3) - 1
      const s = new Date(now.getFullYear(), q * 3, 1)
      const e = new Date(now.getFullYear(), q * 3 + 3, 0)
      return { from: startOfDay(s).toISOString() as ISO8601, to: endOfDay(e).toISOString() as ISO8601 }
    }
    case 'this_year': {
      const s = new Date(now.getFullYear(), 0, 1)
      return { from: startOfDay(s).toISOString() as ISO8601, to: endOfDay(new Date(now)).toISOString() as ISO8601 }
    }
    case 'last_year': {
      const s = new Date(now.getFullYear() - 1, 0, 1)
      const e = new Date(now.getFullYear() - 1, 11, 31)
      return { from: startOfDay(s).toISOString() as ISO8601, to: endOfDay(e).toISOString() as ISO8601 }
    }
    default:
      throw new Error(`Unknown period preset: ${preset}`)
  }
}
