# @soostori/sync

Canonical sync engine — sync events, conflict resolution, idempotency, snapshots.

## Modules

| File | Purpose |
|---|---|
| `event.ts` | SyncEvent factory + idempotency comparison |
| `conflict.ts` | Conflict detection + resolution |
| `queue.ts` | Offline queue with exponential backoff |
| `engine.ts` | SyncEngine orchestrator (push/pull/conflict) |
| `snapshot.ts` | Initial snapshot download + backup snapshot builder |

## SyncEvent contract

Every event MUST carry:

| Field | Purpose |
|---|---|
| `shopId` | Scope (prevents cross-shop leakage) |
| `deviceId` | Origin |
| `idempotencyKey` | UUID — prevents duplicate processing |
| `version` | Monotonic per device — for ordering |
| `timestamp` | ISO 8601 |
| `payload` | JSON-serializable entity data |

## Usage

```ts
import { SyncEngine, createSyncEvent } from '@soostori/sync'

const engine = new SyncEngine({
  shopId: 'shop-uuid',
  deviceId: 'device-uuid',
  cloud,
  queue: myQueueStorage,
})

// Create and queue an event
const event = engine.createEvent({
  entity: 'products',
  entityId: productId,
  operation: 'update',
  payload: { name: 'Coffee Beans', sellingPrice: 550 },
})
await engine.enqueue(event)

// Push all pending
const { pushed, failed } = await engine.pushPending()

// Pull remote changes
const { events } = await engine.pullSinceCursor()
```
