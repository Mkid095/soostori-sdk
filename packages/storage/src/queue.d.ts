/**
 * Offline queue — local mutations queued for cloud push.
 *
 * When the device is offline, mutations are queued in local storage.
 * When online, the queue is drained to the cloud.
 *
 * Idempotent: uses idempotencyKey from SoostoriEvent for deduplication.
 */
import type { SoostoriEvent } from '@soostori/events';
export interface QueuedItem {
    /** Event id (UUID). */
    id: string;
    /** Full event payload. */
    event: SoostoriEvent;
    /** Retry count. */
    retryCount: number;
    /** First queued timestamp. */
    queuedAt: string;
    /** Next retry attempt. */
    nextAttemptAt: string;
    /** Last error if any. */
    lastError?: string;
}
/** Storage interface for the queue. */
export interface OfflineQueueStorage {
    enqueue(item: QueuedItem): Promise<void>;
    dequeue(id: string): Promise<void>;
    list(): Promise<QueuedItem[]>;
    /** Atomically replace all queued items. */
    replaceAll(items: QueuedItem[]): Promise<void>;
}
export declare class OfflineQueue {
    private readonly storage;
    constructor(storage: OfflineQueueStorage);
    enqueue(event: SoostoriEvent): Promise<QueuedItem>;
    list(): Promise<QueuedItem[]>;
    dequeue(id: string): Promise<void>;
    markFailed(id: string, error: string): Promise<void>;
    /** Items ready to retry now. */
    dueForRetry(now?: Date): Promise<QueuedItem[]>;
}
//# sourceMappingURL=queue.d.ts.map