# Soostori SDK Package Decision Matrix

**Date:** 2026-09-04
**Status:** Approved after final corrections.

---

## Executive Summary

This matrix answers one question for each capability:

> *Does this need to be a separate package, or is it part of an existing domain?*

**Critical principle:**
> **A capability may be a domain/module without being a public NPM package. Public NPM status requires an independently stable, reusable external contract.**

> **Domain boundary ≠ NPM boundary.**

---

## 1. Reconciled Package Counts

### Currently in SDK (22 packages)

```
core          events        schema        auth          storage
devices       offline       audit         notifications lan
sync          subscription  payments      tuma          whatsapp
cloud         products      sales         customers     debts
business      inventory
```

### Plus internal package (1)

```
contract-tests  (workspace only, never published)
```

### Current grand total: 23 workspace packages

### Current Target Public Package Surface

> **This is NOT FINAL.** Boundaries may shift during actual implementation. The **principles** are final, the **numbers** are an outcome.

| Layer | Public | Internal |
|-------|--------|----------|
| Foundation (4: core+errors, events, schema, storage) | 4 | 0 |
| Identity & Org (auth, business, devices) | 3 | 0 |
| Domain Commerce (8: products, sales, inventory, customers, debts, expenses, notifications, audit) | 8 | 0 |
| Commercial public (3: subscriptions, partners, reports) | 3 | 0 |
| Receipts (contract only) | 1 | 0 |
| Communication (whatsapp) | 1 | 0 |
| Payments abstraction | 1 | 0 |
| Infrastructure (4: sync, offline, lan, cloud) | 4 | 0 |
| **Current public target** | **25** | **0** |
| Internal commercial (commissions, attribution) | 0 | 2 |
| Internal provider adapters (tuma, payhero) | 0 | 2 |
| Internal platform adapters (desktop, mobile, web) | 0 | 3 |
| Internal tests (contract-tests) | 0 | 1 |
| **Current internal target** | **0** | **8** |
| **CURRENT TOTAL** | **25** | **8** = **33 packages** |

### Arithmetic reconciliation

```
Existing public SDK packages:                       22
Demote tuma to internal:                            -1
                                                    ───
Existing public after reclassification:             21

New public packages:
  expenses                                            +1
  receipts                                            +1
  reports                                             +1
  partners                                            +1
                                                    ───
New public total:                                    +4

CURRENT PUBLIC TARGET:                             25
```

```
Existing internal packages:
  contract-tests                                       1

New internal packages:
  commissions                                         1
  attribution                                         1
  payhero                                             1
  desktop-adapter                                     1
  mobile-adapter                                      1
  web-adapter                                         1
                                                     ───
New internal total:                                  6
Plus existing internal:                              1

CURRENT INTERNAL TARGET:                            8
```

**Total: 25 public + 8 internal = 33 workspace packages.**

### Skip these entirely from public (initially)

- `@soostori/commissions` → INTERNAL commercial package initially
- `@soostori/attribution` → INTERNAL commercial package initially

These stay internal until external developers actually need them. The monorepo can have internal domain packages that are not public.

---

## 2. Public NPM vs Internal Workspace vs Server-Only

Before any package is published, classify it.

### Public NPM

Consumed by application developers outside the Soostori codebase.

### Internal Workspace

Used only inside the monorepo build. Never published.

### Platform Adapter

Specific to Desktop / Mobile / Web. **Default: internal workspace package, never published.**

### Application

React pages, screens, routing. Not SDK.

---

## 3. The Decision Matrix

For every capability, evaluate against the same criteria:

| Criterion | Question |
|-----------|----------|
| Independent contract | Does it have its own public types/API? |
| Independent state | Does it have its own DB tables / domain entities? |
| Independent consumers | Do separate packages need to depend on it? |
| Reduced coupling | Would splitting it reduce import dependencies? |
| Lifecycle independence | Does it need to evolve separately? |
| Versioning independence | Does it need its own semver? |
| **Public NPM candidate** | Does it have an independently stable, reusable external contract? |

