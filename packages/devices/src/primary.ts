/**
 * LAN Host Device management — Option C implementation.
 *
 * The LAN Host Device is the local LAN authority for stock mutations.
 * - Terminals send SALE_REQUEST to the LAN Host for stock validation
 * - LAN Host broadcasts SALE_CONFIRMED/SALE_REJECTED
 * - When LAN Host is lost, non-stock operations continue, stock ops queue
 *
 * Election rules:
 * - First device to join a shop LAN becomes LAN Host (auto-election)
 * - LAN Host can voluntarily step down via HOST_TRANSFER
 * - LAN Host can be revoked by an owner via the cloud
 * - Manual failover only — never automatic blind election
 *
 * Why not automatic failover?
 * In a POS with money and inventory, two devices accidentally becoming
 * LAN Host creates worse problems than temporarily restricting stock ops.
 */

import type { Device, Heartbeat, PrimaryDeviceState } from './types.js'
import type { UUID, ShopId, ISO8601 } from '@soostori/core'
import { addMilliseconds, asDeviceId } from '@soostori/core'
import {
  createEvent, PRIMARY_DEVICE_ELECTED, PRIMARY_DEVICE_LOST, HOST_TRANSFER,
  HEARTBEAT_ACK, DEVICE_ONLINE, DEVICE_OFFLINE,
} from '@soostori/events'
import { getEventBus } from '@soostori/events'

/** Configuration. */
export interface PrimaryDeviceConfig {
  /** Heartbeat considered fresh within this window. */
  freshnessMs?: number
  /** When primary is lost, after this grace period notify other devices. */
  lostGraceMs?: number
}

const DEFAULT_FRESHNESS_MS = 15_000  // 15s heartbeat freshness window
const DEFAULT_LOST_GRACE_MS = 60_000  // 60s before declaring lost

/** Primary Device coordinator — runs on every device. */
export class PrimaryDeviceCoordinator {
  private readonly config: Required<PrimaryDeviceConfig>
  private readonly shopId: ShopId
  private readonly localDeviceId: UUID
  private heartbeats = new Map<UUID, Heartbeat>()
  private state: PrimaryDeviceState

  constructor(args: {
    shopId: ShopId
    deviceId: UUID
    config?: PrimaryDeviceConfig
  }) {
    this.shopId = args.shopId
    this.localDeviceId = args.deviceId
    this.config = {
      freshnessMs: args.config?.freshnessMs ?? DEFAULT_FRESHNESS_MS,
      lostGraceMs: args.config?.lostGraceMs ?? DEFAULT_LOST_GRACE_MS,
    }
    this.state = {
      primaryId: null,
      electedAt: null,
      lastHeartbeatAt: null,
      stalenessMs: Infinity,
      status: 'lost',
      electionPending: false,
    }
  }

  /** Process a heartbeat received from a device (including ourselves). */
  ingestHeartbeat(hb: Heartbeat): void {
    if (hb.shopId !== this.shopId) return
    this.heartbeats.set(asDeviceId(hb.deviceId as string), hb)

    if (hb.isLanHost) {
      // This device claims LAN host
      if (this.state.primaryId === null) {
        this.electPrimary(asDeviceId(hb.deviceId as string), hb.timestamp)
      } else if (this.state.primaryId !== asDeviceId(hb.deviceId as string)) {
        // Conflict — only manual transfer changes the primary
        // For now, keep current until HOST_TRANSFER event
      } else {
        this.state.lastHeartbeatAt = hb.timestamp
        this.state.stalenessMs = 0
        this.state.status = 'online'
      }
    }

    if (asDeviceId(hb.deviceId as string) === this.localDeviceId && !hb.isLanHost) {
      // We were LAN Host but heartbeat claims we're not — possibly transferred
      // The transfer event handles this, so we just continue
    }
  }

  /** Update internal state based on heartbeat timestamps. Call periodically. */
  tick(now = Date.now()): void {
    const primaryHb = this.state.primaryId ? this.heartbeats.get(this.state.primaryId) : null
    if (!primaryHb) {
      this.state.stalenessMs = Infinity
      this.state.status = 'lost'
      return
    }
    const age = now - new Date(primaryHb.timestamp).getTime()
    this.state.stalenessMs = age
    if (age > this.config.lostGraceMs && this.state.status === 'online') {
      this.state.status = 'lost'
      void getEventBus().publish(createEvent({
        name: PRIMARY_DEVICE_LOST,
        shopId: this.shopId, deviceId: asDeviceId(String(this.localDeviceId)),
        entityId: this.state.primaryId ?? undefined,
        entity: 'device',
        payload: {
          lastSeenAt: primaryHb.timestamp,
          notifiedDevices: [...this.heartbeats.keys()].filter(id => id !== this.state.primaryId),
        },
      }))
    } else if (age > this.config.freshnessMs) {
      this.state.status = 'stale'
    } else {
      this.state.status = 'online'
    }
  }

  /** Get current primary device state. */
  getState(): PrimaryDeviceState {
    return { ...this.state }
  }

  /** Check if the local device is the current primary. */
  isLocalPrimary(): boolean {
    return this.state.primaryId === this.localDeviceId
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
  canAuthorStockOps(): boolean {
    return this.state.status === 'online'
  }

  /** Authoritative accessor for the full Primary state. */
  getPrimaryState(): PrimaryDeviceState {
    return { ...this.state }
  }

  /** Elect a new primary (auto-election on first device or manual). */
  private electPrimary(deviceId: UUID, at: ISO8601): void {
    if (this.state.primaryId && this.state.primaryId !== deviceId) {
      // Conflict — manual transfer only
      return
    }
    if (this.state.primaryId === deviceId) return
    this.state = {
      primaryId: deviceId,
      electedAt: at,
      lastHeartbeatAt: at,
      stalenessMs: 0,
      status: 'online',
      electionPending: false,
    }
    void getEventBus().publish(createEvent({
      name: PRIMARY_DEVICE_ELECTED,
      shopId: this.shopId, deviceId: asDeviceId(String(this.localDeviceId)),
      entityId: deviceId, entity: 'device',
      payload: { deviceId },
    }))
  }

  /** Manually transfer primary to another device. */
  transferPrimary(toDeviceId: UUID, fromDeviceId: UUID): void {
    if (this.state.primaryId !== fromDeviceId) {
      throw new Error(`Cannot transfer: ${fromDeviceId} is not the current primary`)
    }
    void getEventBus().publish(createEvent({
      name: HOST_TRANSFER,
      shopId: this.shopId, deviceId: asDeviceId(String(this.localDeviceId)),
      entityId: toDeviceId, entity: 'device',
      payload: { fromDeviceId, toDeviceId, reason: 'manual_transfer' },
    }))
    this.state = {
      primaryId: toDeviceId,
      electedAt: new Date().toISOString(),
      lastHeartbeatAt: null,
      stalenessMs: Infinity,
      status: 'lost',
      electionPending: false,
    }
  }

  /** List devices known to this coordinator. */
  listDevices(): Heartbeat[] {
    return [...this.heartbeats.values()]
  }

  /** Clear all heartbeats — useful for tests. */
  reset(): void {
    this.heartbeats.clear()
    this.state = {
      primaryId: null, electedAt: null, lastHeartbeatAt: null,
      stalenessMs: Infinity, status: 'lost', electionPending: false,
    }
  }
}
