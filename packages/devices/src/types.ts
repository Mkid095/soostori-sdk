/**
 * Device identity — every desktop, mobile, or other client is a Device.
 *
 * Devices belong to Shops. A Device has exactly one authenticated Employee at
 * a time (via AuthSession).
 *
 * The PRIMARY DEVICE is the local LAN authority for stock mutations.
 */

import type { ISO8601, UUID, ShopId, EmployeeId } from '@soostori/core'

export type DeviceType = 'desktop' | 'mobile'

export type DeviceStatus = 'pending' | 'authorized' | 'revoked' | 'offline'

/** Device role within a shop's LAN. */
export type DeviceRole = 'primary' | 'standard' | 'mobile'

export interface Device {
  id: UUID
  shopId: ShopId
  deviceName: string
  deviceType: DeviceType
  status: DeviceStatus
  /** True if this device is the LAN Primary. Mutually exclusive within a shop. */
  isPrimary: boolean
  /** When device was last seen (heartbeat). */
  lastSeenAt: ISO8601 | null
  /** When device was authorized for this shop. */
  authorizedAt: ISO8601 | null
  /** Currently authenticated employee, if any. */
  activeEmployeeId: EmployeeId | null
  /** App version for compatibility checks. */
  appVersion: string | null
  /** Network hostname (for diagnostics). */
  hostname: string | null
  /** Platform identifier (e.g., 'darwin-arm64', 'win32-x64', 'android', 'ios'). */
  platform: string | null
}

/** Device identity persistence record (local). */
export interface DeviceIdentity {
  deviceId: UUID
  /** Public key for signing/verifying LAN messages. */
  publicKey: string | null
  /** Token issued by the cloud during registration. */
  cloudToken: string | null
  /** Shop this device belongs to. */
  shopId: ShopId | null
  /** Cloud-side device record ID. */
  cloudDeviceId: UUID | null
  registeredAt: ISO8601 | null
}

/** LAN heartbeat — every 30s from terminal, every 5s from primary. */
export interface Heartbeat {
  deviceId: UUID
  shopId: ShopId
  timestamp: ISO8601
  isPrimary: boolean
  reachable: boolean
  /** Stock sequence number — terminals use this for catch-up. */
  stockSequence: number
}

/** Primary device state — drives Option C authorization. */
export interface PrimaryDeviceState {
  /** Current primary device ID (null = no primary elected). */
  primaryId: UUID | null
  /** When current primary was elected. */
  electedAt: ISO8601 | null
  /** Last heartbeat from primary. */
  lastHeartbeatAt: ISO8601 | null
  /** Time since last heartbeat — drives failover decision. */
  stalenessMs: number
  /** Health state. */
  status: 'online' | 'stale' | 'lost'
  /** Has an election been initiated? */
  electionPending: boolean
}