**Answer "yes" to most criteria → separate package.**
**Answer "yes" only to "independent consumers" → MODULE inside another package.**
**Public NPM status requires a stable reusable contract.**

---

## 4. Per-Capability Decision

### Already-built packages

| Capability | Package | Verdict | Action |
|-----------|----------|---------|--------|
| Branded IDs, types, validation | `@soostori/core` | KEEP | Public NPM |
| Event catalog, envelope | `@soostori/events` | KEEP | Public NPM |
| Cloud entity definitions | `@soostori/schema` | KEEP | Public NPM |
| Identity chain, RBAC | `@soostori/auth` | KEEP | Public NPM |
| Repository, offline queue | `@soostori/storage` | KEEP | Public NPM |
| Device identity, PrimaryDevice | `@soostori/devices` | KEEP | Public NPM |
| 3-day policy | `@soostori/offline` | KEEP | Public NPM |
| Audit log | `@soostori/audit` | KEEP | Public NPM |
| Notifications dispatcher | `@soostori/notifications` | KEEP | Public NPM |
| LAN discovery + WebSocket | `@soostori/lan` | KEEP | Public NPM |
| Sync engine, conflict | `@soostori/sync` | KEEP | Public NPM |
| Subscription entitlement | `@soostori/subscription` | KEEP | RECLASSIFY → commercial |
| Payments abstraction | `@soostori/payments` | KEEP | Public NPM |
| Tuma M-Pesa impl | `@soostori/tuma` | **DEMOTE** | Internal workspace |
| WhatsApp client | `@soostori/whatsapp` | KEEP | Public NPM |
| FIDScript REST client | `@soostori/cloud` | KEEP | Public NPM |
| Products | `@soostori/products` | KEEP | Public NPM |
| Sales state machine | `@soostori/sales` | KEEP | Public NPM |
| Customers | `@soostori/customers` | KEEP | Public NPM |
| Debts | `@soostori/debts` | KEEP | Public NPM |
| Business / Membership | `@soostori/business` | KEEP | Public NPM |
| Stock movement ledger | `@soostori/inventory` | KEEP | Public NPM |
| Cross-platform contracts | `@soostori/contract-tests` | KEEP | Internal only |

### Proposed new packages (re-evaluated)

| Capability | Proposed Name | Verdict | Reason | Final Decision |
|-----------|---------------|---------|--------|----------------|
| Errors (shared hierarchy) | `@soostori/errors` | **MERGE into core** | Errors are tightly coupled to types. Independent package adds friction. | MERGE |
| Returns / Refunds | `@soostori/returns` | **MERGE into sales** | Returns are part of sale lifecycle. They share `SaleId`, `IdempotencyKey`, ledger. | MERGE |
| Receipts (contract) | `@soostori/receipts` | **KEEP separate** (contract only) | Receipt is a domain object with its own data contract. Rendering stays platform-specific. | **PUBLIC NPM** — but only contract, not formatting |
| Reports | `@soostori/reports` | **CREATE — read-only, typed** | Reports are derived views, not state mutations. | **PUBLIC NPM** |
| Salesperson/Influencer/Commission/Attribution | `@soostori/spm` → SPLIT | **See §6** | SPM is too narrow a name | SPLIT: `partners` PUBLIC, `commissions` + `attribution` INTERNAL initially |
| Suppliers | `@soostori/suppliers` | **MERGE INTO inventory** | Suppliers relate to POs and stock receiving | Put in `@soostori/inventory` |
| Expenses | `@soostori/expenses` | **CREATE** | Expenses cross-cut finance (separate from sales/operations) | PUBLIC NPM |
| Payhero | `@soostori/payhero` | **INTERNAL ADAPTER** | Provider-specific, tightly coupled to OAuth flow | Workspace only, never published |
| Desktop adapter | `@soostori/desktop-adapter` | **CREATE — INTERNAL** | Desktop-specific persistence/IPC/LAN/hardware | Workspace package, never published |
| Mobile adapter | `@soostori/mobile-adapter` | **CREATE — INTERNAL** | Mobile-specific | Workspace package, never published |
| Web adapter | `@soostori/web-adapter` | **CREATE — INTERNAL** | Web has server backend, not just an adapter | Workspace package, never published |
| Promotions | (later) | DEFER | Not required for Phase 9 | Defer to future |
| i18n | `@soostori/i18n` | **SKIP entirely** | Translations are application presentation concerns | Do not create |

