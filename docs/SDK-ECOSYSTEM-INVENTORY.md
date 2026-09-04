# Soostori SDK Ecosystem Inventory

**Date:** 2026-09-04
**Sources audited:**
- `C:\Users\Administrator\Documents\GitHub\soostori-desktop` (Electron + React)
- `C:\Users\Administrator\Documents\GitHub\soostori-mobile` (React Native + Expo)
- `C:\Users\Administrator\Documents\GitHub\soostori` (Next.js Web + Prisma backend)
- `C:\Users\Administrator\Documents\GitHub\soostori-sdk` (the SDK being built)

---

## 1. Executive Summary

**Three apps + one backend currently exist.** All four contain duplicated business logic: auth, products, inventory, sales, customers, debts, expenses, devices, subscriptions, sync. The 22 SDK packages built so far form a partial canonical core but several domains still have duplicate implementations across apps.

**Critical finding:** The Web app (Prisma backend + Next.js) has its own auth, devices, sales, subscriptions implementations and is actually the Soostori commercial platform with salesperson/influencer/commission concepts that the SDK does NOT cover yet. This is the missing layer.

**Decision matrix:** See `SDK-PACKAGE-DECISION-MATRIX.md` for the authoritative final architecture. The target is **27 public NPM packages + 6 internal = 33 total workspace packages**.

---

## 2. Current Package Inventory (22 packages)

| # | Package | Dir | Purpose | Status |
|---|---------|-----|---------|--------|
| 1 | `@soostori/core` | `packages/core` | Branded IDs, types, validation, errors, constants | ✅ |
| 2 | `@soostori/events` | `packages/events` | Canonical event catalog, envelope, payload types | ✅ |
| 3 | `@soostori/schema` | `packages/schema` | Cloud entity definitions, migrations | ✅ |
| 4 | `@soostori/auth` | `packages/auth` | Identity chain, RBAC, sessions | ✅ |
| 5 | `@soostori/storage` | `packages/storage` | Repository abstraction, offline queue | ✅ |
| 6 | `@soostori/devices` | `packages/devices` | Device identity, PrimaryDevice coordinator | ✅ |
| 7 | `@soostori/offline` | `packages/offline` | 3-day offline policy | ✅ |
| 8 | `@soostori/audit` | `packages/audit` | Immutable audit log | ✅ |
| 9 | `@soostori/notifications` | `packages/notifications` | Event → channel dispatcher | ✅ |
| 10 | `@soostori/lan` | `packages/lan` | LAN discovery + WebSocket | ✅ |
| 11 | `@soostori/sync` | `packages/sync` | SyncEngine, conflict, queue | ✅ |
| 12 | `@soostori/subscription` | `packages/subscription` | Plans + entitlements + grace | ✅ |
| 13 | `@soostori/payments` | `packages/payments` | Provider abstraction | ✅ |
| 14 | `@soostori/tuma` | `packages/tuma` | Tuma M-Pesa impl | ⚠️ demote to internal |
| 15 | `@soostori/whatsapp` | `packages/whatsapp` | Evolution API + channel | ✅ |
| 16 | `@soostori/cloud` | `packages/cloud` | FIDScript REST client | ✅ |
| 17 | `@soostori/products` | `packages/business/products` | Product domain | ✅ |
| 18 | `@soostori/sales` | `packages/business/sales` | Sales state machine | ✅ |
| 19 | `@soostori/customers` | `packages/business/customers` | Customer domain | ✅ |
| 20 | `@soostori/debts` | `packages/business/debts` | Debt domain | ✅ |
| 21 | `@soostori/business` | `packages/business` | Person → Business → Membership | ✅ |
| 22 | `@soostori/inventory` | `packages/inventory` | Stock movement ledger | ✅ |

**Plus 1 internal:** `@soostori/contract-tests`

**Total: 23 workspace packages (22 public SDK + 1 internal test)**

---

## 3. Capability Matrix Across Three Apps

