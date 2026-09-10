/**
 * Branded ID types — prevent accidentally passing a UserId where a ShopId
 * is expected. The brand is erased at runtime; it's purely a compile-time check.
 */
export type Brand<T, B extends string> = T & {
    readonly __brand: B;
};
export type UserId = Brand<string, 'UserId'>;
export type ShopId = BusinessId;
export type EmployeeId = Brand<string, 'EmployeeId'>;
export type DeviceId = Brand<string, 'DeviceId'>;
export type ProductId = Brand<string, 'ProductId'>;
export type CategoryId = Brand<string, 'CategoryId'>;
export type ProductVariantId = Brand<string, 'ProductVariantId'>;
export type CustomerId = Brand<string, 'CustomerId'>;
export type SaleId = Brand<string, 'SaleId'>;
export type SaleItemId = Brand<string, 'SaleItemId'>;
export type DebtId = Brand<string, 'DebtId'>;
export type DebtPaymentId = Brand<string, 'DebtPaymentId'>;
export type ExpenseId = Brand<string, 'ExpenseId'>;
export type ExpenseCategoryId = Brand<string, 'ExpenseCategoryId'>;
export type InventoryTransactionId = Brand<string, 'InventoryTransactionId'>;
export type SyncEventId = Brand<string, 'SyncEventId'>;
export type BackupSnapshotId = Brand<string, 'BackupSnapshotId'>;
export type SyncStatusId = Brand<string, 'SyncStatusId'>;
export type PlanId = Brand<string, 'PlanId'>;
export type SubscriptionId = Brand<string, 'SubscriptionId'>;
export type PaymentId = Brand<string, 'PaymentId'>;
export type InvitationId = Brand<string, 'InvitationId'>;
export type DeviceAuthorizationId = Brand<string, 'DeviceAuthorizationId'>;
export type PersonId = Brand<string, 'PersonId'>;
export type BusinessId = Brand<string, 'BusinessId'>;
export type MembershipId = Brand<string, 'MembershipId'>;
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;
export type SyncCursorId = Brand<string, 'SyncCursorId'>;
export type StockMovementId = Brand<string, 'StockMovementId'>;
export type CommissionRuleId = Brand<string, 'CommissionRuleId'>;
export type CommissionLedgerId = Brand<string, 'CommissionLedgerId'>;
export type SalespersonApplicationId = Brand<string, 'SalespersonApplicationId'>;
export type SalespersonProfileId = Brand<string, 'SalespersonProfileId'>;
export type InfluencerProfileId = Brand<string, 'InfluencerProfileId'>;
export type AuthAuditEventId = Brand<string, 'AuthAuditEventId'>;
/** Generate a new UUID v4 — uses crypto.randomUUID when available, else Math.random fallback. */
export declare function newId(): string;
