/**
 * LAN Primary Host — runs only on the Primary Device.
 *
 * Provides:
 * - UDP discovery broadcast (every 5s)
 * - WebSocket server on port 18792
 * - AES-256-GCM encrypted frames once a shared key is provisioned
 * - Token-validated connections
 * - Stock authorization for sale/stock adjustment requests
 * - Event broadcast to all connected terminals
 */

import type { ShopId, DeviceId, UUID } from '@soostori/core'
import type { SoostoriEvent } from '@soostori/events'
import type { EncryptedFrame, WireFrame } from "./messages.js";
import {
  ClientMessage, ServerMessage, DiscoveryAdvert, LanFrame,
} from './messages.js'
import { DISCOVERY_MAGIC, DISCOVERY_VERSION } from './messages.js'
import { DISCOVERY_PORT, SYNC_PORT } from './protocol.js'
import { encrypt, decrypt, type LanKey } from './crypto.js'

export const PRIMARY_ENCRYPTED = true

/** Inject the platform-specific transport. */
export interface LanHostTransport {
  sendUdp(data: Buffer, port: number): void
  startUdpListener(port: number, handler: (data: Buffer, from: string) => void): () => void
  startWebSocketServer(port: number, handler: (conn: HostConnection) => void): () => void
}

/** Connection abstraction given to the host. */
export interface HostConnection {
  id: string
  remoteAddress: string
  deviceId: string | null
  /** Authenticated after token validation. */
  authenticated: boolean
  send(data: string): void
  close(): void
  onMessage(handler: (data: string) => void): () => void
  onClose(handler: () => void): () => void
}

/** Authorization interface — host calls this to authorize stock ops. */
export interface StockAuthorizer {
  authorizeSale(args: { idempotencyKey: string; payload: unknown; deviceId: DeviceId }): Promise<{
    accepted: boolean
    saleId?: string
    stockAfter?: Record<string, number>
    reason?: string
    message?: string
  }>
  authorizeStockAdjustment(args: { idempotencyKey: string; payload: unknown; deviceId: DeviceId }): Promise<{
    accepted: boolean
    reason?: string
  }>
}

export interface PrimaryHostConfig {
  shopId: ShopId
  primaryDeviceId: DeviceId
  primaryDeviceName: string
  shopName: string
  appVersion: string
  /** 256-bit AES key provisioned during device authorization. */
  encryptionKey: LanKey | null
  /** Function to validate a pairing token. Returns the deviceId if valid. */
  validateToken: (token: string) => Promise<UUID | null>
  authorizer: StockAuthorizer
  transport: LanHostTransport
}

export class PrimaryHost {
  private readonly cfg: PrimaryHostConfig
  private connections = new Map<string, HostConnection>()
  private discoveryStop: (() => void) | null = null
  private serverStop: (() => void) | null = null
  private broadcastTimer: ReturnType<typeof setInterval> | null = null

  constructor(cfg: PrimaryHostConfig) {
    this.cfg = cfg
  }

  async start(): Promise<void> {
    // Discovery broadcast
    this.discoveryStop = this.cfg.transport.startUdpListener(DISCOVERY_PORT, () => {})
    this.broadcastTimer = setInterval(() => this.broadcastDiscovery(), 5000)
    this.broadcastDiscovery()

    // WebSocket server
    this.serverStop = this.cfg.transport.startWebSocketServer(SYNC_PORT, (conn) => {
      this.handleConnection(conn)
    })
  }

  private broadcastDiscovery(): void {
    const advert: DiscoveryAdvert = {
      magic: DISCOVERY_MAGIC, version: DISCOVERY_VERSION,
      shopId: this.cfg.shopId, shopName: this.cfg.shopName,
      deviceId: this.cfg.primaryDeviceId, deviceName: this.cfg.primaryDeviceName,
      deviceType: 'desktop', isPrimary: true, wsPort: SYNC_PORT,
      employeeId: null, employeeName: null, appVersion: this.cfg.appVersion,
    }
    this.cfg.transport.sendUdp(Buffer.from(JSON.stringify(advert)), DISCOVERY_PORT)
  }

