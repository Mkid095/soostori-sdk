/**
 * DeviceService — canonical device management service.
 *
 * All device mutations flow through here. Each mutation:
 * - is scoped to a businessId
 * - emits a typed sync event via the sync engine
 *
 * Phase 15 capability gates:
 *   devices.view           — list devices, see status
 *   devices.manage         — approve, revoke, enroll
 *   devices.transfer_primary — initiate primary transfer
 */

import { z } from 'zod'
import type { BusinessId, DeviceId, ISO8601, UserId } from '@soostori/core'
import { newId } from '@soostori/core'
import { createEvent, getEventBus } from '@soostori/events'
import {
  DEVICE_ENROLLED,
  DEVICE_APPROVED,
  DEVICE_REVOKED,
  DEVICE_PRIMARY_TRANSFERRED,
  HOST_TRANSFER,
  type SoostoriEvent,
} from '@soostori/events'
import { PrimaryDeviceCoordinator } from './primary.js'
import type { Device, DeviceStatus, DeviceType } from './types.js'
import type { DevicesRepository } from './repository.js'

// ── Input schemas ─────────────────────────────────────────────────────────────

const EnrollDeviceInput = z.object({
  deviceName: z.string().min(1).max(128),
  deviceType: z.enum(['desktop', 'mobile']),
  hostname: z.string().max(256).optional(),
  platform: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
})
export type EnrollDeviceInput = z.infer<typeof EnrollDeviceInput>

// ── SyncEngine-like interface ──────────────────────────────────────────────────

/** Subset of SyncEngine needed by DeviceService. */
export interface SyncEngineLike {
  enqueue(event: SoostoriEvent): Promise<void>
}

// ── DeviceService ──────────────────────────────────────────────────────────────

export interface DeviceServiceOptions {
  businessId: BusinessId
  deviceId: DeviceId
  repository: DevicesRepository
  syncEngine: SyncEngineLike
  primaryCoordinator?: PrimaryDeviceCoordinator
}

export class DeviceService {
  private readonly businessId: BusinessId
  private readonly deviceId: DeviceId
  private readonly repository: DevicesRepository
  private readonly syncEngine: SyncEngineLike
  private readonly primary?: PrimaryDeviceCoordinator

  constructor(options: DeviceServiceOptions) {
    this.businessId = options.businessId
    this.deviceId = options.deviceId
    this.repository = options.repository
    this.syncEngine = options.syncEngine
    this.primary = options.primaryCoordinator
  }

  /** Enroll a new device (registers but does not authorize). */
  async enrollDevice(
    input: EnrollDeviceInput,
    enrolledBy?: UserId,
  ): Promise<Device> {
    const parsed = EnrollDeviceInput.parse(input)
    const now: ISO8601 = new Date().toISOString()

    const device: Device = {
      id: newId() as DeviceId,
      shopId: this.businessId as any,
      deviceName: parsed.deviceName,
      deviceType: parsed.deviceType,
      status: 'pending',
      isLanHost: false,
      lastSeenAt: now,
      authorizedAt: null,
      activeEmployeeId: null,
      appVersion: parsed.appVersion ?? null,
      hostname: parsed.hostname ?? null,
      platform: parsed.platform ?? null,
    }

    await this.repository.registerDevice(device)

    const event = createEvent({
      name: DEVICE_ENROLLED,
      shopId: this.businessId as any,
      deviceId: this.deviceId,
      userId: enrolledBy,
      entityId: device.id,
      entity: 'device',
      payload: {
        deviceId: device.id,
        deviceName: device.deviceName,
        deviceType: device.deviceType,
        businessId: this.businessId,
      },
    })
    await this.syncEngine.enqueue(event)
    void getEventBus().publish(event)

    return device
  }

  /** Authorize a pending device. */
  async approveDevice(deviceId: DeviceId, approvedBy: UserId): Promise<Device> {
    const device = await this.repository.findDevice(deviceId)
    if (!device) throw new Error(`Device not found: ${deviceId}`)
    if (device.status === 'revoked') throw new Error(`Device is revoked: ${deviceId}`)

    const now: ISO8601 = new Date().toISOString()
    const updated = await this.repository.updateDevice(deviceId, {
      status: 'authorized',
      authorizedAt: now,
    })

    const event = createEvent({
      name: DEVICE_APPROVED,
      shopId: this.businessId as any,
      deviceId: this.deviceId,
      userId: approvedBy,
      entityId: deviceId,
      entity: 'device',
      payload: { deviceId, approvedBy },
    })
    await this.syncEngine.enqueue(event)
    void getEventBus().publish(event)

    return updated
  }

