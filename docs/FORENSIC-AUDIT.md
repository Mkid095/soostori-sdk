# Soostori Forensic Audit & Canonical Reconciliation

**Date:** 2026-08-31
**Cloud App ID:** `0808ca7d-b0ba-4541-8906-48f7d0403950`

This is the foundational audit before the SDK is built. Each row identifies the canonical contract that all three applications must follow.

---

## 1. Live FIDScript Cloud Schema (Authoritative)

| Entity | Fields |
|---|---|
| `$users` (system) | email, imageURL, type |
| `companies` | id, name, slug, taxRate |
| `shops` | id, name, slug, taxRate, plan, subscriptionExpiry (string), status |
| `employees` | id, name, email, phone, role, status, permissions, createdBy, invitedBy |
| `invitations` | id, email, phone, employeeRole, status, expiresAt, createdBy |
| `devices` | id, deviceName, deviceType, status, isLanHost, authorizedAt, lastSeenAt, lastSyncAt, tokenRef |
| `deviceAuthorizations` | id, authorizedBy, tokenHash, issuedAt, expiresAt |
| `subscriptions` | id, planId, planKey, status, currentPeriodStart, currentPeriodEnd, billingCycle, amountPaid, deviceLimit |
| `plans` | id, key, name, priceMonthly, priceYearly, deviceLimit, features |
| `payments` | id, amount, currency, method, reference, status, paidAt |
| `subscriptionEvents` | id, type, details |
| `syncEvents` | id, entity, entityId, operation, payload, syncedAt |
| `syncStatus` | id, lastSyncAt, pendingEvents, deviceCount, activeDeviceCount |
| `backupSnapshots` | id, snapshotId, version, expiresAt, recordCounts, sizeBytes |

### **MISSING** in cloud (need to be added):
- `products` (operational)
- `categories` (operational)
- `productVariants` (operational)
- `customers` (operational)
- `sales` (operational)
- `saleItems` (operational)
- `inventoryTransactions` (operational)
- `expenses` (operational)
- `debts` (operational)
- `debtPayments` (operational)
- `expenseCategories` (operational)
- `shopSettings` (operational)

---

## 2. Cross-App Schema Discrepancies

### Critical type mismatches that must be resolved by SDK:

| Field | Mobile | Web | Desktop | Canonical Decision |
|---|---|---|---|---|
| `shops.subscriptionExpiry` | string | **number** | string | **string (ISO date)** — web's number was wrong |
| `devices.authorizedAt` | string | **number** | string | **string (ISO date)** |
| `devices.lastSeenAt` | string | number | string | **string (ISO date)** |
| `devices.lastSyncAt` | ❌ missing | number | ❌ missing | **string (ISO date) — required** |
| `subscriptions.planId` | ❌ missing | string | ❌ missing | **string — required (foreign key to plans.id)** |
| `subscriptions.planKey` | string | string | string | **string — keep (denormalized for fast lookup)** |
| `invitations.expiresAt` | string | **number** | string | **string (ISO date)** |
| `backupSnapshots.expiresAt` | string | **number** | string | **string (ISO date)** |
| `syncEvents.syncedAt` | string | **number** | string | **string (ISO date)** |
| `payments.paidAt` | string | **number** | string | **string (ISO date)** |

### **DECISION RULE:** All timestamp fields stored as **ISO 8601 strings** in cloud. Conversion to/from numbers happens only at the SDK boundary.

---

## 3. Authentication Identity Model

**Mobile (`@fidscript/instant-react`):**
```
db.auth.sendMagicCode({email})
db.auth.signInWithMagicCode({email, code}) → {user, session}
db.queryOnce({shops: {}})
db.transact([...])
```

**Web (`@instantdb/react`):**
```
/api/users?email=...
/api/admin/users
api.get('/api/...')
```

**Desktop (custom REST):**
```
POST /api/v1/apps/:id/auth/magic-code
POST /api/v1/apps/:id/auth/magic-code/verify → {user, session}
POST /api/v1/apps/:id/instaml/tx
POST /api/v1/apps/:id/instaql/query
```

### **Canonical identity chain (SDK):**
```
FIDScript User ($users)
    ↓
Company (companies)
    ↓
Shop (shops)
    ↓
Employee (employees)
    ↓
Device (devices)
    ↓
Authorized Session
```