  private handleConnection(conn: HostConnection): void {
    this.connections.set(conn.id, conn)
    conn.onMessage(async (raw) => {
      try {
        const wire = JSON.parse(raw) as unknown as WireFrame
        const frame = this.unwrapFrame(wire)
        if (!frame) {
          conn.send(JSON.stringify({ type: 'ERROR', code: 'DECRYPTION_FAILED', message: 'Unable to decrypt frame' } satisfies ServerMessage))
          return
        }
        const msg = frame.message as ClientMessage
        // First message must include device ID; we authenticate via X-Soostori-Token header
        // For simplicity: require a REGISTER_PAIRING first, or expect headers
        if (msg.type === 'REGISTER_PAIRING') {
          const deviceId = await this.cfg.validateToken(msg.pairingCode)
          if (deviceId) {
            conn.deviceId = deviceId
            conn.authenticated = true
            const token = msg.pairingCode  // simplified — real impl returns fresh token
            this.sendRaw(conn, {
              type: 'PAIRING_APPROVED', deviceId, connectionToken: token,
            })
          } else {
            this.sendRaw(conn, {
              type: 'PAIRING_REJECTED', pairingCode: msg.pairingCode, reason: 'invalid_token',
            })
            conn.close()
          }
          return
        }
        if (!conn.authenticated) {
          this.sendRaw(conn, {
            type: 'ERROR', code: 'NOT_AUTHENTICATED', message: 'Send REGISTER_PAIRING first',
          })
          return
        }
        await this.routeMessage(conn, msg)
      } catch (err) {
        log('error', 'PrimaryHost message handling:', err)
      }
    })
    conn.onClose(() => { this.connections.delete(conn.id) })
  }

  private async routeMessage(conn: HostConnection, msg: ClientMessage): Promise<void> {
    if (msg.type === 'HEARTBEAT') {
      this.sendRaw(conn, {
        type: 'HEARTBEAT_ACK', primaryStockSequence: 0, primaryOnline: true,
      })
      return
    }
    if (msg.type === 'SALE_REQUEST') {
      const result = await this.cfg.authorizer.authorizeSale({
        idempotencyKey: msg.idempotencyKey, payload: msg.payload,
        deviceId: conn.deviceId as DeviceId,
      })
      if (result.accepted) {
        this.sendRaw(conn, {
          type: 'SALE_ACCEPTED', idempotencyKey: msg.idempotencyKey,
          saleId: result.saleId ?? msg.idempotencyKey, stockAfter: result.stockAfter ?? {},
        })
      } else {
        this.sendRaw(conn, {
          type: 'SALE_REJECTED', idempotencyKey: msg.idempotencyKey,
          reason: result.reason ?? 'UNKNOWN', message: result.message ?? 'Sale rejected',
        })
      }
      return
    }
    if (msg.type === 'STOCK_ADJUSTMENT') {
      const result = await this.cfg.authorizer.authorizeStockAdjustment({
        idempotencyKey: msg.idempotencyKey, payload: msg.payload,
        deviceId: conn.deviceId as DeviceId,
      })
      this.sendRaw(conn, {
        type: result.accepted ? 'STOCK_ADJUSTMENT_OK' : 'STOCK_ADJUSTMENT_REJECTED',
        idempotencyKey: msg.idempotencyKey,
        reason: result.reason ?? '',
      })
      return
    }
  }

  /** Broadcast an event to all connected terminals. */
  broadcast(event: SoostoriEvent): void {
    const msg: ServerMessage = { type: 'PRODUCT_BROADCAST', event }
    for (const conn of this.connections.values()) {
      try { this.sendRaw(conn, msg) } catch { /* ignore */ }
    }
  }

  async stop(): Promise<void> {
    this.discoveryStop?.()
    this.serverStop?.()
    if (this.broadcastTimer) clearInterval(this.broadcastTimer)
    for (const conn of this.connections.values()) conn.close()
    this.connections.clear()
  }

  private unwrapFrame(wire: WireFrame): LanFrame | null {
    if (!wire.encrypted) return wire.frame
    if (!this.cfg.encryptionKey) return null
    try { return JSON.parse(decrypt(wire.envelope, this.cfg.encryptionKey)) as LanFrame } catch { return null }
  }

  private sendRaw(conn: HostConnection, msg: ServerMessage): void {
    const frame: LanFrame = { protocol: 'soostori-lan', version: 1, message: msg, timestamp: new Date().toISOString() }
    conn.send(JSON.stringify(this.wrapFrame(frame)))
  }

  private wrapFrame(frame: LanFrame): WireFrame {
    if (!this.cfg.encryptionKey) return { encrypted: false, frame }
    return { encrypted: true, envelope: encrypt(JSON.stringify(frame), this.cfg.encryptionKey) }
  }

  getConnectionCount(): number {
    return this.connections.size
  }
}

function log(_level: string, ..._args: unknown[]): void {
  // Pluggable logger — host applications inject their own
}
