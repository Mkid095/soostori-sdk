/**
 * LAN wire protocol — message contracts exchanged over WebSocket.
 *
 * Platform-agnostic. Desktop/Mobile both speak this protocol.
 */

import type { ShopId, DeviceId, ISO8601, UUID } from '@soostori/core'
import type { SoostoriEvent } from '@soostori/events'
import { DISCOVERY_MAGIC, DISCOVERY_VERSION } from './protocol.js'

export { DISCOVERY_MAGIC, DISCOVERY_VERSION }

// ── Discovery (UDP broadcast) ──────────────────────────────────────────────

export interface DiscoveryAdvert {
  magic: typeof DISCOVERY_MAGIC
  version: number
  shopId: ShopId
  shopName: string
  deviceId: DeviceId
  deviceName: string
  deviceType: 'desktop' | 'mobile'
  isPrimary: boolean
  wsPort: number
  employeeId: UUID | null
  employeeName: string | null
  appVersion: string
}

export interface DiscoveryRequest {
  magic: typeof DISCOVERY_MAGIC
  version: number
  shopId: ShopId
  clientDeviceId: DeviceId
}

export type DiscoveryMessage = DiscoveryAdvert | DiscoveryRequest

export function isDiscoveryAdvert(m: DiscoveryMessage): m is DiscoveryAdvert {
  return 'deviceId' in m && 'isPrimary' in m
}

// ── WebSocket frames ─────────────────────────────────────────────────────────

/** Client → Server (terminal → primary) */
export type ClientMessage =
  | { type: 'SALE_REQUEST'; idempotencyKey: string; payload: unknown }
  | { type: 'STOCK_ADJUSTMENT'; idempotencyKey: string; payload: unknown }
  | { type: 'PRODUCT_CREATE'; idempotencyKey: string; payload: unknown }
  | { type: 'PRODUCT_UPDATE'; idempotencyKey: string; payload: unknown }
  | { type: 'GET_EVENTS_AFTER'; sequenceNumber: number }
  | { type: 'HEARTBEAT'; stockSequence: number }
  | { type: 'REGISTER_PAIRING'; pairingCode: string; deviceName: string }

/** Server → Client (primary → terminal) */
export type ServerMessage =
  | { type: 'SALE_ACCEPTED'; idempotencyKey: string; saleId: string; stockAfter: Record<string, number> }
  | { type: 'SALE_REJECTED'; idempotencyKey: string; reason: string; message: string }
  | { type: 'STOCK_ADJUSTMENT_OK'; idempotencyKey: string }
  | { type: 'STOCK_ADJUSTMENT_REJECTED'; idempotencyKey: string; reason: string }
  | { type: 'PRODUCT_BROADCAST'; event: SoostoriEvent }
  | { type: 'EVENTS_BATCH'; events: SoostoriEvent[] }
  | { type: 'HEARTBEAT_ACK'; primaryStockSequence: number; primaryOnline: boolean }
  | { type: 'PAIRING_APPROVED'; deviceId: string; connectionToken: string }
  | { type: 'PAIRING_REJECTED'; pairingCode: string; reason: string }
  | { type: 'ERROR'; code: string; message: string }

/** Wrapper for type-safe framing. */
export interface LanFrame {
  protocol: 'soostori-lan'
  version: number
  message: ClientMessage | ServerMessage
  timestamp: ISO8601
}


// ── Encrypted frame ──────────────────────────────────────────────────────────

import type { EncryptedFrame } from './crypto.js'

/** Discriminant union for the two wire formats. */
export type { EncryptedFrame } from './crypto.js';

export type WireFrame =
  | { encrypted: false; frame: LanFrame }
  | { encrypted: true;  envelope: EncryptedFrame }
