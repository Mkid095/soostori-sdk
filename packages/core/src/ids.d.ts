/**
 * Branded ID types — prevent accidentally passing a UserId where a ShopId
 * is expected. The brand is erased at runtime; it's purely a compile-time check.
 */
export type Brand<T, B extends string> = T & {
    readonly __brand: B;
};
export type UserId = Brand<string, 'UserId'>;
export type CompanyId = Brand<string, 'CompanyId'>;
export type ShopId = Brand<string, 'ShopId'>;
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
/** Generate a new UUID v4 — uses crypto.randomUUID when available, else Math.random fallback. */
export declare function newId(): string;
export declare const asUserId: (s: string) => UserId;
export declare const asCompanyId: (s: string) => CompanyId;
export declare const asShopId: (s: string) => ShopId;
export declare const asEmployeeId: (s: string) => EmployeeId;
export declare const asDeviceId: (s: string) => DeviceId;
export declare const asProductId: (s: string) => ProductId;
export declare const asCategoryId: (s: string) => CategoryId;
export declare const asCustomerId: (s: string) => CustomerId;
export declare const asSaleId: (s: string) => SaleId;
export declare const asDebtId: (s: string) => DebtId;
export declare const asDebtPaymentId: (s: string) => DebtPaymentId;
export declare const asPlanId: (s: string) => PlanId;
export declare const asSubscriptionId: (s: string) => SubscriptionId;
export declare const asInvitationId: (s: string) => InvitationId;
export declare const asSyncEventId: (s: string) => SyncEventId;
//# sourceMappingURL=ids.d.ts.map