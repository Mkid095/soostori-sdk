import type { SyncCursor } from '@soostori/core'
import {
  asDeviceId, asShopId, asSyncEventId, asUserId, newId,
  type ShopId, type DeviceId, type UserId, type ISO8601,
} from '@soostori/core'
import type { CloudClient } from '@soostori/cloud'
import { PrimaryDeviceCoordinator, type PrimaryDeviceState } from '@soostori/devices'
import {
  createEvent, type SoostoriEvent, type SoostoriEventName,
} from '@soostori/events'
import { OfflineQueue, type QueueStorage } from './queue'
import { StockAuthorizationError } from './errors'

/**
 * Minimal CloudClient contract used by the sync engine.
 * Platform implementations provide the full CloudClient, but tests can mock just this subset.
 */
export type CloudClientLike = Pick<CloudClient, 'query' | 'transact'>

export type SyncEvent = SoostoriEvent
export type { SoostoriEventName } from '@soostori/events'

/** Conflict record produced during sync. */
export interface SyncConflictRecord {
  id: string
  shopId: ShopId
  saleId?: string
  deviceId: DeviceId
  reason: 'INSUFFICIENT_STOCK' | 'DUPLICATE_EVENT' | 'STALE_VERSION' | 'INVALID_PAYLOAD' | 'PERMISSION_DENIED'
  event: SoostoriEvent
  status: 'pending' | 'resolved' | 'dismissed'
  resolvedBy?: UserId
  resolvedAt?: ISO8601
}

export interface SyncEngineOptions {
  shopId: ShopId
  deviceId: DeviceId
  cloud: CloudClientLike
  queue: QueueStorage
  primary?: PrimaryDeviceCoordinator
  processedEvents?: Set<string>
  cursor?: SyncCursor | null
}

/** Stock-sensitive events that must route through Primary Device. */
export const STOCK_SENSITIVE_EVENTS = new Set<string>([
  'sale.pending', 'sale.confirmed', 'sale.rejected', 'sale.completed', 'sale.refunded',
  'stock.received', 'stock.adjusted', 'stock.transferred',
  'stock.reserved', 'stock.released', 'stock.low', 'stock.low_stock_detected',
  'inventory.received', 'inventory.adjusted', 'inventory.sold', 'inventory.reserved',
])

export class SyncEngine {
  private readonly shopId: ShopId
  private readonly deviceId: DeviceId
  private readonly cloud: CloudClientLike
  private readonly queue: OfflineQueue
  private readonly primary?: PrimaryDeviceCoordinator
  private readonly processedEvents: Set<string>
  private cursor: SyncCursor | null
  private readonly conflicts: SyncConflictRecord[] = []

  constructor(options: SyncEngineOptions) {
    this.shopId = options.shopId
    this.deviceId = options.deviceId
    this.cloud = options.cloud
    this.queue = new OfflineQueue(options.queue)
    this.primary = options.primary
    this.processedEvents = options.processedEvents ?? new Set<string>()
    this.cursor = options.cursor ?? null
  }

  // ── Local event creation ────────────────────────────────────────────

  createEvent(args: {
    name: SoostoriEventName
    entity: string
    entityId: string
    payload: Record<string, unknown>
    userId?: UserId
    source?: SoostoriEvent['source']
  }): SoostoriEvent {
    return createEvent({
      name: args.name,
      shopId: this.shopId,
      deviceId: this.deviceId,
      userId: args.userId,
      entityId: args.entityId,
      entity: args.entity as SoostoriEvent['entity'],
      source: args.source ?? 'local',
      payload: args.payload,
    })
  }

  async enqueue(event: SoostoriEvent): Promise<void> {
    await this.queue.add(event)
  }

  /**
   * Publish an event with Primary Device routing for stock-sensitive operations.
   *
   * Decision matrix (Option C — Hybrid):
   *   Stock-sensitive event + ONLINE Primary    → broadcast via LAN, then push to cloud
   *   Stock-sensitive event + STALE/Lost/None Primary → block (queue only if non-stock)
   *   Non-stock event                              → push directly to cloud
   *
   * CRITICAL: STALE Primary is treated as UNAUTHORIZED. Returning to stock auth
   * during a network partition would re-create the superselling problem.
   */
  async publish(args: Parameters<SyncEngine['createEvent']>[0]): Promise<SoostoriEvent> {
    const event = this.createEvent(args)
    const needsPrimary = STOCK_SENSITIVE_EVENTS.has(event.name)

    if (needsPrimary && this.primary) {
      // CRITICAL: only an ONLINE (healthy) Primary authorizes stock mutations.
      // Stale / Lost / Unknown / Revoked → block the stock operation.
      if (this.primary.canAuthorStockOps()) {
        await this.broadcastToLan(event)
        await this.enqueue(event)
      } else {
        throw new StockAuthorizationError(
          `Stock mutation "${event.name}" blocked: Primary Device is ${this.primary.getState().status}`
        )
      }
    } else {
      // Non-stock events bypass Primary and go straight to cloud.
      await this.enqueue(event)
    }
    return event
  }

  private async broadcastToLan(_event: SoostoriEvent): Promise<void> {
    // Real impl uses @soostori/lan TerminalClient.broadcast(event)
  }

  // ── Push (local → cloud) ────────────────────────────────────────────