### Skip these entirely

| Capability | Decision |
|-----------|----------|
| `@soostori/i18n` | SKIP — translations are presentation, not business logic |
| `@soostori/cloud` standalone expansion | Keep current scope — FIDScript REST client |
| `@soostori/notifications` channels beyond in-app/whatsapp/push | Each new channel is internal adapter |

---

## 5. Payments Architecture Review

### The problem with the current API

```ts
stkPush
createSale
createInvoice
```

This describes provider-specific workflows, not provider-neutral payment semantics.

### Revised contract

```ts
@soostori/payments
  createPayment
  authorize
  capture
  cancel
  refund
  getPayment
```

With provider capabilities:

```ts
type PaymentCapabilities = {
  STK_PUSH: boolean
  CARD: boolean
  BANK_TRANSFER: boolean
  MOBILE_MONEY: boolean
  WEBHOOKS: boolean
  REFUNDS: boolean
}
```

### Architecture

```
@soostori/payments        ← PUBLIC NPM (provider-neutral abstraction)
        │
        ├── Tuma adapter        ← INTERNAL workspace package
        ├── Payhero adapter     ← INTERNAL workspace package — NEW
        └── Stripe adapter      ← FUTURE, internal
```

### Critical rule

> **Tuma and Payhero must not leak provider-specific terminology into the public abstraction.**

---

## 6. SPM Decomposition — Revised Classification

### Domain decomposition

```
Partner
  ├── Salesperson
  ├── Influencer
  └── Other partner types
       ↓
Onboarding (M-Pesa / KYC)
       ↓
Attribution (referral chain, conversion)
       ↓
Conversion event (Person → Customer)
       ↓
Sale (in @soostori/sales)
       ↓
Commission event
       ↓
Settlement (payout to partner)
```

### Package classification

```
@soostori/partners       PUBLIC NPM (salesperson + influencer + partner CRUD)
                         (because external app developers may onboard partners)
```

```
@soostori/attribution    INTERNAL workspace package initially
                         (because cross-app attribution analysis is not yet a
                          real external use case — only Soostori needs it)
                         (promote to public later if needed)
```

```
@soostori/commissions    INTERNAL workspace package initially
                         (because commission rules are highly proprietary
                          financial logic — should not be public surface)
                         (promote to public later if needed)
```

### Anti-cycle rule

> **Sales must never import the commission engine.**
> **Attribution must never import the commission engine.**

Commission calculation subscribes to canonical sales events/contracts.

```
sales → events
commissions → events
attribution → events

sales MUST NOT import commissions or attribution.
```

The DAG is preserved by:
- Sales emits canonical events (`sale.confirmed`, `sale.refunded`, `sale.completed`)
- Commissions and attribution subscribe to those events
- Neither creates a reverse dependency into sales

---

## 7. Reports Architecture Review

### The rejected pattern (string-based queries)

```ts
ReportsService.query("daily_sales", { range, shopId })
```

A typo `"daily_sale"` becomes a runtime problem.

### Correct pattern: typed report contract

```ts
type ReportQuery =
  | {
      type: "daily_sales"
      range: DateRange
      shopId: ShopId
    }
  | {
      type: "inventory_valuation"
      shopId: ShopId
    }
  | {
      type: "profit_loss"
      range: DateRange
      shopId: ShopId
    }
  | {
      type: "debt_aging"
      shopId: ShopId
      asOf: Date
    }

ReportsService.query(query: ReportQuery): Promise<ReportResult>
```