  /** Revoke a device — removes it from the business. */
  async revokeDevice(deviceId: DeviceId, revokedBy: UserId): Promise<void> {
    const device = await this.repository.findDevice(deviceId)
    if (!device) throw new Error(`Device not found: ${deviceId}`)

    const now: ISO8601 = new Date().toISOString()
    await this.repository.revokeDevice(deviceId, now)

    // If revoking the LAN host, trigger a transfer
    if (device.isLanHost && this.primary) {
      this.primary.transferPrimary(deviceId as any, this.deviceId as any)
    }

    const event = createEvent({
      name: DEVICE_REVOKED,
      shopId: this.businessId as any,
      deviceId: this.deviceId,
      userId: revokedBy,
      entityId: deviceId,
      entity: 'device',
      payload: { deviceId, revokedBy },
    })
    await this.syncEngine.enqueue(event)
    void getEventBus().publish(event)
  }

  /**
   * Transfer the primary device role to another device.
   * Requires the local device to be the current primary.
   */
  async transferPrimary(toDeviceId: DeviceId, transferredBy: UserId): Promise<void> {
    if (!this.primary) throw new Error('PrimaryDeviceCoordinator not configured')

    const currentPrimary = this.primary.getState().primaryId
    if (currentPrimary !== this.deviceId) {
      throw new Error('Only the current primary device can initiate a transfer')
    }

    const target = await this.repository.findDevice(toDeviceId)
    if (!target) throw new Error(`Target device not found: ${toDeviceId}`)
    if (target.status !== 'authorized') {
      throw new Error(`Target device is not authorized: ${toDeviceId}`)
    }

    // Update local primary coordinator
    this.primary.transferPrimary(toDeviceId as any, this.deviceId as any)

    // Update both devices in repository
    await this.repository.updateDevice(this.deviceId, { isLanHost: false })
    await this.repository.updateDevice(toDeviceId, { isLanHost: true })

    const event = createEvent({
      name: DEVICE_PRIMARY_TRANSFERRED,
      shopId: this.businessId as any,
      deviceId: this.deviceId,
      userId: transferredBy,
      entityId: toDeviceId,
      entity: 'device',
      payload: {
        fromDeviceId: this.deviceId,
        toDeviceId,
        transferredBy,
      },
    })
    await this.syncEngine.enqueue(event)
    void getEventBus().publish(event)

    // Also emit the LAN-level host transfer event
    const hostEvent = createEvent({
      name: HOST_TRANSFER,
      shopId: this.businessId as any,
      deviceId: this.deviceId,
      userId: transferredBy,
      entityId: toDeviceId,
      entity: 'device',
      payload: {
        fromDeviceId: this.deviceId,
        toDeviceId,
        reason: 'manual_transfer',
      },
    })
    await this.syncEngine.enqueue(hostEvent)
    void getEventBus().publish(hostEvent)
  }

  /** List all devices for this business. */
  async listDevices(): Promise<Device[]> {
    return this.repository.findByShop(this.businessId as any)
  }

  /** Get a single device. */
  async getDevice(deviceId: DeviceId): Promise<Device | null> {
    return this.repository.findDevice(deviceId)
  }

  /** Return the LAN host device for this shop, if any. */
  async getLanHost(): Promise<Device | null> {
    const devices = await this.repository.findByShop(this.businessId as any)
    return devices.find(d => d.isLanHost) ?? null
  }

  /**
   * Transfer LAN host authority to another device.
   * Demotes the current host and promotes the target.
   */
  async setLanHost(targetDeviceId: DeviceId, transferredBy: UserId): Promise<void> {
    if (!this.primary) throw new Error('PrimaryDeviceCoordinator not configured')

    const currentHost = await this.getLanHost()
    const target = await this.repository.findDevice(targetDeviceId)
    if (!target) throw new Error(`Target device not found: ${targetDeviceId}`)
    if (target.status !== 'authorized') {
      throw new Error(`Target device is not authorized: ${targetDeviceId}`)
    }

    if (currentHost) {
      await this.repository.updateDevice(currentHost.id, { isLanHost: false })
    }
    await this.repository.updateDevice(targetDeviceId, { isLanHost: true })

    this.primary.transferPrimary(targetDeviceId as any, this.deviceId as any)

    const event = createEvent({
      name: HOST_TRANSFER,
      shopId: this.businessId as any,
      deviceId: this.deviceId,
      userId: transferredBy,
      entityId: targetDeviceId,
      entity: 'device',
      payload: {
        fromDeviceId: currentHost?.id ?? null,
        toDeviceId: targetDeviceId,
        transferredBy,
        reason: 'lan_host_transfer',
      },
    })
    await this.syncEngine.enqueue(event)
    void getEventBus().publish(event)
  }
}
