/**
 * @soostori/expenses — Phase 12 Expense management package.
 *
 * Entities:
 *   - Expense         — a business expense record
 *   - RecurringExpense — a recurring expense template
 *
 * Service:
 *   - ExpenseService — create, approve, mark paid, list, summarize, recurring
 *
 * Repository:
 *   - ExpenseRepository — local store contract
 *
 * Sync events:
 *   - expense.created  — ExpenseService.createExpense()
 *   - expense.approved — ExpenseService.approveExpense()
 *   - expense.paid     — ExpenseService.markExpensePaid()
 *
 * Status transitions (enforced at service layer):
 *   pending → approved → paid
 *
 * Idempotency:
 *   Same idempotencyKey on replay returns the existing entity without
 *   creating a duplicate.
 */

export * from './ExpenseRepository.js'
export { ExpenseService } from './ExpenseService.js'
export type {
  CreateExpenseInput,
  CreateRecurringExpenseInput,
} from './ExpenseService.js'