This keeps reports consistent with the typed-canonical-SDK philosophy.

### Architectural rule

```ts
Domain packages MUST NOT import reports
```

Reports is a **consumer of domain contracts**, not something that domains register into.

```
sales
inventory
expenses
debts
payments
    ↓
reports          ← consumes domain contracts (queries/repositories)
    ↓
application
```

---

## 8. Receipts Architecture Review (simplified)

### Simplified public API

```ts
@soostori/receipts
  Receipt          (canonical receipt document)
  ReceiptItem
  ReceiptTotals
  ReceiptMetadata
  ReceiptValidator  (checksum/integrity check)
```

No formatter in the public package. No formatters should leak into the Soostori SDK.

### Rendering stays platform-specific

```
@soostori/receipts (contract)
       ↓
Desktop adapter → ESC/POS printer
Mobile adapter  → shareable document (PDF/image)
Web adapter     → HTML/PDF
```

The contract is canonical. The rendering is per-platform.

---

## 9. Suppliers — Definitive Assignment

Suppliers go to **`@soostori/inventory`** (decisively).

Because:

1. Suppliers relate to purchase orders
2. Suppliers relate to goods received (inventory movements)
3. Suppliers drive cost prices
4. Inventory is where procurement lives

```
inventory
├── stock
├── movements
├── purchasing
├── purchase orders
├── receiving
└── suppliers    ← merged here
```

`business` package remains about **organization structure** (Person → Business → Membership → Location), not procurement.

---

## 10. Subscription — Reclassified

Subscription is **commercial**, not infrastructure.

### New classification

```
Commercial
└── subscription
```

Reason: subscription is financial/entitlement logic with direct business impact.

---

## 11. `business` Does NOT Depend on `auth`

The dependency graph currently says:

```
auth ← business, devices
```

But `business` package semantically represents organization structure:

```
business = Person → Business → Membership → Location
auth     = identity + RBAC + sessions
```

These are independent. A Business entity should exist independently of authentication mechanism.

```
core
 ├── auth       (independent)
 │
 └── business   (independent)
```

Application-level orchestration combines them.

The dependency graph explicitly prohibits:

```
sales → commissions    ❌
sales → attribution    ❌
business → auth        ❌
business → sales      ❌
```

