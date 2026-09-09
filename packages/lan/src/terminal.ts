/**
 * LAN terminal client — connects to the Primary Device.
 *
 * Each non-primary device runs one TerminalClient. It:
 * 1. Discovers Primary via UDP broadcast
 * 2. Connects WebSocket using pairing token
 * 3. Sends heartbeats (every 5s)
 * 4. Sends SALE_REQUEST / STOCK_ADJUSTMENT for stock ops
 * 5. Receives SALE_ACCEPTED / SALE_REJECTED responses
 * 6. Receives product/event broadcasts
 *
 * Platform-agnostic — uses injected `connect` and `sendUdp` for transport.
 */

import type { ShopId, DeviceId, UUID } from '@soostori/core'
import type { SoostoriEvent } from '@soostori/events'
import {
  DiscoveryAdvert, DiscoveryRequest, ClientMessage, ServerMessage,
} from './messages.js'
import { DISCOVERY_MAGIC, DISCOVERY_VERSION } from './messages.js'
import {
  DISCOVERY_PORT, SYNC_PORT, HEARTBEAT_INTERVAL_MS,
} from './protocol.js'

/** Transport injection point — platform implementations provide these. */
export interface LanTransport {
  /** Send a UDP datagram to broadcast address. */
  sendUdp(data: Buffer, port: number): Promise<void>
  /** Listen for UDP datagrams on a port. */
  onUdp(port: number, handler: (data: Buffer, from: string) => void): () => void
  /** Open WebSocket connection. Returns send function + close. */
  connect(url: string, headers?: Record<string, string>): Promise<{
    send: (data: string) => void
    close: () => void
    onMessage: (handler: (data: string) => void) => () => void
    onClose: (handler: () => void) => () => void
  }>
}

export interface TerminalClientConfig {
  shopId: ShopId
  deviceId: DeviceId
  deviceName: string
  deviceType: 'desktop' | 'mobile'
  /** Pre-approved pairing token from owner. */
  pairingToken: string
  transport: LanTransport
  appVersion: string
}

type MessageHandler = (msg: ServerMessage) => void
type EventHandler = (event: SoostoriEvent) => void

/** Terminal client — runs on every non-primary device. */
export class TerminalClient {
  private readonly cfg: TerminalClientConfig
  private primaryUrl: string | null = null
  private ws: Awaited<ReturnType<LanTransport['connect']>> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private listeners: MessageHandler[] = []
  private eventListeners: EventHandler[] = []
  private closed = false

  constructor(cfg: TerminalClientConfig) {
    this.cfg = cfg
  }

  /** Start discovery and connection. Returns once primary is connected. */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.cfg.transport.onUdp(DISCOVERY_PORT, async (data, _from) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.magic !== DISCOVERY_MAGIC || msg.version !== DISCOVERY_VERSION) return
          if (msg.shopId !== this.cfg.shopId) return
          if (msg.deviceId === this.cfg.deviceId) return
          if (!msg.isPrimary) return
          const url = `ws://${_from.split(':')[0]}:${msg.wsPort ?? SYNC_PORT}`
          unsubscribe()
          await this.connect(url)
          resolve()
        } catch (err) {
          reject(err as Error)
        }
      })
      try {
        this.cfg.transport.sendUdp(
          Buffer.from(JSON.stringify({
            magic: DISCOVERY_MAGIC, version: DISCOVERY_VERSION,
            shopId: this.cfg.shopId, clientDeviceId: this.cfg.deviceId,
          } satisfies DiscoveryRequest)),
          DISCOVERY_PORT,
        )
      } catch { /* UDP errors swallowed */ }
    })
  }

  private async connect(url: string): Promise<void> {
    if (this.closed) return
    this.primaryUrl = url
    const ws = await this.cfg.transport.connect(url, {
      'X-Soostori-Device-Id': this.cfg.deviceId,
      'X-Soostori-Token': this.cfg.pairingToken,
    })
    this.ws = ws
    ws.onMessage((raw) => {
      try {
        const frame = JSON.parse(raw) as ServerMessage
        for (const l of this.listeners) l(frame)
      } catch { /* ignore malformed */ }
    })
    ws.onClose(() => {
      this.ws = null
      if (!this.closed) {
        setTimeout(() => this.start().catch(() => {}), 2000)  // reconnect
      }
    })
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS)
  }

  private sendHeartbeat(): void {
    this.send({ type: 'HEARTBEAT', stockSequence: 0 } as ClientMessage)
  }

  /** Send a client message to the primary. */
  send(msg: ClientMessage): void {
    if (!this.ws) return
    this.ws.send(JSON.stringify({ protocol: 'soostori-lan', version: 1, message: msg, timestamp: new Date().toISOString() }))
  }

  /** Subscribe to server messages. */
  onMessage(handler: MessageHandler): () => void {
    this.listeners.push(handler)
    return () => { this.listeners = this.listeners.filter(l => l !== handler) }
  }

  /** Subscribe to broadcasted events. */
  onEvent(handler: EventHandler): () => void {
    this.eventListeners.push(handler)
    return () => { this.eventListeners = this.eventListeners.filter(l => l !== handler) }
  }

  async stop(): Promise<void> {
    this.closed = true
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.ws?.close()
    this.ws = null
    this.primaryUrl = null
  }

  getPrimaryUrl(): string | null {
    return this.primaryUrl
  }
}
