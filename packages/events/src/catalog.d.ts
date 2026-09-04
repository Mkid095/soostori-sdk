/**
 * Canonical Soostori event catalog.
 *
 * Single source of truth for every event name in the system. Every sync,
 * notification, audit, and analytics consumer subscribes to this catalog.
 *
 * Categories:
 *   - sale.*     — sales lifecycle
 *   - stock.*    — inventory mutations
 *   - product.*  — catalog mutations
 *   - customer.* — customer mutations
 *   - debt.*     — credit account events
 *   - device.*   — device identity & lifecycle
 *   - sync.*     — synchronization events
 *   - subscription.* — billing lifecycle
 *   - auth.*     — authentication events
 *   - audit.*    — security audit
 *   - system.*   — platform-level events
 */
export declare const EVENT_CATEGORIES: readonly ["sale", "stock", "product", "category", "customer", "debt", "supplier", "device", "sync", "subscription", "auth", "audit", "system"];
export type EventCategory = typeof EVENT_CATEGORIES[number];
export declare const SALE_PENDING = "sale.pending";
export declare const SALE_CONFIRMED = "sale.confirmed";
export declare const SALE_REJECTED = "sale.rejected";
export declare const SALE_REFUNDED = "sale.refunded";
export declare const SALE_COMPLETED = "sale.completed";
export declare const STOCK_RECEIVED = "stock.received";
export declare const STOCK_ADJUSTED = "stock.adjusted";
export declare const STOCK_TRANSFERRED = "stock.transferred";
export declare const STOCK_RESERVED = "stock.reserved";
export declare const STOCK_RELEASED = "stock.released";
export declare const LOW_STOCK_DETECTED = "stock.low";
export declare const PRODUCT_CREATED = "product.created";
export declare const PRODUCT_UPDATED = "product.updated";
export declare const PRODUCT_DELETED = "product.deleted";
export declare const CATEGORY_CREATED = "category.created";
export declare const CATEGORY_UPDATED = "category.updated";
export declare const PRICE_CHANGED = "product.price_changed";
export declare const CUSTOMER_CREATED = "customer.created";
export declare const CUSTOMER_UPDATED = "customer.updated";
export declare const CUSTOMER_FLAGGED = "customer.flagged";
export declare const DEBT_CREATED = "debt.created";
export declare const DEBT_PAYMENT_RECORDED = "debt.payment_recorded";
export declare const DEBT_PAYMENT_REMINDER = "debt.payment_reminder";
export declare const DEBT_WRITTEN_OFF = "debt.written_off";
export declare const SUPPLIER_CREATED = "supplier.created";
export declare const SUPPLIER_UPDATED = "supplier.updated";
export declare const DEVICE_REGISTERED = "device.registered";
export declare const DEVICE_ONLINE = "device.online";
export declare const DEVICE_OFFLINE = "device.offline";
export declare const DEVICE_REVOKED = "device.revoked";
export declare const HOST_TRANSFER = "device.host_transfer";
export declare const PRIMARY_DEVICE_ELECTED = "device.primary_elected";
export declare const PRIMARY_DEVICE_LOST = "device.primary_lost";
export declare const HEARTBEAT_ACK = "device.heartbeat_ack";
export declare const SYNC_PUSHED = "sync.pushed";
export declare const SYNC_PULLED = "sync.pulled";
export declare const SYNC_CONFLICT = "sync.conflict";
export declare const SYNC_SNAPSHOT_DOWNLOADED = "sync.snapshot_downloaded";
export declare const SUBSCRIPTION_PAYMENT_CONFIRMED = "subscription.payment_confirmed";
export declare const SUBSCRIPTION_TRIAL_STARTED = "subscription.trial_started";
export declare const SUBSCRIPTION_EXPIRED = "subscription.expired";
export declare const SUBSCRIPTION_EXPIRING_SOON = "subscription.expiring_soon";
export declare const SUBSCRIPTION_RENEWED = "subscription.renewed";
export declare const SUBSCRIPTION_CANCELLED = "subscription.cancelled";
export declare const CONVERSION_RECORDED = "subscription.conversion_recorded";
export declare const COMMISSION_GENERATED = "subscription.commission_generated";
export declare const AUTH_LOGIN = "auth.login";
export declare const AUTH_LOGOUT = "auth.logout";
export declare const AUTH_FAILED = "auth.failed";
export declare const INVITATION_CREATED = "auth.invitation_created";
export declare const INVITATION_ACCEPTED = "auth.invitation_accepted";
export declare const MEMBERSHIP_INVITED = "membership.invited";
export declare const MEMBERSHIP_REVOKED = "membership.revoked";
export declare const AUDIT_USER_ACTION = "audit.user_action";
export declare const AUDIT_PERMISSION_DENIED = "audit.permission_denied";
export declare const AUDIT_DATA_EXPORTED = "audit.data_exported";
export declare const AUDIT_DATA_DELETED = "audit.data_deleted";
export declare const SYSTEM_BACKUP_COMPLETED = "system.backup_completed";
export declare const SYSTEM_ERROR = "system.error";
export declare const BUSINESS_CREATED = "business.created";
export declare const BUSINESS_UPDATED = "business.updated";
export declare const ALL_EVENTS: readonly ["sale.pending", "sale.confirmed", "sale.rejected", "sale.refunded", "sale.completed", "stock.received", "stock.adjusted", "stock.transferred", "stock.reserved", "stock.released", "stock.low", "product.created", "product.updated", "product.deleted", "category.created", "category.updated", "product.price_changed", "customer.created", "customer.updated", "customer.flagged", "debt.created", "debt.payment_recorded", "debt.payment_reminder", "debt.written_off", "supplier.created", "supplier.updated", "device.registered", "device.online", "device.offline", "device.revoked", "device.host_transfer", "device.primary_elected", "device.primary_lost", "device.heartbeat_ack", "sync.pushed", "sync.pulled", "sync.conflict", "sync.snapshot_downloaded", "subscription.payment_confirmed", "subscription.trial_started", "subscription.expired", "subscription.expiring_soon", "subscription.renewed", "subscription.cancelled", "subscription.conversion_recorded", "subscription.commission_generated", "auth.login", "auth.logout", "auth.failed", "auth.invitation_created", "auth.invitation_accepted", "membership.invited", "membership.revoked", "audit.user_action", "audit.permission_denied", "audit.data_exported", "audit.data_deleted", "system.backup_completed", "system.error", "business.created", "business.updated"];
export type SoostoriEventName = typeof ALL_EVENTS[number];
export declare function isSoostoriEvent(name: string): name is SoostoriEventName;
export declare function eventCategory(name: SoostoriEventName): EventCategory;
//# sourceMappingURL=catalog.d.ts.map