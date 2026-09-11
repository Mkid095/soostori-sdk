/**
 * @soostori/reports — Phase 12 canonical report types and query contracts.
 *
 * NO UI/dashboard logic lives here. These are pure data contracts: query
 * parameter shapes, aggregation result shapes, and reconciliation invariants.
 *
 * All reports are derived from canonical transactional data — there is no
 * second source of truth. Aggregation runs over the same entities
 * (Sale, StockMovement, Debt, DebtPayment, Customer) used everywhere else.
 *
 * Reconciliation invariants enforced here:
 *   (1) SUM(completed sales.totalAmount) = dashboard total
 *   (2) SUM(stock ledger movements) = displayed stock balance
 *   (3) debt.balance = initial amount − SUM(append-only confirmed payments)
 *   (4) sync replay must not change report totals
 *
 * Phase 12 rule: reports are derived, never stored. No denormalized summary
 * tables that could diverge from transactional data.
 */

import type {
  BusinessId, CustomerId, ProductId, DebtId, SaleId,
  EmployeeId, ISO8601, Money, IdempotencyKey,
} from '@soostori/core'
import type { DebtStatus, PaymentMethod } from '@soostori/contracts'

// ── Period / Date-Range contract ─────────────────────────────────────────────

/**
 * Canonical period types used across all report queries.
 * Resolution hierarchy: minute < hour < day < week < month < quarter < year.
 */
export type PeriodResolution = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface DateRange {
  /** Inclusive lower bound. */
  from: ISO8601
  /** Inclusive upper bound. */
  to: ISO8601
}

/**
 * A pre-defined period shorthand. Resolved to a DateRange at query time.
 * 'today' is relative to the business timezone (shop.timezone field).
 */
export type PeriodPreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' | 'last_7d' | 'last_30d' | 'last_90d'

export interface PeriodQuery {
  /** One of the named presets, or an explicit range. */
  preset?: PeriodPreset
  /** Explicit range — takes precedence over preset when supplied. */
  range?: DateRange
  /** Aggregation resolution (default 'day'). */
  resolution?: PeriodResolution
}

// ── Sales Summary Report ───────────────────────────────────────────────────────

export interface SalesSummaryTotals {
  /** Total number of sale rows in the period (all statuses). */
  totalCount: number
  /**
   * Count of sales with status === 'completed'.
   * Invariant (1): SUM(completed sales.totalAmount) = dashboard total.
   * Only 'completed' sales contribute to revenue totals.
   */
  completedCount: number
  /** Gross revenue before any discounts. */
  grossRevenue: Money
  /** Total per-item discounts applied. */
  totalDiscounts: Money
  /** Total whole-sale discounts. */
  totalSaleDiscounts: Money
  /** Net revenue = grossRevenue − totalDiscounts − totalSaleDiscounts. */
  netRevenue: Money
  /** Sum of cash payments received. */
  cashTotal: Money
  /** Sum of mobile-money payments. */
  mobileMoneyTotal: Money
  /** Sum of card payments. */
  cardTotal: Money
  /** Sum of credit (debt) payments — amount applied to outstanding debts. */
  creditTotal: Money
  /** Sum of amountTendered across all completed sales. */
  totalTendered: Money
  /** Sum of changeGiven across all completed cash sales. */
  totalChange: Money
  /** Count of refunded sales in the period. */
  refundedCount: number
  /** Total refunded amount. */
  totalRefunded: Money
  /** Average completed sale value. */
  averageSaleValue: Money
}

export interface SalesByPaymentMethod {
  paymentMethod: PaymentMethod
  count: number
  total: Money
}

export interface SalesTimeSeriesPoint {
  /** ISO8601 timestamp at the start of this bucket (resolution-aware). */
  timestamp: ISO8601
  completedCount: number
  grossRevenue: Money
  netRevenue: Money
  refundedCount: number
}

