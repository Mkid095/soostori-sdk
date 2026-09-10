/**
 * DebtRepository — local store contract for Debt + DebtPayment entities.
 *
 * Design invariants:
 *   1. Debt.balance is NEVER written directly — always derived as
 *        `initial_amount - sum(confirmed payments)`.
 *      The repository is responsible for computing this on read.
 *   2. Idempotency: getDebtByIdempotencyKey / getPaymentByIdempotencyKey are
 *      the anti-duplication gates — callers MUST check these before writing.
 *   3. Debt status transitions are enforced at service layer; the repository
 *      stores the raw status field without applying transition rules.
 *   4. No hard deletes — debt payments are append-only (no delete operation).
 */

import type {
  Debt, DebtPayment, DebtStatus,
} from '@soostori/contracts'
import type {
  BusinessId, DebtId, DebtPaymentId, CustomerId, SaleId,
  EmployeeId, IdempotencyKey, ISO8601, Money,
} from '@soostori/core'

// ── Derived view ────────────────────────────────────────────────────────────

/**
 * Debt with computed balance — `balance` is the canonical derived field:
 *   balance = amount - sum(payments where confirmed === true)
 *
 * The Debt entity in contracts has balance as a plain Money field;
 * this view makes the derivation explicit at the transport layer.
 */
export interface DebtWithBalance extends Debt {
  /** Cached sum of confirmed payments (read-only, never written). */
  balance: Money
  /** Number of confirmed payments applied. */
  paymentCount: number
}

// ── Filter types ────────────────────────────────────────────────────────────

export interface DebtSearchFilter {
  businessId: BusinessId
  customerId?: CustomerId
  status?: DebtStatus | 'all'
  dueBefore?: ISO8601
  dueAfter?: ISO8601
  query?: string        // matches notes or customer name
  limit?: number
  offset?: number
}

export interface DebtPaymentSearchFilter {
  businessId: BusinessId
  debtId?: DebtId
  employeeId?: EmployeeId
  fromDate?: ISO8601
  toDate?: ISO8601
  limit?: number
  offset?: number
}

// ── Repository interface ─────────────────────────────────────────────────────

export interface DebtRepository {
  // ── Debt reads ────────────────────────────────────────────────────────────

  /** Primary-key lookup. Returns null if not found or wrong business. */
  getDebt(id: DebtId): Promise<Debt | null>

  /**
   * Idempotency lookup — returns existing Debt with this idempotency key,
   * or null if this is a brand-new create.
   *
   * CRITICAL: callers MUST check this before upserting a new debt.
   * Same idempotency key on replay must return the existing row,
   * never create a duplicate.
   */
  getDebtByIdempotencyKey(key: IdempotencyKey): Promise<Debt | null>

  /**
   * List debts with optional filters.
   * Returns DebtWithBalance (balance is computed, not stored).
   */
  listDebts(filter: DebtSearchFilter): Promise<DebtWithBalance[]>

  /** Count debts matching a filter (for pagination). */
  countDebts(filter: DebtSearchFilter): Promise<number>

  /**
   * Get total outstanding balance for a customer across all open debts.
   * Used to update customer.balance denormalization.
   */
  getTotalOutstandingForCustomer(businessId: BusinessId, customerId: CustomerId): Promise<Money>

  // ── Debt writes ────────────────────────────────────────────────────────────

  /**
   * Upsert a debt.
   *
   * - Create  : when id is new and no idempotency-key match exists.
   * - Update  : when id is known and incoming version > stored version.
   *             Also handles status transitions (partial → paid, etc.).
   *
   * balance is IGNORED on write — always recomputed from payments.
   */
  upsertDebt(debt: Debt): Promise<void>

  // ── Payment reads ──────────────────────────────────────────────────────────

  /** Primary-key lookup. */
  getPayment(id: DebtPaymentId): Promise<DebtPayment | null>

  /**
   * Idempotency lookup — returns existing DebtPayment with this idempotency key,
   * or null if this is a brand-new payment.
   *
   * CRITICAL: callers MUST check this before upserting a new payment.
   */
  getPaymentByIdempotencyKey(key: IdempotencyKey): Promise<DebtPayment | null>

  /**
   * List all confirmed payments for a debt.
   * Used to derive the debt balance on read.
   */
  getPaymentsForDebt(debtId: DebtId): Promise<DebtPayment[]>

  /** List payments with optional filters. */
  listPayments(filter: DebtPaymentSearchFilter): Promise<DebtPayment[]>

  // ── Payment writes ─────────────────────────────────────────────────────────

  /**
   * Upsert a payment.
   *
   * - Create  : new id + no idempotency-key match.
   * - No-op   : same idempotency key already exists (dedup guard).
   *
   * A payment, once confirmed, is NEVER deleted or modified.
   * Only `confirmed` field can change (false → true), and only once.
   */
  upsertPayment(payment: DebtPayment): Promise<void>

  /**
   * Recompute and return the current confirmed-balance for a debt.
   * Implementation: SUM payments where debtId matches AND confirmed === true.
   *
   * This is the authoritative balance source; there is no stored balance field
   * that can become stale.
   */
  computeBalance(debtId: DebtId): Promise<Money>
}
