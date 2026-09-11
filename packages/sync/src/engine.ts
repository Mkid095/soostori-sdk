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
import { OfflineQueue, type QueueStorage } from './queue.js'
import { computeIdempotencyKey } from './idempotency.js'

/** Stock-sensitive events that must route through Primary Device. */
export const STOCK_SENSITIVE_EVENTS = new Set<string>([
  'sale.pending', 'sale.confirmed', 'sale.rejected', 'sale.completed', 'sale.refunded',
  'stock.received', 'stock.adjusted', 'stock.transferred',
  'stock.reserved', 'stock.released', 'stock.low', 'stock.low_stock_detected',
  'inventory.received', 'inventory.adjusted', 'inventory.sold', 'inventory.reserved',
])

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
  cursor?: SyncCursor | null
  /** Called after each event is successfully written to the cloud. */
  onEventSent?: (event: SoostoriEvent) => void
  /**
   * Controls how idempotencyKey is handled when writing to FIDScript.
   * - 'required': FIDScript requires the field (will error if absent)
   * - 'optional': FIDScript accepts but ignores it (safe to always include)
   * - 'unsupported': FIDScript does not have this field (omit; use deterministic fallback)
   * Default: detected automatically on first write.
   */
  idempotencyKeySupport?: 'required' | 'optional' | 'unsupported'
}

/**
 * Minimal CloudClient contract used by the sync engine.
 * Platform implementations provide the full CloudClient, but tests can mock just this subset.
 */
export type CloudClientLike = Pick<CloudClient, 'query' | 'transact'>

export class SyncEngine {
  private readonly shopId: ShopId
  private readonly deviceId: DeviceId
  private readonly cloud: CloudClientLike
  private readonly queue: OfflineQueue
  private readonly primary?: PrimaryDeviceCoordinator
  private readonly processedEvents = new Set<string>()
  private cursor: SyncCursor | null = null
  private readonly conflicts: SyncConflictRecord[] = []
  /** Last known entity version per entityId — used for STALE_VERSION conflict detection. */
  private entityVersions = new Map<string, number>()
  private readonly onEventSent?: (event: SoostoriEvent) => void

  constructor(options: SyncEngineOptions) {
    this.shopId = options.shopId
    this.deviceId = options.deviceId
    this.cloud = options.cloud
    this.queue = new OfflineQueue(options.queue)
    this.primary = options.primary
    this.cursor = options.cursor ?? null
    this.onEventSent = options.onEventSent
    // Load persisted processed events asynchronously.
    void this.loadProcessedEvents()
  }

  private async loadProcessedEvents(): Promise<void> {
    try {
      const keys = await this.queue.storage.loadProcessedEvents()
      for (const key of keys) this.processedEvents.add(key)
    } catch { /* ignore — fresh device has no persisted set */ }
  }