| Capability | Desktop | Mobile | Web | Existing SDK | Missing SDK | Platform-specific? |
|-----------|---------|--------|-----|-------------|-------------|------------------|
| Authentication | ✅ | ✅ | ✅ | `@soostori/auth` | — | No |
| Users/employees | ✅ | ✅ | ✅ | partial | SPM (Web) | No |
| Roles / RBAC | ✅ | ✅ | ✅ | `@soostori/auth` | — | No |
| Businesses | partial | partial | ✅ full | `@soostori/business` | — | No |
| Shops | ✅ | ✅ | ✅ | `@soostori/business` | — | No |
| Invitations | ✅ | ✅ | ✅ | partial in auth | — | No |
| Devices | ✅ | ✅ | ✅ | `@soostori/devices` | — | No |
| Primary device election | ✅ | ✅ | N/A | `@soostori/devices` | — | Desktop/Mobile |
| Products | ✅ | ✅ | ✅ | `@soostori/products` | — | No |
| Stock movements | ✅ | ✅ | ✅ | `@soostori/inventory` | — | No |
| Sales (POS) | ✅ | ✅ | ✅ | `@soostori/sales` | — | No |
| Returns / Refunds | partial | partial | ✅ | **absorb into sales** | — | No |
| Customer credit / Debts | ✅ | ✅ | ✅ | `@soostori/debts` | — | No |
| Customers | ✅ | ✅ | ✅ | `@soostori/customers` | — | No |
| Expenses | ✅ | ✅ | ✅ | **None** | `@soostori/expenses` | No |
| Suppliers | ✅ | ✅ | ✅ | **merge into inventory** | — | No |
| Receipts | ✅ printer | N/A digital | ✅ | **None** | `@soostori/receipts` (contract) | Desktop only for printing |
| Reports | ✅ | ✅ | ✅ | **None** | `@soostori/reports` (read-only) | No |
| Notifications | ✅ | ✅ | ✅ | `@soostori/notifications` | — | No |
| WhatsApp | ✅ | ❌ | ✅ | `@soostori/whatsapp` | — | No |
| Subscriptions | ✅ | ✅ | ✅ | `@soostori/subscription` | — | No |
| LAN sync | ✅ | ✅ | N/A | `@soostori/lan` | — | Desktop/Mobile |
| Cloud sync | ✅ | ✅ | ✅ | `@soostori/sync` | — | No |
| Offline mode | ✅ | ✅ | N/A | `@soostori/offline` | — | Desktop/Mobile |
| Salesperson onboarding | ❌ | ❌ | ✅ | **None** | `@soostori/partners` | No |
| Influencer program | ❌ | ❌ | ✅ | **None** | `@soostori/partners` | No |
| Commissions | ❌ | ❌ | ✅ | **None** | `@soostori/commissions` (internal) | No |
| Attribution | ❌ | ❌ | ✅ | **None** | `@soostori/attribution` (internal) | No |
| M-Pesa (Tuma) | ✅ | ❌ | ✅ | `@soostori/tuma` (internal) | — | No |
| M-Pesa (Payhero) | ❌ | ❌ | ✅ | **None** | `@soostori/payhero` (internal) | No |
| Receipt printing | ✅ ESC/POS | ❌ | ✅ | None — platform | Desktop hardware | Desktop only |
| Hardware integrations | ✅ | ❌ | ❌ | None — platform | Desktop hardware | Desktop only |
| Settings UI | ✅ | ✅ | ✅ | Application-specific | — | Yes |
| i18n | ✅ EN+SW | ✅ EN+SW | ✅ EN+SW | **SKIP — not SDK** | — | Application-specific |

---

## 4. Missing SDKs (Priority List)

| Missing SDK | Priority | Reason | Resolution |
|------------|----------|--------|------------|
| `@soostori/partners` | **P0** | Salesperson/influencer/partner CRUD | **PUBLIC** |
| `@soostori/commissions` | P0 | Commission rules + ledger | **INTERNAL initially** |
| `@soostori/attribution` | P0 | Referral chain | **INTERNAL initially** |
| `@soostori/expenses` | **P1** | Cross-cut finance domain | **PUBLIC** |
| `@soostori/receipts` | **P1** | Receipt contract (rendering stays platform) | **PUBLIC** (contract only) |
| `@soostori/reports` | **P1** | Read-only query layer over domain repos | **PUBLIC** (no reverse deps) |
| `@soostori/payhero` | **P2** | Payhero provider adapter | **INTERNAL** adapter |
| `@soostori/desktop-adapter` | **P1** | Foundation for Phase 9.1 | **INTERNAL workspace only** |
| `@soostori/mobile-adapter` | **P2** | Mobile integration | **INTERNAL workspace only** |
| `@soostori/web-adapter` | **P3** | Web server integration | **INTERNAL workspace only** |

---

## 5. Critical Architectural Findings

### Finding 1: Commercial / Partner Platform gap

The current 22 SDK packages cover **Product A (Business Platform)** — shop POS. They do NOT cover **Product B (Partner Platform)** — the salesperson/influencer/commission system that lives in Web.

### Finding 2: Three apps + one backend (not three)

There are FOUR codebases:
- Desktop (Electron + React, SQLite)
- Mobile (React Native + Expo-SQLite)
- **Web (Next.js + Prisma + PostgreSQL)**
- SDK (22 packages)

### Finding 3: Web app is the most complete commercial implementation

The Web currently has:
- 50+ feature components
- Salesperson onboarding with M-Pesa/ID verification
- Influencer referral chain
- Commission calculation ledger
- Multi-business multi-tenant architecture
- Subscription/billing via Payhero
- Risk scoring service

### Finding 4: Mobile closest to Desktop

Mobile uses the same SQLite + Expo-SQLite stack. Shared adapter likely.

### Finding 5: Hardware only on Desktop

Receipt printers, cash drawers, customer displays, weighing scales — stay platform-specific.

### Finding 6: Critical principle

> **A capability may be a domain/module without being a public NPM package. Public NPM status requires an independently stable, reusable external contract.**

This principle keeps Soostori from recreating the "one feature = one package" problem.

---

## 6. Final Package Target (Summary)

