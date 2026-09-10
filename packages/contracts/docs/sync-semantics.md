# Sync & Event Semantics — Soostori Canonical Contract

> Cycle 04 Sub-cycle A — source of truth for cross-platform sync.
> Implements the brief's §6 (`SyncEvent identity, idempotency, ordering, server timestamps, retry, conflict-resolution principles`).

The full sync **engine** is **NOT** shipped in Cycle 04. This document defines the
contract + conflict-resolution principles, plus the `NoOpSyncEngine` stub
sub-cycle E and F will consume. The real engine is built in a later cycle.

---

## 1. SyncEvent shape

```typescript
interface SyncEvent {
  id: SyncEventId              // UUIDv7 — time-ordered
  idempotencyKey: IdempotencyKey
  businessId: BusinessId       // every event is tenant-scoped (§7)
  entityKind: EntityKind       // one of 22 canonical entities
  entityId: string             // row the event applies to
  operation: 'create' | 'update' | 'delete' | 'tombstone'
  originatingDeviceId: DeviceId
  originatingEmployeeId: EmployeeId
  clientSequence: number       // per-device monotonic
  clientCreatedAt: ISO8601
  serverReceivedAt?: ISO8601   // cloud-set on commit
  entityVersion: number        // for last-writer-wins
  payload: Record<string, unknown>
  correlationId?: SyncEventId  // for compensating ops
  state: 'pending' | 'acked' | 'rejected' | 'replayed'
}
```

---

## 2. Field semantics

| Field | Semantics | Vision § |
|------|-----------|----------|
| `id` | UUIDv7 so consumers sort by `(id)` to recover origin order. | §6 (sync ordering) |
| `idempotencyKey` | Per `(deviceId, employeeId, op, target)` — guarantees dedup on replay. | §6 (replay & dedup) |
| `businessId` | Tenant scoping for every event. Sub-cycle B/C/D all MUST filter by this. | §7 (business isolation) |
| `entityKind` + `entityId` | Identifies the row mutated. | §6 |
| `operation='tombstone'` | Logical delete — see §4. | §6 (cascade deletes) |
| `originatingDeviceId` | Source of truth for stock authority on Primary Device (§12). | §12 |
| `originatingEmployeeId` | Audit / RBAC tie-back. | §10 |
| `clientSequence` | Per-device monotonic; reset only on device reset. | §6 (ordering) |
| `clientCreatedAt` | Originator wall-clock when the mutation happened. | §6 |
| `serverReceivedAt` | Cloud wall-clock on commit; the global ordering key. | §6 |
| `entityVersion` | Entity-level version for last-writer-wins. | §15 §16 §36 |
| `payload` | Opaque projection of the entity at write time. | §6 |
| `correlationId` | Points at a prior event this one compensates. | §6 |
| `state` | Lifecycle of the event itself. | §6 |

---

## 3. Conflict resolution principles

The brief lists six conflict-resolution principles. Each maps to specific
`SyncEvent` fields above.

### 3.1 Inventory authority — **Primary Device (§12)**

**Rule**: For each business, exactly **one** device is the stock-authoritative
node (the "Primary Device", identified by `Device.isLanHost === true` on a desktop).
Other devices post `StockMovement` events; the Primary Device applies them
in `clientSequence` order.

**Implementation in the contract**:
- Originators of stock-affecting ops (sale, openingStock, transfer, …) generate
  a `stockMovement` SyncEvent — never mutate `Product.currentStock` directly.
- The Primary Device reads these events; for conflicting `productId + quantity`
  before sync completes, the Primary Device's applied sequence wins; the other
  event is `replayed` (§3.4).

### 3.2 Entity fields — **last-writer-wins on `entityVersion`**

**Rule**: For non-inventory entities (Product.name, Customer.phone, Business.taxRate, …):
- If remote `entityVersion > local.entityVersion`: replace local with `payload`.
- If versions are equal but content differs: log conflict, preserve both, surface
  a manual merge path (out of scope for the contract).

`SyncApplyResult.version_older` covers the rejection path.

### 3.3 Cascade deletes — **tombstones**