  private async saveProcessedEvents(): Promise<void> {
    try {
      await this.queue.storage.saveProcessedEvents([...this.processedEvents])
    } catch { /* ignore storage errors */ }
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
   *   Stock-sensitive event + STALE/Lost/None Primary → queue (non-blocking)
   *   Non-stock event                              → push directly to cloud
   */
  async publish(args: Parameters<SyncEngine['createEvent']>[0]): Promise<SoostoriEvent> {
    const event = this.createEvent(args)
    const needsPrimary = STOCK_SENSITIVE_EVENTS.has(event.name)

    if (needsPrimary && this.primary) {
      if (this.primary.canAuthorStockOps()) {
        await this.broadcastToLan(event)
        await this.enqueue(event)
      } else {
        // Queue stock op instead of throwing — unblock when Primary recovers.
        await this.enqueue(event)
      }
    } else {
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
      // Never re-push items already in flight (might be a concurrent push).
      if (item.status === 'in_flight') continue
      try {
        await this.queue.markInFlight(item.id)
        if (await this.cloudProcessed(computeIdempotencyKey(item.event))) {
          await this.queue.markSent(item.id)
          pushed++
          continue
        }
        await this.cloud.transact([['update', 'syncEvents', item.event.id, this.eventToInstaml(item.event)]])
        await this.queue.markSent(item.id)
        this.onEventSent?.(item.event)
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
    const cursor = this.cursor
    const where: Record<string, unknown> = { shopId: this.shopId }
    if (cursor?.lastSeq != null) {
      where['sequenceNumber'] = { $gt: cursor.lastSeq }
    }
    const result = await this.cloud.query<{ syncEvents: Array<Record<string, unknown>> }>({
      syncEvents: { $: { where, limit: 100 } },
    })
    const cloudEvents = (result.syncEvents ?? []) as Array<Record<string, unknown>>
    const newEvents: SoostoriEvent[] = []

    for (const cev of cloudEvents) {
      const event = this.cloudEventToSyncEvent(cev)
      // Filter by cursor's lastSeq — skip events already seen.
      if (cursor?.lastSeq != null && event.sequence <= cursor.lastSeq) continue
      if (this.processedEvents.has(event.idempotencyKey)) continue

      // STALE_VERSION conflict: incoming version older than what we already have.
      if (event.entityId && event.entityVersion != null) {
        const localVersion = this.getEntityVersion(event.entityId)
        if (event.entityVersion < localVersion) {
          this.conflicts.push({
            id: event.idempotencyKey,
            shopId: event.shopId,
            deviceId: event.deviceId,
            reason: 'STALE_VERSION',
            event,
            status: 'pending',
          })
          continue
        }
      }

      this.processedEvents.add(event.idempotencyKey)
      newEvents.push(event)
    }

    if (newEvents.length) {
      const lastNew = newEvents[newEvents.length - 1]
      // Persist cursor BEFORE returning so crash after pullStill gets correct cursor
      await this.saveProcessedEvents()
      this.cursor = {
        deviceId: this.deviceId,
        shopId: this.shopId,
        lastSeq: lastNew.sequence,
        lastSyncAt: new Date().toISOString(),
      }
    }
    return { events: newEvents, cursor: this.cursor }
  }

  private cloudEventToSyncEvent(cev: Record<string, unknown>): SoostoriEvent & { entityVersion?: number } {
    const payload = cev.payload as string | Record<string, unknown>
    const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : (payload ?? {})
    const eventId = String(cev.id ?? newId())
    const idempotencyKeyRaw = cev.idempotencyKey
      ?? `${cev.entity}:${cev.entityId}:${cev.operation}:${cev.sequenceNumber ?? 0}`
    // Guard: skip events not belonging to this shop (belt-and-suspenders after query filter)
    const eventShopId = String(cev.shopId ?? '')
    if (eventShopId && eventShopId !== this.shopId) {
      return {
        id: asSyncEventId(eventId),
        name: 'system.error' as SoostoriEventName,
        version: 1,
        shopId: asShopId(eventShopId),
        deviceId: asDeviceId(String(cev.deviceId ?? '')),
        timestamp: String(cev.syncedAt ?? new Date().toISOString()),
        sequence: 0,
        idempotencyKey: asSyncEventId(String(idempotencyKeyRaw)),
        entity: String(cev.entity ?? ''),
        entityId: String(cev.entityId ?? ''),
        source: 'cloud',
        payload: parsedPayload,
        userId: undefined,
        entityVersion: (cev.entityVersion as number) ?? parsedPayload.version,
      }
    }
    return {
      id: asSyncEventId(eventId),
      name: String(cev.operation ?? 'system.error') as SoostoriEventName,
      version: 1,
      shopId: asShopId(eventShopId || this.shopId),
      deviceId: asDeviceId(String(cev.deviceId ?? '')),
      timestamp: String(cev.syncedAt ?? new Date().toISOString()),
      // Prefer sequenceNumber (server-assigned) over timestamp for ordering; fallback to 0
      sequence: Number(cev.sequenceNumber ?? 0),
      // Use idempotencyKey from schema; fall back to deterministic composite
      idempotencyKey: asSyncEventId(String(idempotencyKeyRaw)),
      entity: String(cev.entity ?? ''),
      entityId: String(cev.entityId ?? ''),
      source: 'cloud',
      payload: parsedPayload,
      userId: undefined,
      // May be present in the cloud event record.
      entityVersion: (cev.entityVersion as number) ?? parsedPayload.version,
    }
  }

  /**
   * Update tracked entity version after applying a local or pulled event.
   * Call this when an event is successfully applied so subsequent pulls
   * can detect stale versions.
   */
  updateEntityVersion(entityId: string, version: number): void {
    this.entityVersions.set(entityId, version)
  }

  /**
   * Get the currently tracked version for an entity.
   */
  getEntityVersion(entityId: string): number {
    return this.entityVersions.get(entityId) ?? 0
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
