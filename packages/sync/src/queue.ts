/**
 * Offline queue — local mutations accumulated while offline, pushed on reconnect.
 */

import { newId } from '@soostori/core'
import type { SoostoriEvent } from '@soostori/events'

/** Dead-letter: events that exceed MAX_RETRIES are moved here for manual review. */
export const MAX_RETRIES = 5

/** Exponential backoff delays: 1s, 2s, 4s, 8s, 16s (capped). */
const BACKOFF_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000]

function nextRetryDelay(retryCount: number): number {
  return BACKOFF_DELAYS_MS[Math.min(retryCount, BACKOFF_DELAYS_MS.length) - 1] ?? 16_000
}

export interface OfflineQueueItem {
  id: string
  event: SoostoriEvent
  status: 'pending' | 'in_flight' | 'sent' | 'failed'
  retryCount: number
  nextRetryAt: string
  createdAt: string
  lastError?: string
}

export interface DeadLetterItem extends OfflineQueueItem {
  failedAt: string
  reason: string
}

export interface QueueStorage {
  getAll(): OfflineQueueItem[] | Promise<OfflineQueueItem[]>
  save(item: OfflineQueueItem): void | Promise<void>
  delete(id: string): void | Promise<void>
  /** Mark items older than the cursor as sent. */
  pruneSent(): void | Promise<void>
  /** Persist processed event idempotency keys. */
  saveProcessedEvents(keys: string[]): void | Promise<void>
  /** Load persisted processed event idempotency keys. */
  loadProcessedEvents(): string[] | Promise<string[]>
  /** Move a failed item to the dead-letter store (optional — for retry/replay support). */
  saveDeadLetter?(item: DeadLetterItem): void | Promise<void>
  /** Load all dead-letter items (optional). */
  loadDeadLetters?(): DeadLetterItem[] | Promise<DeadLetterItem[]>
  /** Remove a dead-letter item for retry (optional). */
  deleteDeadLetter?(id: string): void | Promise<void>
}

export class OfflineQueue {
  constructor(readonly storage: QueueStorage) {}

  async add(event: SoostoriEvent): Promise<OfflineQueueItem> {
    const item: OfflineQueueItem = {
      id: newId(),
      event,
      status: 'pending',
      retryCount: 0,
      nextRetryAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }
    await this.storage.save(item)
    return item
  }

  async getPending(): Promise<OfflineQueueItem[]> {
    const all = await this.storage.getAll()
    return all.filter(item =>
      item.status === 'pending' ||
      (item.status === 'failed' && new Date(item.nextRetryAt) <= new Date()),
    )
  }

  async markInFlight(id: string): Promise<void> {
    const all = await this.storage.getAll()
    const item = all.find(i => i.id === id)
    if (item) {
      item.status = 'in_flight'
      await this.storage.save(item)
    }
  }

  async markSent(id: string): Promise<void> {
    const all = await this.storage.getAll()
    const item = all.find(i => i.id === id)
    if (item) {
      item.status = 'sent'
      await this.storage.save(item)
    }
  }

  /**
   * Mark an item as failed.
   * If retryCount >= MAX_RETRIES, moves the item to dead-letter instead of
   * scheduling another retry, preventing infinite retry loops.
   */
  async markFailed(id: string, error: string): Promise<void> {
    const all = await this.storage.getAll()
    const item = all.find(i => i.id === id)
    if (!item) return
    item.retryCount += 1
    item.lastError = error

    if (item.retryCount >= MAX_RETRIES) {
      // Move to dead-letter instead of retrying indefinitely
      await this.storage.delete(id)
      const deadLetter: DeadLetterItem = {
        ...item,
        status: 'failed',
        failedAt: new Date().toISOString(),
        reason: error,
      }
      if (this.storage.saveDeadLetter) {
        await this.storage.saveDeadLetter(deadLetter)
      }
      return
    }

    item.status = 'failed'
    item.nextRetryAt = new Date(Date.now() + nextRetryDelay(item.retryCount)).toISOString()
    await this.storage.save(item)
  }

  /** Move a dead-letter item back to pending for retry. No-op if dead-letter storage is not available. */
  async retryDeadLetter(id: string): Promise<void> {
    if (!this.storage.loadDeadLetters || !this.storage.deleteDeadLetter) return
    const deadLetters = await this.storage.loadDeadLetters()
    const item = deadLetters.find(i => i.id === id)
    if (!item) return
    await this.storage.deleteDeadLetter!(id)
    const restored: OfflineQueueItem = {
      id: item.id,
      event: item.event,
      status: 'pending',
      retryCount: 0,
      nextRetryAt: new Date().toISOString(),
      createdAt: item.createdAt,
      lastError: item.reason,
    }
    await this.storage.save(restored)
  }

  async purge(): Promise<void> {
    await this.storage.pruneSent()
  }
}
