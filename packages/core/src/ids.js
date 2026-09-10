/**
 * Branded ID types — prevent accidentally passing a UserId where a ShopId
 * is expected. The brand is erased at runtime; it's purely a compile-time check.
 */
/** Generate a new UUID v4 — uses crypto.randomUUID when available, else Math.random fallback. */
export function newId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}
// ── ID cast helpers — used by platform code that already has a string ID ──
// In production these should only be called with validated UUIDs.
export const asUserId = (s) => s;
export const asShopId = (s) => s;
export const asBusinessId = (s) => s;
export const asPersonId = (s) => s;
export const asMembershipId = (s) => s;
export const asEmployeeId = (s) => s;
export const asDeviceId = (s) => s;
export const asProductId = (s) => s;
export const asCategoryId = (s) => s;
export const asCustomerId = (s) => s;
export const asSaleId = (s) => s;
export const asDebtId = (s) => s;
export const asDebtPaymentId = (s) => s;
export const asPlanId = (s) => s;
export const asSubscriptionId = (s) => s;
export const asInvitationId = (s) => s;
export const asSyncEventId = (s) => s;
export const asStockMovementId = (s) => s;
export const asIdempotencyKey = (s) => s;
export const asCommissionRuleId = (s) => s;
export const asCommissionLedgerId = (s) => s;
export const asSalespersonApplicationId = (s) => s;
export const asSalespersonProfileId = (s) => s;
export const asInfluencerProfileId = (s) => s;
export const asAuthAuditEventId = (s) => s;
//# sourceMappingURL=ids.js.map