**See `SDK-PACKAGE-DECISION-MATRIX.md` for full reasoning.**

```
Foundation (4):       core, events, schema, storage
Identity & Org (3):   auth, business, devices
Domain Commerce (8): products, sales (absorbs returns),
                      inventory (absorbs suppliers),
                      customers, debts, expenses (NEW),
                      notifications, audit
Commercial (5):     subscriptions, partners (NEW), commissions (NEW),
                      attribution (NEW), reports (NEW)
Receipts (1):        receipts (NEW — contract + validator)
Communication (1):   whatsapp
Infrastructure (4):  sync, offline, lan, cloud
Payments (1):        payments (provider-neutral abstraction)

Public NPM:           27 packages
Internal workspace:   6 packages
   - 2 provider adapters (tuma, payhero)
   - 3 platform adapters (desktop, mobile, web)
   - 1 contract-tests
Grand total:         33 workspace packages
```

### Net change from current state

```
Current public:                22 packages
Demote tuma:                    -1
Merge errors into core:          0 (already planned)
Refactor existing:              0 net (errors/returns/suppliers all absorbed)
Add new public packages:        +6
New public total:                27
```

---

## 7. Dependency Direction Rules

**Allowed:**

```
core        ← events, storage, schema, everything
events      ← domain packages
storage     ← domain packages
schema      ← domain packages
auth        ← business, devices
business    ← devices, sales
devices     ← lan, sync
products    ← sales, inventory
sales       ← customers, debts, inventory, commissions
inventory   ← debts (stock movements)
customers   ← debts
debts        ← (leaf)
expenses     ← (leaf)
partners     ← commissions
commissions  ← (internal initially)
attribution  ← (internal initially)
sync         ← lan, devices
offline      ← (leaf)
lan          ← devices
cloud        ← (leaf)
subscription← (leaf)
payments     ← (tuma adapter, payhero adapter)
tuma         ← (internal, depends on payments)
payhero      ← (internal, depends on payments)
whatsapp     ← (leaf)
notifications ← audit (cross-cuts)
audit       ← (leaf)
receipts     ← sales
reports      ← (consumer only, no inbound)
contract-tests ← everything (tests only)
```

**Forbidden (enforced via ESLint + code review):**

```
domain packages → not infrastructure
domain packages → not platform adapters
domain packages → not application frameworks
domain packages → not other domain packages (except foundation + a few explicit deps)
platform adapters → not domain logic (they're storage implementations)
```

---

## 8. Migration Priorities (Revised per Matrix)

| Priority | Action | Notes |
|----------|--------|-------|
| **P0** | Phase 9.1 Desktop adapter + auth/device migration | Architecture proof |
| **P1** | Phase 9.2 Desktop commerce migration | Products/inventory/sales/customers/debts |
| **P1** | Phase 9.4 Remaining domains | Expenses, receipts, reports |
| **P1** | Build `@soostori/partners` | First commercial package, public |
| **P2** | Phase 9.3 Commercial domains (initially internal) | Attribution, commissions internal; partners public |
| **P3** | Phase 9.5 Mobile migration | |
| **P4** | Phase 9.6 Web migration | After Desktop + Mobile stable |

---

## 9. NPM Publication Sequence

**Phase A — Foundation (1 week)**

1. `@soostori/core`
2. `@soostori/storage`
3. `@soostori/events`
4. `@soostori/schema`

**Phase B — Identity & Org (1 week)**

5. `@soostori/auth`
6. `@soostori/business`
7. `@soostori/devices`

**Phase C — Domain Commerce (1-2 weeks)**

8. `@soostori/products`
9. `@soostori/inventory`
10. `@soostori/sales`
11. `@soostori/customers`
12. `@soostori/debts`
13. `@soostori/expenses`
14. `@soostori/reports`
15. `@soostori/receipts`
16. `@soostori/notifications`
17. `@soostori/audit`

**Phase D — Commercial (1-2 weeks)**

18. `@soostori/subscription` (reclassify from infra to commercial)
19. `@soostori/partners`

**Phase E — Infrastructure (1 week)**

20. `@soostori/offline`
21. `@soostori/lan`
22. `@soostori/sync`
23. `@soostori/cloud`
24. `@soostori/payments`

**Phase F — Communication (1 day)**

25. `@soostori/whatsapp`

**Phase G — Meta-package**

26. `@soostori/sdk`

**Not published (internal only):**

- `@soostori/desktop-adapter`
- `@soostori/mobile-adapter`
- `@soostori/web-adapter`
- `@soostori/tuma` (demoted)
- `@soostori/payhero` (new)
- `@soostori/contract-tests`

---

## 10. Recommended Next Steps

1. **Approve the corrected matrix** — 22 → 27 public NPM packages
2. Begin Phase 2 refactors (errors→core, returns→sales, suppliers→inventory)
3. Begin Phase 9.1 Desktop adapter + auth migration
4. Build commercial packages (partners public, attribution/commissions internal initially)
5. Then proceed to Phase C-F as documented

**No implementation should resume until the matrix is signed off.**