**Rule**: Hard deletes never happen on cross-platform sync. Deletions are emitted
as `SyncEvent { operation: 'tombstone' }`. Consumers treat the entity as deleted
without removing the local row for `N` days after tombstone acknowledgement
(`N` to be set per platform — default 7).

`SyncApplyResult.applied` with payload = null signals tombstone applied locally.

### 3.4 Replay & dedup — **idempotencyKey**

**Rule**: Events with the same `idempotencyKey` MUST be no-ops on re-apply.
SDK provides `applySyncEvent(local, event) → SyncApplyResult`.

`SyncApplyResult.no_op` is the contract shape; it returns when the local row's
`version` already matches `event.entityVersion` or when `idempotencyKey` matches
a prior applied event stored in the local log.

### 3.5 Ordering — **`(serverReceivedAt, originatingDeviceId, clientSequence)`**

**Rule**: The canonical application order is the tuple
`(serverReceivedAt, originatingDeviceId, clientSequence)`. Local consumers MUST
apply events in this order.

When `serverReceivedAt` is absent (e.g. before commit), the originator applies
its own events in `clientSequence` order and only ascends after commit lands.

### 3.6 Retry — **idempotent re-issue**

**Rule**: Retries use the **same** `id` (and `idempotencyKey`). The cloud MUST
dedup at storage, so a retry is a no-op at the data layer; the event moves
`pending → acked` once acknowledged.

The contract exposes `SyncEngine.enqueue` returning `{state: 'queued' | 'acked' | 'rejected'}`.
A consumer treats `acked` as terminal-success.

---

## 4. Primary Device authority — concrete rule (§12)

| Entity / field | Authority | Reason |
|---|---|---|
| `Product.currentStock` | Primary Device only | Stock §11 §12 |
| `Product.{name, sku, barcode, …}` | Last-writer-wins | §3.2 |
| `Category.*` | Last-writer-wins | §3.2 |
| `Customer.*` | Last-writer-wins | §3.2 |
| `Sale.*` | Last-writer-wins (status drives it) | §16 |
| `Debt.balance` | Primary Device | Composed from StockMovement-like ledger; §18 §40 |
| `DebtPayment.*` | Last-writer-wins (per-employee) | §18 |
| `StockMovement.*` | Append-only — never overwritten | §11 |

Concrete detection: the Primary Device for a `BusinessId` is the unique
`Device` with `isLanHost=true AND status='authorized'` for that business.
If none exists, the business is not yet operational at inventory level.

---

## 5. State machine of a SyncEvent

```
            enqueue
              │
              ▼
         ┌──────────┐  cloud ack (serverReceivedAt set)
         │ pending  │ ─────────────────────────────► acked
         └──────────┘                                  │
              │ cloud reject (validation/scope)         │ replay on reconnect
              ▼                                         ▼
         ┌──────────┐                             ┌──────────┐
         │ rejected │                             │ replayed │ ──► back to pending
         └──────────┘                             └──────────┘
```

- `pending` → `acked`  : cloud committed the event.
- `pending` → `rejected` : cloud rejected (consumer must drop).
- `acked`  → `replayed` : connection dropped after ack; consumer re-issued, got back its own id (idempotent at cloud).
- `replayed` → `pending` : re-queued for retry.

---

## 6. Cursor

```typescript
interface SyncCursor {
  cursorId: SyncCursorId
  deviceId: DeviceId
  businessId: BusinessId
  lastServerReceivedAt?: ISO8601 | null
  lastOriginatingDeviceId?: DeviceId | null
  lastClientSequence?: number | null
  lastSyncAt: ISO8601
}
```

`SyncEngine.pull(cursor)` returns events whose `(serverReceivedAt, originatingDeviceId, clientSequence)` is **strictly greater** than the cursor's tuple. The consumer updates the cursor to the largest tuple it actually applied.

---

## 7. What is NOT in this contract (deferred)

- The actual HTTP/transport layer (FIDScript transact calls).
- The actual `SyncEngine` implementation (`NoOpSyncEngine` is the stub).
- The `N` days for tombstone retention — platform-local configuration.
- Manual merge UI for equal-version conflicts.

These belong to Sub-cycle F (production smoke) and beyond.