The SDK exposes `auth.requestMagicCode(email)`, `auth.verifyMagicCode(email, code)`, `auth.signIn()`, `auth.signOut()`, `auth.getSession()` — all three apps use these.

**Local PIN is NOT a cloud identity.** Pin only unlocks an already-authorized employee.

---

## 4. Sync Event Contract

| Field | Mobile | Web | Desktop | Canonical |
|---|---|---|---|---|
| `id` | ✅ | ✅ | ✅ | UUID v4 |
| `entity` | ✅ | ✅ | ✅ | string (entity name) |
| `entityId` | ✅ | ✅ | ✅ | string (UUID) |
| `operation` | ✅ | ✅ | ✅ | `create` \| `update` \| `delete` |
| `payload` | ✅ (any) | ✅ (json) | ✅ (json) | **json-serializable object** |
| `syncedAt` | string | number | string | **ISO 8601 string** |
| `idempotencyKey` | ❌ missing | ❌ missing | ✅ (LAN only) | **REQUIRED — UUID v4, prevents duplicate processing** |
| `shopId` | ❌ missing | ❌ missing | ✅ (LAN only) | **REQUIRED — scopes sync to shop** |
| `deviceId` | ❌ missing | ❌ missing | ✅ (LAN only) | **REQUIRED — origin device** |

**Decision:** All sync events MUST carry `shopId`, `deviceId`, `idempotencyKey`. Mobile and Web must adopt this contract.

---

## 5. Local SQLite vs Cloud Representation

| Entity | Local SQLite | Cloud | Sync Model |
|---|---|---|---|
| products | ✅ | ❌ missing | Operational entity + sync_events replay |
| categories | ✅ | ❌ missing | Operational entity + sync_events replay |
| productVariants | ✅ | ❌ missing | Operational entity |
| inventoryTransactions | ✅ (event log) | ❌ missing | Event log (event sourcing) |
| sales | ✅ | ❌ missing | Operational entity |
| saleItems | ✅ | ❌ missing | Operational entity |
| customers | ✅ | ❌ missing | Operational entity |
| debts | ✅ | ❌ missing | Operational entity |
| debtPayments | ✅ | ❌ missing | Operational entity |
| expenses | ✅ | ❌ missing | Operational entity |
| expenseCategories | ✅ | ❌ missing | Operational entity |
| shopSettings | ✅ (key/value) | ✅ shops | Hydrate shop from cloud on snapshot |
| employees | ✅ (cached) | ✅ (authoritative) | Cloud → local pull only |
| devices | ✅ | ✅ | Local registers in cloud |
| subscriptions | ❌ | ✅ (authoritative) | Cloud-only |
| plans | ❌ | ✅ | Cloud-only |
| payments | ❌ | ✅ | Cloud-only |

### **Decision (C) Hybrid Model:**
- Cloud `products`, `sales`, `customers`, `expenses` are direct operational entities
- Inventory stock changes use `inventoryTransactions` event log (event sourcing)
- Local SQLite caches all operational data; cloud is authoritative
- Both write paths: local commits, then push to cloud
- Both read paths: cloud → snapshot → local on startup; realtime propagation while online

---

## 6. Discovery / LAN / Realtime

| Concern | Mobile | Desktop |
|---|---|---|
| LAN discovery | ❌ | ✅ UDP broadcast (port 18793) |
| WebSocket sync | ❌ | ✅ port 18792 |
| Realtime cloud | ✅ @fidscript subscriptions | ❌ (only polling) |

**Decision:** Cloud must be realtime for ALL clients (desktop must add FIDSubscription). LAN is optional optimization, not authoritative.

---

## 7. Subscription Authority

- Web: `subscriptions` + `plans` (primary)
- Mobile: `subscriptions` query in `cloudVerifyMagicCode` flow
- Desktop: `subscriptions` query, with offline cache + 3-day grace

**Decision:** `subscriptions` + `plans` are authoritative. `shops.subscriptionExpiry` is a **derived cache field** (denormalized for fast UI display). All apps MUST check `subscriptions` table.

---

## SDK Package Architecture

```
@soostori/core         — IDs, types, validation, errors
@soostori/schema       — Canonical cloud entity definitions + migrations
@soostori/auth         — Identity model + session
@soostori/cloud        — FIDScript REST transport (platform-agnostic)
@soostori/sync         — SyncEvent contract + push/pull/conflict
@soostori/subscription — Plans, entitlements, enforcement
```
