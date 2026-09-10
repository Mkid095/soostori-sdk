/**
 * Branded ID types — prevent accidentally passing a UserId where a ShopId
 * is expected. The brand is erased at runtime; it's purely a compile-time check.
 */

export type Brand<T, B extends string> = T & { readonly __brand: B }

// Core domain IDs
export type UserId = Brand<string, 'UserId'>
/**
 * ShopId is the legacy brand name; the canonical name is BusinessId.
 * Kept as a type alias to BusinessId so existing code compiles unchanged.
 * Cycle 04 §10: Business is the canonical tenant entity.
 */
export type ShopId = BusinessId
export type EmployeeId = Brand<string, 'EmployeeId'>
export type DeviceId = Brand<string, 'DeviceId'>

// Operational IDs
export type ProductId = Brand<string, 'ProductId'>
export type CategoryId = Brand<string, 'CategoryId'>
export type ProductVariantId = Brand<string, 'ProductVariantId'>
export type CustomerId = Brand<string, 'CustomerId'>
export type SaleId = Brand<string, 'SaleId'>
export type SaleItemId = Brand<string, 'SaleItemId'>
export type DebtId = Brand<string, 'DebtId'>
export type DebtPaymentId = Brand<string, 'DebtPaymentId'>
export type ExpenseId = Brand<string, 'ExpenseId'>
export type RecurringExpenseId = Brand<string, 'RecurringExpenseId'>
export type ExpenseCategoryId = Brand<string, 'ExpenseCategoryId'>
export type InventoryTransactionId = Brand<string, 'InventoryTransactionId'>

// Sync IDs
export type SyncEventId = Brand<string, 'SyncEventId'>
export type BackupSnapshotId = Brand<string, 'BackupSnapshotId'>
export type SyncStatusId = Brand<string, 'SyncStatusId'>

// Subscription IDs
export type PlanId = Brand<string, 'PlanId'>
export type SubscriptionId = Brand<string, 'SubscriptionId'>
export type PaymentId = Brand<string, 'PaymentId'>
export type InvitationId = Brand<string, 'InvitationId'>
export type DeviceAuthorizationId = Brand<string, 'DeviceAuthorizationId'>

// ── Multi-business model IDs (Cycle 04) ──────────────────────────────────────
// Person is the cloud identity; Business is the tenant; Membership is the link.
export type PersonId = Brand<string, 'PersonId'>
export type BusinessId = Brand<string, 'BusinessId'>
export type MembershipId = Brand<string, 'MembershipId'>

// ── Sync / contract IDs (Cycle 04) ──────────────────────────────────────────
/** UUIDv7 — time-ordered per the Cycle 04 brief §6. */
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>
export type SyncCursorId = Brand<string, 'SyncCursorId'>

// ── Domain IDs added by Cycle 04 Sub-cycle A ────────────────────────────────
/** StockMovementId — append-only inventory ledger row (Cycle 04 §11). */
export type StockMovementId = Brand<string, 'StockMovementId'>
/** CommissionRuleId — admin-configurable rate rows (Cycle 04 §75). */
export type CommissionRuleId = Brand<string, 'CommissionRuleId'>
/** CommissionLedgerId — salesperson-attributed sale event row (Cycle 04 §76). */
export type CommissionLedgerId = Brand<string, 'CommissionLedgerId'>
/** SalespersonApplicationId — applicant state machine row (§19/§20). */
export type SalespersonApplicationId = Brand<string, 'SalespersonApplicationId'>
/** SalespersonProfileId — post-approval training/active state (§21/§22). */
export type SalespersonProfileId = Brand<string, 'SalespersonProfileId'>
/** InfluencerProfileId — admin-only recruiter profile (§70–§73). */
export type InfluencerProfileId = Brand<string, 'InfluencerProfileId'>
/** PackageId — commercial onboarding package (§24, Phase 06). */
export type PackageId = Brand<string, 'PackageId'>
/** AuthAuditEventId — append-only auth/security event log (§78). */
export type AuthAuditEventId = Brand<string, 'AuthAuditEventId'>

/** Generate a new UUID v4 — uses crypto.randomUUID when available, else Math.random fallback. */
export function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ── ID cast helpers — used by platform code that already has a string ID ──
// In production these should only be called with validated UUIDs.

export const asUserId = (s: string) => s as UserId
export const asShopId = (s: string) => s as ShopId
export const asBusinessId = (s: string) => s as BusinessId
export const asPersonId = (s: string) => s as PersonId
export const asMembershipId = (s: string) => s as MembershipId
export const asEmployeeId = (s: string) => s as EmployeeId
export const asDeviceId = (s: string) => s as DeviceId
export const asProductId = (s: string) => s as ProductId
export const asCategoryId = (s: string) => s as CategoryId
export const asCustomerId = (s: string) => s as CustomerId
export const asSaleId = (s: string) => s as SaleId
export const asDebtId = (s: string) => s as DebtId
export const asDebtPaymentId = (s: string) => s as DebtPaymentId
export const asExpenseId = (s: string) => s as ExpenseId
export const asRecurringExpenseId = (s: string) => s as RecurringExpenseId
export const asPlanId = (s: string) => s as PlanId
export const asSubscriptionId = (s: string) => s as SubscriptionId
export const asInvitationId = (s: string) => s as InvitationId
export const asSyncEventId = (s: string) => s as SyncEventId
export const asStockMovementId = (s: string) => s as StockMovementId
export const asIdempotencyKey = (s: string) => s as IdempotencyKey
export const asCommissionRuleId = (s: string) => s as CommissionRuleId
export const asCommissionLedgerId = (s: string) => s as CommissionLedgerId
export const asSalespersonApplicationId = (s: string) => s as SalespersonApplicationId
export const asSalespersonProfileId = (s: string) => s as SalespersonProfileId
export const asInfluencerProfileId = (s: string) => s as InfluencerProfileId
export const asPackageId = (s: string) => s as PackageId
export const asAuthAuditEventId = (s: string) => s as AuthAuditEventId