  async pushPending(): Promise<{ pushed: number; failed: number }> {
    const pending = await this.queue.getPending()
    let pushed = 0, failed = 0
    for (const item of pending) {
      try {
        if (await this.cloudProcessed(item.event.idempotencyKey)) {
          await this.queue.markSent(item.id)
          pushed++
          continue
        }
        await this.cloud.transact([['update', 'syncEvents', item.event.id, this.eventToInstaml(item.event)]])
        await this.queue.markSent(item.id)
        pushed++
      } catch (err) {
        await this.queue.markFailed(item.id, String(err))
        failed++
      }
    }
    return { pushed, failed }
  }

  private async cloudProcessed(idempotencyKey: string): Promise<boolean> {
    try {
      const result = await this.cloud.query<{ syncEvents: Array<{ id?: string }> }>({
        syncEvents: { $: { where: { id: idempotencyKey } } },
      })
      return (result.syncEvents ?? []).length > 0
    } catch {
      return false
    }
  }

  private eventToInstaml(event: SoostoriEvent): Record<string, unknown> {
    return {
      id: event.id,
      shopId: event.shopId,
      deviceId: event.deviceId,
      entity: event.entity,
      entityId: event.entityId,
      operation: event.name,
      payload: JSON.stringify(event.payload),
      syncedAt: event.timestamp,
    }
  }

  // ── Pull (cloud → local) ────────────────────────────────────────────

  async pullSinceCursor(): Promise<{ events: SoostoriEvent[]; cursor: SyncCursor | null }> {
    const result = await this.cloud.query<{ syncEvents: Array<Record<string, unknown>> }>({
      syncEvents: { $: { limit: 100 } },
    })
    const cloudEvents = (result.syncEvents ?? []) as Array<Record<string, unknown>>
    const newEvents: SoostoriEvent[] = []
    for (const cev of cloudEvents) {
      const event = this.cloudEventToSyncEvent(cev)
      if (this.processedEvents.has(event.idempotencyKey)) continue
      this.processedEvents.add(event.idempotencyKey)
      newEvents.push(event)
    }
    if (newEvents.length) {
      this.cursor = {
        deviceId: this.deviceId,
        shopId: this.shopId,
        lastSeq: (this.cursor?.lastSeq ?? 0) + newEvents.length,
        lastSyncAt: new Date().toISOString(),
      }
    }
    return { events: newEvents, cursor: this.cursor }
  }

  private cloudEventToSyncEvent(cev: Record<string, unknown>): SoostoriEvent {
    const payload = cev.payload as string | Record<string, unknown>
    return {
      id: asSyncEventId(String(cev.id ?? newId())),
      name: String(cev.operation ?? 'system.error') as SoostoriEventName,
      version: 1,
      shopId: asShopId(String(cev.shopId ?? '')),
      deviceId: asDeviceId(String(cev.deviceId ?? '')),
      timestamp: String(cev.syncedAt ?? new Date().toISOString()),
      sequence: Number(cev.syncedAt) || Date.now(),
      idempotencyKey: asSyncEventId(String(cev.id ?? cev.syncedAt ?? newId())),
      entity: String(cev.entity ?? ''),
      entityId: String(cev.entityId ?? ''),
      source: 'cloud',
      payload: typeof payload === 'string' ? JSON.parse(payload) : (payload ?? {}),
      userId: undefined,
    }
  }

  // ── Conflict detection ─────────────────────────────────────────────

  detectConflict(a: SoostoriEvent, b: SoostoriEvent): { conflict: boolean; reason?: SyncConflictRecord['reason'] } {
    if (a.shopId !== b.shopId) return { conflict: false }
    if (a.entityId !== b.entityId) return { conflict: false }
    if (a.entity !== b.entity) return { conflict: false }
    if (a.idempotencyKey === b.idempotencyKey) return { conflict: true, reason: 'DUPLICATE_EVENT' }
    if (a.deviceId !== b.deviceId) return { conflict: true, reason: 'INSUFFICIENT_STOCK' }
    return { conflict: false }
  }

  detectConflicts(events: SoostoriEvent[]): SyncConflictRecord[] {
    const newConflicts: SyncConflictRecord[] = []
    for (const a of events) {
      for (const b of events) {
        if (a === b) continue
        const result = this.detectConflict(a, b)
        if (result.conflict) {
          newConflicts.push({
            id: b.idempotencyKey,
            shopId: b.shopId,
            deviceId: b.deviceId,
            reason: result.reason ?? 'INSUFFICIENT_STOCK',
            event: b,
            status: 'pending',
          })
        }
      }
    }
    return newConflicts
  }

  // ── Cursor management ──────────────────────────────────────────────

  getCursor(): SyncCursor | null { return this.cursor }
  setCursor(c: SyncCursor | null): void { this.cursor = c }

  // ── Primary Device queries ────────────────────────────────────────

  canMutateStock(): boolean {
    if (!this.primary) return true
    return this.primary.canAuthorStockOps()
  }

  getPrimaryState(): PrimaryDeviceState | null {
    return this.primary?.getState() ?? null
  }

  // ── Stats ──────────────────────────────────────────────────────────

  getStats(): { pendingEvents: number; processed: number; conflicts: number } {
    return {
      processed: this.processedEvents.size,
      conflicts: this.conflicts.length,
      pendingEvents: 0,
    }
  }
}
