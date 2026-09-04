/**
 * Branded ID types — prevent accidentally passing a UserId where a ShopId
 * is expected. The brand is erased at runtime; it's purely a compile-time check.
 */

export type Brand<T, B extends string> = T & { readonly __brand: B }

// Core domain IDs
export type UserId = Brand<string, 'UserId'>
export type CompanyId = Brand<string, 'CompanyId'>
export type ShopId = Brand<string, 'ShopId'>
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
export const asCompanyId = (s: string) => s as CompanyId
export const asShopId = (s: string) => s as ShopId
export const asEmployeeId = (s: string) => s as EmployeeId
export const asDeviceId = (s: string) => s as DeviceId
export const asProductId = (s: string) => s as ProductId
export const asCategoryId = (s: string) => s as CategoryId
export const asCustomerId = (s: string) => s as CustomerId
export const asSaleId = (s: string) => s as SaleId
export const asDebtId = (s: string) => s as DebtId
export const asDebtPaymentId = (s: string) => s as DebtPaymentId
export const asPlanId = (s: string) => s as PlanId
export const asSubscriptionId = (s: string) => s as SubscriptionId
export const asInvitationId = (s: string) => s as InvitationId
export const asSyncEventId = (s: string) => s as SyncEventId
