/**
 * Primary Device management — Option C implementation.
 *
 * The Primary Device is the local LAN authority for stock mutations.
 * - Terminals send SALE_REQUEST to the Primary for stock validation
 * - Primary broadcasts SALE_CONFIRMED/SALE_REJECTED
 * - When Primary is lost, non-stock operations continue, stock ops queue
 *
 * Election rules:
 * - First device to join a shop LAN becomes Primary (auto-election)
 * - Primary can voluntarily step down via HOST_TRANSFER
 * - Primary can be revoked by an owner via the cloud
 * - Manual failover only — never automatic blind election
 *
 * Why not automatic failover?
 * In a POS with money and inventory, two devices accidentally becoming
 * Primary creates worse problems than temporarily restricting stock ops.
 */
import type { Heartbeat, PrimaryDeviceState } from './types';
import type { UUID, ShopId } from '@soostori/core';
/** Configuration. */
export interface PrimaryDeviceConfig {
    /** Heartbeat considered fresh within this window. */
    freshnessMs?: number;
    /** When primary is lost, after this grace period notify other devices. */
    lostGraceMs?: number;
}
/** Primary Device coordinator — runs on every device. */
export declare class PrimaryDeviceCoordinator {
    private readonly config;
    private readonly shopId;
    private readonly localDeviceId;
    private heartbeats;
    private state;
    constructor(args: {
        shopId: ShopId;
        deviceId: UUID;
        config?: PrimaryDeviceConfig;
    });
    /** Process a heartbeat received from a device (including ourselves). */
    ingestHeartbeat(hb: Heartbeat): void;
    /** Update internal state based on heartbeat timestamps. Call periodically. */
    tick(now?: number): void;
    /** Get current primary device state. */
    getState(): PrimaryDeviceState;
    /** Check if the local device is the current primary. */
    isLocalPrimary(): boolean;
    /** Check if stock operations can proceed (primary online or grace period). */
    /**
     * CRITICAL: Only authorize stock mutations when Primary is healthy.
     *
     * Decision matrix:
     *   ONLINE       → AUTHORIZE  (recent heartbeat, primary reachable)
     *   STALE        → DENY        (heartbeat stale — too dangerous to authorize)
     *   LOST         → DENY        (grace period expired)
     *   RECOVERING   → DENY        (during re-election)
     *   UNKNOWN      → DENY        (no primary established)
     *
     * Returning true for STALE could allow two devices to think they are
     * both authorized during a network partition — exactly the superselling
     * scenario Option C exists to prevent.
     */
    canAuthorStockOps(): boolean;
    /** Authoritative accessor for the full Primary state. */
    getPrimaryState(): PrimaryDeviceState;
    /** Elect a new primary (auto-election on first device or manual). */
    private electPrimary;
    /** Manually transfer primary to another device. */
    transferPrimary(toDeviceId: UUID, fromDeviceId: UUID): void;
    /** List devices known to this coordinator. */
    listDevices(): Heartbeat[];
    /** Clear all heartbeats — useful for tests. */
    reset(): void;
}
//# sourceMappingURL=primary.d.ts.map