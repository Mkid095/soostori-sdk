/**
 * @soostori/reports — Phase 12 canonical report types, query contracts, and service.
 *
 * Contracts (no implementation — platform implementations provide those):
 *   ReportsRepository  — read-only query interface for all report data
 *   ReportsService      — orchestration layer with reconciliation invariant checks
 *
 * Reports are derived from canonical transactional data only:
 *   Sale, StockMovement, Debt, DebtPayment, Customer.
 * No second source of truth. No denormalized summary tables.
 *
 * Reconciliation invariants enforced here:
 *   (1) SUM(completed sales.totalAmount) = dashboard total
 *   (2) SUM(stock ledger movements) = displayed stock balance
 *   (3) debt.balance = initial amount − SUM(append-only confirmed payments)
 *   (4) sync replay must not change report totals
 *
 * Wiring: import ReportsService, wire to defaultSyncEngine cursor, pass
 * a platform-specific ReportsRepository implementation to the constructor.
 *
 * Legacy note — @soostori/debts packages:
 *   • packages/debts/          — Phase 11 canonical. Emits SyncEvents, wired
 *     to defaultSyncEngine, balance = amount − sum(payments).
 *   • packages/business/debts/ — LEGACY. Does NOT emit sync events (uses
 *     in-process event bus only), balance is a written field (amountPaid).
 *     Marked deprecated. Do NOT use for new work. Will be removed post-Phase 12.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export * from './types.js'

// ── Repository contract + period utility ──────────────────────────────────────
export { ReportsRepository, resolvePeriod } from './repository.js'

// ── Service ───────────────────────────────────────────────────────────────────
export { ReportsService } from './ReportsService.js'

// ── Phase 13 flat-report service ───────────────────────────────────────────────
export { ReportService } from './ReportService.js'
export type {
  DashboardSummary,
  SalesReport,
  InventoryReport,
  DebtReport,
  ExpenseReport,
} from './ReportService.js'