The DAG is preserved by event subscriptions (`commissions`, `attribution`, `reports` consume canonical events; they don't import domain packages).

---

## 12. SDK Dependency Graph (DAG, not Tree)

This is a **dependency graph**, not an inheritance tree.

```
                       core
                  /      |      \
                 /       |       \
             events   storage   schema
                │        │        │
        ┌───────┼────────┼────────┐
        ↓       ↓        ↓        ↓
      auth   business  devices  cloud
        │       │        │
        └───────┼────────┘
                ↓
       domain commerce packages
   ┌─────────┬─────────┬─────────┬─────────┐
   ↓         ↓         ↓         ↓         ↓
products  inventory   sales    customers  debts
                          │
                          ↓
                  commercial layer
        ┌─────────────┬─────────┬──────────┐
        ↓             ↓         ↓          ↓
     partners    attribution commissions subscriptions
```

### Forbidden dependencies

**Domain packages MUST NOT depend on:**

- `@soostori/desktop-adapter`, `mobile-adapter`, `web-adapter`
- `@soostori/tuma`, `@soostori/payhero`
- `electron`, `react`, `react-native`, `expo`, `next`
- `@prisma/client`, `prisma`, `better-sqlite3`, `expo-sqlite`
- Browser APIs (`window`, `document`, `localStorage`), Native APIs
- UI component libraries, routing frameworks, application state-management libs

**No domain package may import from an application package.**

### Anti-cycle rules (explicit)

```
sales MUST NOT import commissions
sales MUST NOT import attribution
business MUST NOT import auth
business MUST NOT import sales

commissions consumes sales events
attribution consumes sales events
reports consumes domain contracts
```

### Platform adapter rule (precise)

> **Platform adapters MAY contain platform integration logic but MUST NOT contain canonical business rules already owned by the SDK domain packages.**

So:
- Desktop adapter can contain: SQLite, Electron IPC, LAN transport, printer, cash drawer, customer display, barcode scanner, scale
- Desktop adapter CANNOT contain: sale validation, stock authorization, subscription checks, customer business rules

---

## 13. `storage` vs `offline` Boundary

Distinct concerns:

```
storage
  └── repository primitives
      and offline queue mechanism

offline
  └── offline business/policy behavior
```

Example:

```ts
storage.queue(...)        ← provides primitive
offline.canOperate(...)    ← decides business policy
```

This prevents these packages from eventually becoming duplicates.

---

## 14. `schema` vs `cloud` Boundary

```
@soostori/schema     → canonical Soostori business entities (what data means)
@soostori/cloud      → FIDScript REST representation (how data is transported/stored)
```

If `@soostori/schema` contains FIDScript-specific details, it isn't really a neutral foundation.

**schema = what the business data means**

**cloud = how FIDScript transports/stores it**

This keeps the SDK portable.

---

## 15. Behavioral Invariants (Critical Path Coverage)

These are more important than "100% code coverage."

### Auth
- Unauthorized operations rejected
- RBAC permissions enforced on every sensitive operation
- Device authorization checked before any per-device operation

### Inventory
- **Ledger integrity**: sum of movements = current balance
- **Idempotency**: same idempotencyKey applied twice = no double-decrement
- Negative balances rejected
- Atomic: balance update + movement record are one transaction

### Sales
- Valid state transitions only (PENDING → CONFIRMED, CONFIRMED → REFUNDED)
- Refund decrements payment total correctly
- Refund restores stock
- Sale without stock rejected (if Primary available)
- Sale without Primary (STALE/LOST) is blocked

### Sync
- Deterministic replay — same movements = same state
- IdempotencyKey deduplication works
- **STALE Primary cannot authorize stock ops** (regression invariant)
- LOST Primary blocks ops
- UNKNOWN Primary blocks ops
- REVOKED device cannot join LAN

### Subscriptions
- Entitlement enforced before any paid feature
- Grace period blocks write operations, allows read
- Cache invalidates on status change

### Audit
- Immutable log
- Replayable
- Every sensitive operation captured

### Cross-platform invariant

> **The same domain command/event sequence produces the same business result on Desktop, Mobile, and Web.**

### Persistence invariant

> **A persistence adapter may change storage technology, but must not change domain behavior.**

---

## 16. Migration Plan

### Phase 9.0 — Architecture stabilization

- Confirm package counts (25 public, 8 internal, 33 total)
- Final dependency graph
- Final public/internal classification
- Final contracts

### Phase 9.1 — Desktop adapter + auth/device/storage migration

Build `@soostori/desktop-adapter` and migrate auth, devices, storage.

### Phase 9.2 — Desktop commerce migration

Migrate products, inventory, sales, customers, debts.

### Phase 9.2 Exit Gate — Desktop deterministic proof

Run the complete scenario:

```
Create product → Receive stock → Sell 2 units →
Create customer debt → Sync → Refund →
Verify inventory → Verify sale → Verify debt → Verify audit
```

Against:
- Desktop SQLite adapter
- Canonical SDK contracts

Verify deterministic business results.

**This is the FIRST proof of the architecture. Mobile does not exist yet at this gate.**

### Phase 9.3 — Commercial domains

Build/migrate:
- `partners` (PUBLIC)
- `attribution` (INITIALLY INTERNAL)
- `commissions` (INITIALLY INTERNAL)

### Phase 9.4 — Remaining domains

Build:
- `expenses`
- `receipts` (contract only)
- `reports` (typed queries)

### Phase 9.5 — Mobile

Build `@soostori/mobile-adapter` and migrate.

### Phase 9.5 Exit Gate — Cross-platform contract verification

Run the exact same scenario from Phase 9.2 against:
- Desktop SQLite
- Mobile SQLite
- Web persistence

Verify equivalent business outcomes.

### Phase 9.6 — Web

Only after Desktop + Mobile prove the SDK contracts work.

```
Prisma business logic → canonical SDK → thin API routes
```

---

## 17. Current Target Public Package Surface

> **NOT FINAL.** Boundaries may shift during actual implementation.

### Public NPM (25 packages)

```
Foundation (4):         core (errors merged in), events, schema, storage
Identity & Org (3):     auth, business, devices
Domain Commerce (8):   products, sales (absorbs returns/refunds/cancellation),
                        inventory (absorbs suppliers),
                        customers, debts, expenses (NEW),
                        notifications, audit
Commercial public (3): subscriptions (reclassified from infrastructure),
                        partners (NEW), reports (NEW)
Receipts (1):          receipts (NEW — contract + validator only)
Communication (1):     whatsapp
Payments (1):          payments (provider-neutral)
Infrastructure (4):    sync, offline, lan, cloud
```

### Internal Workspace (8 packages, NEVER published initially)

```
Internal commercial domains (initially):
  @soostori/commissions      → workspace only — financial logic stays internal
  @soostori/attribution      → workspace only — analytics stays internal

Provider adapters:
  @soostori/tuma             → demoted from public
  @soostori/payhero          → NEW, internal

Platform adapters:
  @soostori/desktop-adapter
  @soostori/mobile-adapter
  @soostori/web-adapter

Tests:
  @soostori/contract-tests
```

### Counts

| Type | Count |
|------|-------|
| **Public NPM** | **25** |
| Internal commercial domains | 2 |
| Internal provider adapters | 2 |
| Internal platform adapters | 3 |
| Internal tests | 1 |
| **Total workspace** | **33 packages** |

> **The package count is not an architectural objective.**

> The **principles** are final. The **numbers** are an outcome.

> Architecture first → Cross-platform validation → Stable public contracts → Identify genuinely reusable packages → NPM publication.

---

## 18. Exit Criteria for Approval

This matrix is considered APPROVED when:

1. ✅ All 22 current packages accounted for
2. ✅ All proposed new packages evaluated against 7-criterion matrix
3. ✅ Returns/Refunds merged into Sales with rationale
4. ✅ Receipts is contract-only (no rendering)
5. ✅ Reports has typed queries (no string-based)
6. ✅ Reports has no reverse dependencies from domains
7. ✅ Web architecture clarified (Prisma is server persistence, not adapter)
8. ✅ Payments API redesigned for provider neutrality
9. ✅ SPM decomposed: partners public, commissions/attribution internal initially
10. ✅ Suppliers definitively assigned to inventory
11. ✅ Subscription reclassified as commercial
12. ✅ Dependency graph is a DAG, not inheritance tree
13. ✅ Forbidden dependency list comprehensive
14. ✅ Behavioral invariants include cross-platform and persistence
15. ✅ Package counts consistent: 22 → 25 public + 8 internal = **33** total
16. ✅ Cross-platform contract verification split into Phase 9.2 (Desktop only) and Phase 9.5 (full cross-platform)
17. ✅ Domain packages forbidden from importing application frameworks
18. ✅ Platform adapters may contain platform integration but not business rules
19. ✅ `business` doesn't depend on `auth` (clean separation)
20. ✅ Removed "FINAL" — package surface is an outcome, not an objective
21. ✅ Anti-cycle rule: sales MUST NOT import commissions or attribution
22. ✅ Reports queries typed via discriminated union (ReportQuery)
23. ✅ `schema` vs `cloud` boundary clarified (schema = business meaning, cloud = FIDScript transport)
24. ✅ `storage` vs `offline` boundary clarified (storage = mechanism, offline = business policy)

**Status: APPROVED.**

Phase 9.1 begins with desktop-adapter scaffold.

---

*End of Package Decision Matrix v2*
