# @soostori/debts — LEGACY PACKAGE

> **Status: DEPRECATED — Do not use for new work.**
> This package is retained for backward compatibility with the Phase 10 Desktop
> debt schema. It will be removed after Phase 12 migration is complete.

## Why this package exists

This package was extracted from the Desktop app's original `debts + debt_payments`
tables (Phase 10 era). It uses an **amountPaid field** pattern where balance is
written directly rather than derived.

## Canonical replacement

**`packages/debts`** (Phase 11, `@soostori/debts@0.1.0-alpha.1`) is the canonical
package. All new work must use it. It provides:

| Feature | `packages/debts` (canonical) | `packages/business/debts` (legacy) |
|---------|-----------------------------|-------------------------------------|
| Sync events | ✅ Emits `debt.created`, `debt.payment.created`, etc. | ❌ No sync events |
| SyncEngine wiring | ✅ Wired to `defaultSyncEngine` | ❌ Uses in-process `getEventBus()` only |
| Balance derivation | ✅ `balance = amount − sum(payments)` (deterministic) | ❌ `amountPaid` written field (can drift) |
| Idempotency | ✅ `idempotencyKey` on Debt + DebtPayment | ❌ None |
| Service class | `DebtService` | `DebtsService` |
| Entity | `Debt.balance` derived | `Debt.amountPaid` mutable |

## Migration plan

1. Replace all imports of `@soostori/business/debts` with `@soostori/debts`.
2. Update repository implementations to use `DebtRepository` contract from the
   canonical package.
3. Remove `packages/business/debts` from the workspace after all consumers migrate.