export interface SalesSummaryReport extends SalesSummaryTotals {
  businessId: BusinessId
  period: DateRange
  resolution: PeriodResolution
  /** Revenue broken down by payment method. */
  byPaymentMethod: SalesByPaymentMethod[]
  /** Time-series buckets at the requested resolution. */
  timeSeries: SalesTimeSeriesPoint[]
  /** Top N products by revenue (optional cap). */
  topProducts?: Array<{ productId: ProductId; productName: string; revenue: Money; quantitySold: number }>
}

// ── Product / Inventory Summary Report ───────────────────────────────────────

export interface InventorySummaryTotals {
  /** Total number of active products with a stock balance > 0. */
  activeProductCount: number
  /** Total units across all products (SUM of balance.quantity). */
  totalUnits: number
  /** Total cost value of current stock (unit_cost * quantity). */
  totalCostValue: Money
  /** Total retail value of current stock (unit_price * quantity). */
  totalRetailValue: Money
  /** Count of products with quantity === 0. */
  outOfStockCount: number
  /** Count of products where quantity <= lowStockThreshold. */
  lowStockCount: number
}

export interface StockMovementSummary {
  /** SUM of all stock movements in the period, by type. */
  received: Money    // SUM(quantity) where type === 'received'
  sold: Money         // SUM(quantity) where type === 'sold'
  adjusted: Money     // SUM(quantity) where type === 'adjusted' (net)
  transferred: Money  // SUM(quantity) where type === 'transferred'
  returned: Money     // SUM(quantity) where type === 'returned'
  /** Net stock change = received + sold + adjusted + transferred + returned. */
  netChange: Money
}

export interface InventorySummaryReport extends InventorySummaryTotals {
  businessId: BusinessId
  period: DateRange
  /** Invariant (2): SUM(stock ledger movements) = displayed stock balance.
   *  The opening balance for the report period plus net movements
   *  must equal the closing balance.
   */
  movementSummary: StockMovementSummary
  /** Products closest to running out (quantity > 0 but <= lowStockThreshold). */
  lowStockProducts: Array<{
    productId: ProductId
    productName: string
    quantity: number
    lowStockThreshold: number
  }>
  /** Products that have hit zero. */
  outOfStockProducts: Array<{
    productId: ProductId
    productName: string
    lastSoldAt: ISO8601 | null
  }>
}

// ── Customer Metrics Report ───────────────────────────────────────────────────

export interface CustomerMetricsTotals {
  /** Count of customers with at least one completed sale in the period. */
  activeCustomerCount: number
  /** Total registered customers (all time). */
  totalCustomerCount: number
  /** Count of new customers created in the period. */
  newCustomerCount: number
  /** Count of customers with status === 'blacklisted'. */
  blacklistedCount: number
  /** Total outstanding debt across all customers. */
  totalOutstandingDebt: Money
  /** Average revenue per active customer. */
  averageRevenuePerCustomer: Money
  /** Customer retention rate: active this period / active last period. */
  retentionRate: number  // 0–1
}

export interface CustomerRankingEntry {
  customerId: CustomerId
  customerName: string
  totalPurchases: Money
  purchaseCount: number
  averageBasketValue: Money
  lastPurchaseAt: ISO8601 | null
  outstandingDebt: Money
}

export interface CustomerMetricsReport extends CustomerMetricsTotals {
  businessId: BusinessId
  period: DateRange
  /** Top N customers by revenue. */
  topCustomers: CustomerRankingEntry[]
  /** Customers with the highest outstanding debt. */
  topDebtors: Array<{ customerId: CustomerId; customerName: string; outstandingDebt: Money }>
  /** Customer cohort distribution by month of first purchase. */
  cohortDistribution?: Array<{ cohortMonth: string; count: number }>
}

// ── Debt Metrics Report ───────────────────────────────────────────────────────

export type DebtAgingBucket = 'current' | 'overdue_1_30' | 'overdue_31_60' | 'overdue_61_90' | 'overdue_90_plus'

export interface DebtAgingSummary {
  bucket: DebtAgingBucket
  count: number
  totalAmount: Money
  percentageOfTotal: number  // 0–1
}

