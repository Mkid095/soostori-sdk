/**
 * Offline queue — local mutations accumulated while offline, pushed on reconnect.
 */

import { newId } from '@soostori/core'
import type { SoostoriEvent } from '@soostori/events'

export interface OfflineQueueItem {
  id: string
  event: SoostoriEvent
  status: 'pending' | 'in_flight' | 'sent' | 'failed'
  retryCount: number
  nextRetryAt: string
  createdAt: string
  lastError?: string
}

export interface QueueStorage {
  getAll(): OfflineQueueItem[] | Promise<OfflineQueueItem[]>
  save(item: OfflineQueueItem): void | Promise<void>
  delete(id: string): void | Promise<void>
  /** Mark items older than the cursor as sent. */
  pruneSent(): void | Promise<void>
}

export class OfflineQueue {
  constructor(private readonly storage: QueueStorage) {}

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
      item.status === 'pending' || (item.status === 'failed' && new Date(item.nextRetryAt) <= new Date())
    )
  }

  async markSent(id: string): Promise<void> {
    const all = await this.storage.getAll()
    const item = all.find(i => i.id === id)
    if (item) {
      item.status = 'sent'
      await this.storage.save(item)
    }
  }

  async markFailed(id: string, error: string): Promise<void> {
    const all = await this.storage.getAll()
    const item = all.find(i => i.id === id)
    if (item) {
      item.status = 'failed'
      item.retryCount += 1
      item.lastError = error
      // Exponential backoff: 1s, 2s, 4s, 8s, max 5 min
      const delayMs = Math.min(5 * 60 * 1000, 1000 * Math.pow(2, item.retryCount))
      item.nextRetryAt = new Date(Date.now() + delayMs).toISOString()
      await this.storage.save(item)
    }
  }

  async purge(): Promise<void> {
    await this.storage.pruneSent()
  }
}
