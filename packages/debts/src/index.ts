/**
 * @soostori/debts — Phase 11 Debt management package.
 *
 * Entities:
 *   - Debt        — a customer debt (money owed)
 *   - DebtPayment — a confirmed payment against a Debt
 *
 * Service:
 *   - DebtService — create, update, record payment, settle, write-off
 *
 * Repository:
 *   - DebtRepository — local store contract
 *
 * Sync events:
 *   - debt.created          — DebtService.createDebt()
 *   - debt.updated          — DebtService.updateDebt() / writeOffDebt()
 *   - debt.payment.created  — DebtService.recordPayment()
 *   - debt.settled          — DebtService.settleDebt()
 *
 * Balance derivation:
 *   debt.balance = amount - sum(confirmed DebtPayment.amount)
 *   Balance is NEVER overwritten — derived deterministically on every read + write.
 *
 * Idempotency:
 *   Same idempotencyKey on replay returns the existing entity without
 *   creating a duplicate (applies to both Debt and DebtPayment).
 */

export * from './DebtRepository.js'
export { DebtService, deriveDebtStatus } from './DebtService.js'
export type {
  CreateDebtInput,
  UpdateDebtInput,
  RecordPaymentInput,
} from './DebtService.js'