export interface DebtMetricsTotals {
  /** Total open debt principal (SUM of Debt.balance where status !== 'paid' && status !== 'written_off'). */
  totalOutstanding: Money
  /** Count of debts with status === 'partial'. */
  partialCount: number
  /** Count of debts past their dueDate but not yet paid or written off. */
  overdueCount: number
  /** Total amount overdue (SUM of balance for debts past dueDate). */
  totalOverdueAmount: Money
  /** Count of debts in 'written_off' status. */
  writtenOffCount: number
  /** Total amount ever written off. */
  totalWrittenOff: Money
  /** Total payments received in the period. */
  totalPaymentsCollected: Money
}

export interface DebtMetricsReport extends DebtMetricsTotals {
  businessId: BusinessId
  period: DateRange
  /**
   * Invariant (3): debt.balance = initial amount − SUM(append-only confirmed payments).
   * This is verified by the DebtService internally; the report merely surfaces
   * the authoritative values from the Debt entity.
   */
  agingBuckets: DebtAgingSummary[]
  /** Recent payments in the period. */
  recentPayments: Array<{
    debtId: DebtId
    customerId: CustomerId
    amount: Money
    paymentMethod: PaymentMethod
    timestamp: ISO8601
  }>
  /** Oldest open debts (highest risk of becoming uncollectable). */
  oldestDebts: Array<{
    debtId: DebtId
    customerId: CustomerId
    amount: Money
    balance: Money
    dueDate: ISO8601 | null
    daysPastDue: number | null
  }>
}

// ── Cross-domain Dashboard Summary (thin aggregator) ─────────────────────────

/**
 * A single top-level health snapshot — one round-trip query surface.
 * This is the canonical data shape that a dashboard widget consumes.
 *
 * NOT a new entity. It aggregates the four domain reports above.
 * Computed from the same transactional tables; no second source of truth.
 */
export interface DashboardSummary {
  businessId: BusinessId
  /** Moment this snapshot was computed. */
  computedAt: ISO8601
  /** ISO8601 of the first data point included. */
  periodFrom: ISO8601
  /** ISO8601 of the last data point included. */
  periodTo: ISO8601
  sales: SalesSummaryTotals
  inventory: InventorySummaryTotals
  customers: CustomerMetricsTotals
  debts: DebtMetricsTotals
  /**
   * Invariant (4): sync replay must not change report totals.
   * Report queries MUST use a snapshot cursor or serverReceivedAt timestamp
   * to exclude in-flight pending events from totals.
   */
  syncState: {
    /** Last serverReceivedAt used when computing this snapshot. */
    cursorTimestamp: ISO8601 | null
    /** Number of events excluded as pending. */
    excludedPendingCount: number
  }
}

// ── Reconciliation Invariants (documented as types for runtime verification) ─

/**
 * Invariant (1) type guard.
 * Returns true when the sum of completed sales matches the reported total.
 */
export function assertSalesTotalsInvariant(
  completedSales: Array<{ status: string; totalAmount: Money }>,
  reportedTotal: Money,
): boolean {
  const sum = completedSales
    .filter(s => s.status === 'completed')
    .reduce((acc, s) => acc + s.totalAmount, 0) as Money
  return sum === reportedTotal
}

/**
 * Invariant (2) type guard.
 * SUM(stock ledger movements) = displayed stock balance.
 * OpeningBalance + received + sold + adjusted + transferred + returned = ClosingBalance.
 */
export function assertStockLedgerInvariant(params: {
  openingBalance: number
  movements: Array<{ type: string; quantity: number }>
  closingBalance: number
}): boolean {
  const netMovement = params.movements.reduce((acc, m) => acc + m.quantity, 0)
  return (params.openingBalance + netMovement) === params.closingBalance
}

/**
 * Invariant (3) type guard.
 * debt.balance = initial amount − SUM(confirmed payments).
 */
export function assertDebtBalanceInvariant(params: {
  debtAmount: Money
  payments: Array<{ confirmed: boolean; amount: Money }>
  reportedBalance: Money
}): boolean {
  const paidSum = params.payments
    .filter(p => p.confirmed)
    .reduce((acc, p) => acc + p.amount, 0) as Money
  const derived = Math.max(0, params.debtAmount - paidSum) as Money
  return derived === params.reportedBalance
}
