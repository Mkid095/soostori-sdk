# @soostori/contracts

Canonical Soostori data contract — source of truth for Web, Desktop, Mobile, and Cloud.

Defines **all 22 entities** + the **SyncEvent / SyncEngine contract** + a `NoOpSyncEngine` stub.

See [`docs/sync-semantics.md`](./docs/sync-semantics.md) for the full conflict-resolution
principles (Primary Device authority, last-writer-wins, tombstones, idempotency, ordering,
retry) with the `SyncEvent` fields they apply to.

## Install (workspace)

```ts
import {
  Product, Sale, SyncEvent, NoOpSyncEngine, SyncEngine,
} from '@soostori/contracts'
```

Or via `@soostori/core` (re-exported in `0.1.0-alpha.9+`).

## Status

Cycle 04 Sub-cycle A — `0.1.0-alpha.1`. Types-only. No engine implementation.
