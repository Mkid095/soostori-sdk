# @soostori/storage

Local persistence abstraction. Keeps Soostori SDK SQLite-agnostic.

## Why abstract storage?

The SDK should not bind every domain package to `better-sqlite3`, `expo-sqlite`, or `IndexedDB`. Each platform provides its own `Repository<T>` implementation.

```
@soostori/products
   ├── types
   ├── ProductRepository (interface)
   └── ProductService (business logic + events)
            │
            ▼
   Desktop: SqliteProductRepository  (better-sqlite3)
   Mobile: ExpoSqliteProductRepository  (expo-sqlite)
   Web:    IndexedDbProductRepository  (IndexedDB)
```

## Modules

| File | Purpose |
|---|---|
| `repository.ts` | `Repository<T>` interface — CRUD + transactions |
| `queue.ts` | `OfflineQueue` — local event queue with exponential backoff |

## Why a queue?

When offline, mutations produce events. They can't be pushed to cloud until reconnection. The queue stores them locally with exponential backoff retry, idempotency dedup, and push-after-resume semantics.
