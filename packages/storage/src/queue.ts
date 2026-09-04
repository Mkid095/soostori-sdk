/**
 * Offline queue — local mutations queued for cloud push.
 *
 * When the device is offline, mutations are queued in local storage.
 * When online, the queue is drained to the cloud.
 *
 * Idempotent: uses idempotencyKey from SoostoriEvent for deduplication.
 */

import type { SoostoriEvent } from '@soostori/events'

export interface QueuedItem {
  /** Event id (UUID). */
  id: string
  /** Full event payload. */
  event: SoostoriEvent
  /** Retry count. */
  retryCount: number
  /** First queued timestamp. */
  queuedAt: string
  /** Next retry attempt. */
  nextAttemptAt: string
  /** Last error if any. */
  lastError?: string
}

/** Storage interface for the queue. */
export interface OfflineQueueStorage {
  enqueue(item: QueuedItem): Promise<void>
  dequeue(id: string): Promise<void>
  list(): Promise<QueuedItem[]>
  /** Atomically replace all queued items. */
  replaceAll(items: QueuedItem[]): Promise<void>
}

export class OfflineQueue {
  constructor(private readonly storage: OfflineQueueStorage) {}

  async enqueue(event: SoostoriEvent): Promise<QueuedItem> {
    const item: QueuedItem = {
      id: event.id,
      event,
      retryCount: 0,
      queuedAt: new Date().toISOString(),
      nextAttemptAt: new Date().toISOString(),
    }
    await this.storage.enqueue(item)
    return item
  }

  async list(): Promise<QueuedItem[]> {
    return this.storage.list()
  }

  async dequeue(id: string): Promise<void> {
    await this.storage.dequeue(id)
  }

  async markFailed(id: string, error: string): Promise<void> {
    const items = await this.storage.list()
    const item = items.find(i => i.id === id)
    if (!item) return
    item.retryCount += 1
    item.lastError = error
    // Exponential backoff: 1s, 2s, 4s, ..., max 5min
    const delayMs = Math.min(5 * 60 * 1000, 1000 * Math.pow(2, item.retryCount))
    item.nextAttemptAt = new Date(Date.now() + delayMs).toISOString()
    const updated = items.map(i => i.id === id ? item : i)
    await this.storage.replaceAll(updated)
  }

  /** Items ready to retry now. */
  async dueForRetry(now = new Date()): Promise<QueuedItem[]> {
    const items = await this.storage.list()
    return items.filter(i => new Date(i.nextAttemptAt) <= now)
  }
}
