/**
 * Offline queue — local mutations queued for cloud push.
 *
 * When the device is offline, mutations are queued in local storage.
 * When online, the queue is drained to the cloud.
 *
 * Idempotent: uses idempotencyKey from SoostoriEvent for deduplication.
 */
export class OfflineQueue {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    async enqueue(event) {
        const item = {
            id: event.id,
            event,
            retryCount: 0,
            queuedAt: new Date().toISOString(),
            nextAttemptAt: new Date().toISOString(),
        };
        await this.storage.enqueue(item);
        return item;
    }
    async list() {
        return this.storage.list();
    }
    async dequeue(id) {
        await this.storage.dequeue(id);
    }
    async markFailed(id, error) {
        const items = await this.storage.list();
        const item = items.find(i => i.id === id);
        if (!item)
            return;
        item.retryCount += 1;
        item.lastError = error;
        // Exponential backoff: 1s, 2s, 4s, ..., max 5min
        const delayMs = Math.min(5 * 60 * 1000, 1000 * Math.pow(2, item.retryCount));
        item.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
        const updated = items.map(i => i.id === id ? item : i);
        await this.storage.replaceAll(updated);
    }
    /** Items ready to retry now. */
    async dueForRetry(now = new Date()) {
        const items = await this.storage.list();
        return items.filter(i => new Date(i.nextAttemptAt) <= now);
    }
}
//# sourceMappingURL=queue.js.map