/**
 * Canonical event payload types — shared across sync, notifications, audit.
 *
 * All apps must conform to these shapes. Local domain types may add fields,
 * but must include these required fields for cross-app compatibility.
 */
import type { Money, ISO8601 } from '@soostori/core';
export interface SalePendingPayload {
    saleId: string;
    total: Money;
    paymentMethod: 'cash' | 'mobile_money' | 'card' | 'transfer' | 'debt';
    items: Array<{
        productId: string;
        quantity: number;
        unitPrice: Money;
    }>;
    /** Device requesting the sale (may be different from primary). */
    requesterDeviceId: string;
}
export interface SaleConfirmedPayload {
    saleId: string;
    total: Money;
    /** Primary device that authorized the sale. */
    authorizedBy: string;
    /** Stock remaining after sale. */
    stockAfter: Record<string, number>;
}
export type SaleRejectedReason = 'INSUFFICIENT_STOCK' | 'INVALID_PAYLOAD' | 'PERMISSION_DENIED' | 'SUBSCRIPTION_EXPIRED' | 'PRODUCT_DISABLED';
export interface SaleRejectedPayload {
    saleId: string;
    reason: SaleRejectedReason;
    message: string;
}
export interface StockReceivedPayload {
    productId: string;
    quantity: number;
    newStock: number;
    supplierId?: string;
    referenceNumber?: string;
    costPrice?: Money;
}
export interface StockAdjustedPayload {
    productId: string;
    delta: number;
    newStock: number;
    reason: string;
    /** 'count', 'damage', 'theft', 'correction', 'return'. */
    reasonType: 'count' | 'damage' | 'theft' | 'correction' | 'return';
}
export interface StockReservedPayload {
    productId: string;
    quantity: number;
    reservationId: string;
    saleId?: string;
    expiresAt: ISO8601;
}
export interface LowStockPayload {
    productId: string;
    productName: string;
    currentStock: number;
    threshold: number;
}
export interface SubscriptionPaymentConfirmedPayload {
    shopId: string;
    subscriptionId: string;
    amount: Money;
    planKey: string;
    /** Set true on the very first confirmed payment for this customer. */
    isConversion: boolean;
    /** Salesperson attributed (if any). */
    salespersonId?: string;
    /** Influencer attributed (if any). */
    influencerId?: string;
}
export interface CommissionGeneratedPayload {
    shopId: string;
    salespersonId: string;
    influencerId?: string;
    amount: Money;
    /** Commission month — when this payment applies. */
    periodMonth: string;
    /** Generated commission rule id. */
    ruleId: string;
}
export interface DeviceRegisteredPayload {
    deviceId: string;
    deviceName: string;
    deviceType: 'desktop' | 'mobile';
    registeredBy: string;
}
export interface PrimaryDeviceLostPayload {
    lastSeenAt: ISO8601;
    /** Other devices notified. */
    notifiedDevices: string[];
}
export interface HostTransferPayload {
    fromDeviceId: string;
    toDeviceId: string;
    reason: string;
}
export interface EventPayloadMap {
    'sale.pending': SalePendingPayload;
    'sale.confirmed': SaleConfirmedPayload;
    'sale.rejected': SaleRejectedPayload;
    'sale.refunded': {
        saleId: string;
        amount: Money;
    };
    'sale.completed': {
        saleId: string;
        total: Money;
    };
    'stock.received': StockReceivedPayload;
    'stock.adjusted': StockAdjustedPayload;
    'stock.transferred': {
        productId: string;
        fromDevice: string;
        toDevice: string;
        quantity: number;
    };
    'stock.reserved': StockReservedPayload;
    'stock.released': {
        reservationId: string;
    };
    'stock.low': LowStockPayload;
    'product.created': {
        productId: string;
        name: string;
    };
    'product.updated': {
        productId: string;
        changes: Record<string, unknown>;
    };
    'product.deleted': {
        productId: string;
    };
    'product.price_changed': {
        productId: string;
        oldPrice: Money;
        newPrice: Money;
    };
    'category.created': {
        categoryId: string;
        name: string;
    };
    'category.updated': {
        categoryId: string;
    };
    'customer.created': {
        customerId: string;
        name: string;
    };
    'customer.updated': {
        customerId: string;
    };
    'customer.flagged': {
        customerId: string;
        reason: string;
    };
    'debt.created': {
        debtId: string;
        customerId: string;
        amount: Money;
    };
    'debt.payment_recorded': {
        debtId: string;
        paymentId: string;
        amount: Money;
    };
    'debt.payment_reminder': {
        debtId: string;
        customerId: string;
        amount: Money;
    };
    'debt.written_off': {
        debtId: string;
        reason: string;
    };
    'supplier.created': {
        supplierId: string;
    };
    'supplier.updated': {
        supplierId: string;
    };
    'device.registered': DeviceRegisteredPayload;
    'device.online': {
        deviceId: string;
    };
    'device.offline': {
        deviceId: string;
        lastSeenAt: ISO8601;
    };
    'device.revoked': {
        deviceId: string;
        revokedBy: string;
    };
    'device.host_transfer': HostTransferPayload;
    'device.primary_elected': {
        deviceId: string;
    };
    'device.primary_lost': PrimaryDeviceLostPayload;
    'device.heartbeat_ack': {
        deviceId: string;
        primaryReachable: boolean;
    };
    'sync.pushed': {
        eventCount: number;
    };
    'sync.pulled': {
        eventCount: number;
    };
    'sync.conflict': {
        eventId: string;
        reason: string;
    };
    'sync.snapshot_downloaded': {
        snapshotId: string;
        recordCounts: Record<string, number>;
    };
    'subscription.payment_confirmed': SubscriptionPaymentConfirmedPayload;
    'subscription.trial_started': {
        shopId: string;
        expiresAt: ISO8601;
    };
    'subscription.expired': {
        shopId: string;
    };
    'subscription.expiring_soon': {
        shopId: string;
        daysRemaining: number;
    };
    'subscription.renewed': {
        shopId: string;
        newExpiry: ISO8601;
    };
    'subscription.cancelled': {
        shopId: string;
        effectiveAt: ISO8601;
    };
    'subscription.conversion_recorded': {
        shopId: string;
        salespersonId?: string;
    };
    'subscription.commission_generated': CommissionGeneratedPayload;
    'auth.login': {
        userId: string;
        deviceId: string;
    };
    'auth.logout': {
        userId: string;
        deviceId: string;
    };
    'auth.failed': {
        email: string;
        reason: string;
    };
    'auth.invitation_created': {
        invitationId: string;
        code: string;
    };
    'auth.invitation_accepted': {
        invitationId: string;
    };
    'audit.user_action': {
        userId: string;
        action: string;
        entityType: string;
        entityId: string;
    };
    'audit.permission_denied': {
        userId: string;
        permission: string;
        resource: string;
    };
    'audit.data_exported': {
        userId: string;
        resource: string;
        recordCount: number;
    };
    'audit.data_deleted': {
        userId: string;
        resource: string;
        recordIds: string[];
    };
    'system.backup_completed': {
        backupId: string;
        sizeBytes: number;
    };
    'system.error': {
        source: string;
        message: string;
    };
}
export type EventPayload<K extends keyof EventPayloadMap> = EventPayloadMap[K];
//# sourceMappingURL=payloads.d.ts.map