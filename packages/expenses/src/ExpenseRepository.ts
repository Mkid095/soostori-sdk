/**
 * ExpenseRepository — local store contract for Expense + RecurringExpense entities.
 *
 * Design invariants:
 *   1. Business isolation: all reads MUST filter by businessId — no exceptions.
 *   2. Idempotency: getExpenseByIdempotencyKey is the anti-duplication gate.
 *   3. Expense status transitions are enforced at service layer.
 *   4. RecurringExpenses are append-only; only isActive can toggle.
 */

import type { Expense, ExpenseStatus } from '@soostori/contracts'
import type {
  BusinessId, ExpenseId, RecurringExpenseId,
  EmployeeId, IdempotencyKey, Money,
} from '@soostori/core'

// ── RecurringExpense ─────────────────────────────────────────────────────────

export type RecurringExpenseFrequency = 'daily' | 'weekly' | 'monthly'

export interface RecurringExpense {
  id: RecurringExpenseId
  businessId: BusinessId
  categoryName: string
  amount: Money
  frequency: RecurringExpenseFrequency
  nextDueDate: string  // YYYY-MM-DD
  isActive: boolean
  createdAt: string
  updatedAt: string
  version: number
}

// ── Filter types ─────────────────────────────────────────────────────────────

export interface ExpenseSearchFilter {
  businessId: BusinessId
  month?: string        // YYYY-MM — filters by date prefix
  status?: ExpenseStatus | 'all'
  category?: string
  limit?: number
  offset?: number
}

export interface RecurringExpenseSearchFilter {
  businessId: BusinessId
  isActive?: boolean
}

// ── Repository interface ─────────────────────────────────────────────────────

export interface ExpenseRepository {
  // ── Expense reads ─────────────────────────────────────────────────────────

  /** Primary-key lookup. Returns null if not found or wrong business. */
  getExpense(id: ExpenseId): Promise<Expense | null>

  /**
   * Idempotency lookup — returns existing Expense with this idempotency key,
   * or null if this is a brand-new create.
   *
   * CRITICAL: callers MUST check this before upserting a new expense.
   */
  getExpenseByIdempotencyKey(key: IdempotencyKey): Promise<Expense | null>

  /**
   * List expenses with optional filters.
   * When month is provided, filters by YYYY-MM prefix on the date field.
   */
  listExpenses(filter: ExpenseSearchFilter): Promise<Expense[]>

  /** Count expenses matching a filter (for pagination). */
  countExpenses(filter: ExpenseSearchFilter): Promise<number>

  // ── Expense writes ────────────────────────────────────────────────────────

  /**
   * Upsert an expense.
   * - Create  : new id + no idempotency-key match.
   * - Update  : id known and incoming version > stored version.
   */
  upsertExpense(expense: Expense): Promise<void>

  // ── RecurringExpense reads ────────────────────────────────────────────────

  /** Primary-key lookup. */
  getRecurringExpense(id: RecurringExpenseId): Promise<RecurringExpense | null>

  /** List recurring expenses with optional filters. */
  listRecurringExpenses(filter: RecurringExpenseSearchFilter): Promise<RecurringExpense[]>

  // ── RecurringExpense writes ────────────────────────────────────────────────

  /**
   * Upsert a recurring expense.
   * - Create  : new id.
   * - Update  : id known and incoming version > stored version.
   */
  upsertRecurringExpense(expense: RecurringExpense): Promise<void>
}
