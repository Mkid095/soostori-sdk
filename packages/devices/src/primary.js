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
import { asDeviceId } from '@soostori/core';
import { createEvent, PRIMARY_DEVICE_ELECTED, PRIMARY_DEVICE_LOST, HOST_TRANSFER, } from '@soostori/events';
import { getEventBus } from '@soostori/events';
const DEFAULT_FRESHNESS_MS = 15_000; // 15s heartbeat freshness window
const DEFAULT_LOST_GRACE_MS = 60_000; // 60s before declaring lost
/** Primary Device coordinator — runs on every device. */
export class PrimaryDeviceCoordinator {
    config;
    shopId;
    localDeviceId;
    heartbeats = new Map();
    state;
    constructor(args) {
        this.shopId = args.shopId;
        this.localDeviceId = args.deviceId;
        this.config = {
            freshnessMs: args.config?.freshnessMs ?? DEFAULT_FRESHNESS_MS,
            lostGraceMs: args.config?.lostGraceMs ?? DEFAULT_LOST_GRACE_MS,
        };
        this.state = {
            primaryId: null,
            electedAt: null,
            lastHeartbeatAt: null,
            stalenessMs: Infinity,
            status: 'lost',
            electionPending: false,
        };
    }
    /** Process a heartbeat received from a device (including ourselves). */
    ingestHeartbeat(hb) {
        if (hb.shopId !== this.shopId)
            return;
        this.heartbeats.set(asDeviceId(hb.deviceId), hb);
        if (hb.isPrimary) {
            // This device claims primary
            if (this.state.primaryId === null) {
                this.electPrimary(asDeviceId(hb.deviceId), hb.timestamp);
            }
            else if (this.state.primaryId !== asDeviceId(hb.deviceId)) {
                // Conflict — only manual transfer changes the primary
                // For now, keep current until HOST_TRANSFER event
            }
            else {
                this.state.lastHeartbeatAt = hb.timestamp;
                this.state.stalenessMs = 0;
                this.state.status = 'online';
            }
        }
        if (asDeviceId(hb.deviceId) === this.localDeviceId && !hb.isPrimary) {
            // We were Primary but heartbeat claims we're not — possibly transferred
            // The transfer event handles this, so we just continue
        }
    }
    /** Update internal state based on heartbeat timestamps. Call periodically. */
    tick(now = Date.now()) {
        const primaryHb = this.state.primaryId ? this.heartbeats.get(this.state.primaryId) : null;
        if (!primaryHb) {
            this.state.stalenessMs = Infinity;
            this.state.status = 'lost';
            return;
        }
        const age = now - new Date(primaryHb.timestamp).getTime();
        this.state.stalenessMs = age;
        if (age > this.config.lostGraceMs && this.state.status === 'online') {
            this.state.status = 'lost';
            void getEventBus().publish(createEvent({
                name: PRIMARY_DEVICE_LOST,
                shopId: this.shopId, deviceId: asDeviceId(String(this.localDeviceId)),
                entityId: this.state.primaryId ?? undefined,
                entity: 'device',
                payload: {
                    lastSeenAt: primaryHb.timestamp,
                    notifiedDevices: [...this.heartbeats.keys()].filter(id => id !== this.state.primaryId),
                },
            }));
        }
        else if (age > this.config.freshnessMs) {
            this.state.status = 'stale';
        }
        else {
            this.state.status = 'online';
        }
    }
    /** Get current primary device state. */
    getState() {
        return { ...this.state };
    }
    /** Check if the local device is the current primary. */
    isLocalPrimary() {
        return this.state.primaryId === this.localDeviceId;
    }
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
    canAuthorStockOps() {
        return this.state.status === 'online';
    }
    /** Authoritative accessor for the full Primary state. */
    getPrimaryState() {
        return { ...this.state };
    }
    /** Elect a new primary (auto-election on first device or manual). */
    electPrimary(deviceId, at) {
        if (this.state.primaryId && this.state.primaryId !== deviceId) {
            // Conflict — manual transfer only
            return;
        }
        if (this.state.primaryId === deviceId)
            return;
        this.state = {
            primaryId: deviceId,
            electedAt: at,
            lastHeartbeatAt: at,
            stalenessMs: 0,
            status: 'online',
            electionPending: false,
        };
        void getEventBus().publish(createEvent({
            name: PRIMARY_DEVICE_ELECTED,
            shopId: this.shopId, deviceId: asDeviceId(String(this.localDeviceId)),
            entityId: deviceId, entity: 'device',
            payload: { deviceId },
        }));
    }
    /** Manually transfer primary to another device. */
    transferPrimary(toDeviceId, fromDeviceId) {
        if (this.state.primaryId !== fromDeviceId) {
            throw new Error(`Cannot transfer: ${fromDeviceId} is not the current primary`);
        }
        void getEventBus().publish(createEvent({
            name: HOST_TRANSFER,
            shopId: this.shopId, deviceId: asDeviceId(String(this.localDeviceId)),
            entityId: toDeviceId, entity: 'device',
            payload: { fromDeviceId, toDeviceId, reason: 'manual_transfer' },
        }));
        this.state = {
            primaryId: toDeviceId,
            electedAt: new Date().toISOString(),
            lastHeartbeatAt: null,
            stalenessMs: Infinity,
            status: 'lost',
            electionPending: false,
        };
    }
    /** List devices known to this coordinator. */
    listDevices() {
        return [...this.heartbeats.values()];
    }
    /** Clear all heartbeats — useful for tests. */
    reset() {
        this.heartbeats.clear();
        this.state = {
            primaryId: null, electedAt: null, lastHeartbeatAt: null,
            stalenessMs: Infinity, status: 'lost', electionPending: false,
        };
    }
}
//# sourceMappingURL=primary.js.map