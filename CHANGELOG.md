# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0-alpha.13] — 2025-09-10 (Phase 09 Inventory SDK)
### Added
- **`InventoryService`** (`packages/inventory/src/InventoryService.ts`): `receiveStock`, `adjustStock`, `transferStock`, `countStock`, `getLowStockProducts`, `getInventoryValuation` — all stock-movement operations with businessId isolation.
- **SyncEvent emission**: `inventory.received`, `inventory.adjusted`, `inventory.transferred`, `inventory.counted` emitted via `SyncEngine.enqueue()` on every mutation.
- **`ReceiveStockInput`**, **`AdjustStockInput`**, **`TransferStockInput`**, **`StockCountInput`** interfaces.
- **`AdjustStockReason`** type: `'breakage' | 'theft' | 'correction' | 'return' | 'other'`.
- **`LowStockAlert`** interface: `productId`, `productName`, `currentStock`, `threshold`.
- **`InventoryValuationEntry`** interface: `productId`, `name`, `quantity`, `costPrice`, `value`.
- **17 tests** (`packages/inventory/test/InventoryService.test.ts`): receiveStock creates movement + updates product stock; adjustStock ± delta; adjustStock negative rejects if result < 0 (InsufficientStockError); transferStock creates from/to movements linked by referenceType=transfer; countStock creates variance adjustments, skips zero-variance; getLowStockProducts returns only quantity ≤ threshold; getInventoryValuation returns quantity × costPrice; SyncEvent emitted on each mutation; businessId isolation on all operations.

### Changed
- **`packages/inventory/src/index.ts`**: exports `InventoryService` and its input/alert types.

## [0.1.0-alpha.12] — 2025-09-10 (Phase 08 Products SDK)
### Added
- **`ProductService`** (`packages/inventory/src/ProductService.ts`): `createProduct`, `getProduct`, `listProducts`, `archiveProduct`, `adjustStock` — full product CRUD with business-scoped isolation.
- **`CategoryService`** (`packages/inventory/src/CategoryService.ts`): `createCategory`, `listCategories` — category management.
- **SyncEvent emission**: `product.created`, `product.updated`, `product.archived`, `category.created` events emitted via `SyncEngine.enqueue()` on every mutation.
- **`CreateProductInput`** interface: `businessId`, `categoryId`, `name`, `sku?`, `description?`, `costPrice`, `sellingPrice`, `initialStock?`, `lowStockThreshold?`.
- **`CreateCategoryInput`** interface: `businessId`, `name`, `description?`, `parentId?`.
- **`ProductResult`** interface: `{ product, category }` returned from `createProduct`.
- **16 tests** (`packages/inventory/test/ProductService.test.ts`): covers createProduct fields, getProduct null/not-found, listProducts businessId filter, archiveProduct isActive, adjustStock ±, InsufficientStockError, SyncEvent emission per mutation, businessId isolation across get/archive/adjustStock.
- **Added `@soostori/contracts` devDependency** to `packages/inventory/package.json` for SyncEvent + NoOpSyncEngineClass types.

### Changed
- **`packages/inventory/src/index.ts`**: re-exports `ProductService`, `CategoryService`, and their input/store types.

## [0.1.0-alpha.11] — 2025-09-10 (Phase 06 Commercial)
### Added
- **`Package` entity** (`packages/contracts/src/data-contract-4a-platform.ts`): `id`, `businessId`, `name`, `amount` (KES), `salespersonId`, `influencerId`, `isActive`, `createdAt`, `updatedAt`, `version`.
- **`CommissionRuleCommercial` entity** (`packages/contracts/src/data-contract-4a-platform.ts`): per-business commission rule with `packageAmount`, `companyShare`, `salespersonShare`, `influencerShare`, `effectiveFrom`, `effectiveTo`, `status`.
- **`CommissionLedgerEntry` entity** (`packages/contracts/src/data-contract-4a-platform.ts`): `id`, `businessId`, `subscriptionId`, `commissionRuleId`, `amount`, `recipientType` (`'company'|'salesperson'|'influencer'`), `recipientId`, `period` (YYYY-MM), `status` (`'pending'|'paid'`), `paidAt`.
- **`calculateCommission(packageAmount)`**: returns `{ companyShare, salespersonShare, influencerShare, total }` — base=600 KES, `companyShare=500+25%×excess`, `salespersonShare=100+75%×excess`, `influencerShare=50` flat (paid by company separately).
- **`createCommissionRule(businessId, salespersonId, packageAmount, influencerId?)`**: creates a `CommissionRuleCommercial` from a package amount.
- **`PackageId` branded ID** (`packages/core/src/ids.ts`): `PackageId = Brand<string, 'PackageId'>` with `asPackageId()` cast helper.
- **12 new tests** covering commission calculation at 0/600/1000/2000 KES, edge cases, `createCommissionRule`, `Package`, and `CommissionLedgerEntry` entities.

### Notes
- Influencer share (50 KES) is paid **by company** separately — `companyShare + salespersonShare = total` (not `+ influencerShare`).
- Brief table shows 1,000 KES→(company=550, salesperson=400) but the formula gives (600, 400). SDK follows the formula.

## [0.1.0-alpha.10] — 2025-09-10 (Phase 04 RBAC)
### Added
- **Canonical capability registry** (`packages/auth/src/permissions.ts`): all 45 Phase 04 capabilities declared as `CAPABILITIES` const (`products.*`, `inventory.*`, `sales.*`, `customers.*`, `debts.*`, `expenses.*`, `team.*`, `reports.*`, `devices.*`, `settings.*`, `business.*`).
- **`ROLE_DEFAULT_CAPABILITIES`**: role bundles for `owner` (all 45), `manager` (all except `business.update`, `team.assign_permission`), `cashier` (sales/customers/inventory/products basics), `attendant` (inventory/products/customers view), `viewer` (products/inventory/reports view).
- **`hasCapability(member, capability)`**: checks `memberCapabilityOverrides` first, then role bundle. Override takes absolute precedence.
- **`can(member, capability)`**: convenience boolean wrapper for guard expressions.
- **`Member` interface**: `{ role, permissions?, memberCapabilityOverrides? }` — canonical member type.
- **`Capability` type**: `typeof CAPABILITIES[keyof typeof CAPABILITIES]`.
- **`EmployeeRole` extended** (`packages/core/src/types.ts`): added `'viewer'` role.
- **38 capability tests** (`packages/auth/test/capabilities.test.ts`): covers all roles, all capabilities, override precedence, null/undefined member guard, `can()` wrapper, `ROLE_DEFAULT_CAPABILITIES` arrays.
- **Legacy back-compat**: `hasPermission()` and `checkPermission()` preserved unchanged for existing consumers.

### Changed
- `packages/auth/src/index.ts`: re-exports `Capability` and `Member` types.
- `packages/auth/src/permissions.d.ts`: regenerated with all Phase 04 exports.

## [0.1.0-alpha.2] — 2025-09-10 (contracts)
### Added
- **`NoOpSyncEngine` class impl** (`packages/contracts/src/sync-stub.ts`): `NoOpSyncEngineClass` — fresh instances per test/worker, exposes `pending` (readonly queue) + `size` + `reset()` for diagnostics. The existing const `NoOpSyncEngine` is preserved (Sub-cycle A back-compat: `NoOpSyncEngine.enqueue(event)` still works) and now delegates to a shared class instance.
- **`defaultSyncEngine` singleton** — apps import this today. Replace the binding to upgrade to the real engine; no consumer code changes required.
- **`QueuedSyncEvent` type** — `{ event: SyncEvent; enqueuedAt: number }` — the per-event record stored in the stub's queue. Mirrors what a real engine would persist to SQLite.
- **Sync round-trip tests** (`packages/contracts/test/sync-roundtrip.test.ts`, 15 new tests): confirms `enqueue` stores `state:'pending'`, `pull` returns `[]`, `apply` returns `{state:'no_op'}`; the back-compat const surface still works; and three canonical entities (`Product`, `Sale`, `Customer`) survive a full enqueue → pull → apply round-trip with their typed payloads intact.
- **Cross-platform contract matrix** synthesized at `reports/2025-cycle-04/E-contract-matrix.md`: 22-entity × 5-layer (SDK / Cloud / Web / Desktop / Mobile) table + status summary + critical gaps + handoff list.

### Notes
- The stub honours all 6 conflict-resolution principles documented in `docs/sync-semantics.md` by returning `no_op` on `apply`. The real engine — version compare, idempotency dedup, tombstone cascade, `(serverReceivedAt, originatingDeviceId, clientSequence)` ordering, retry-as-acked — ships in Cycle 05+ without changing the contract.
- No entity was redesigned; the matrix is a synthesis of Sub-cycles A, B, C, D.
- 13 / 22 entities are end-to-end (locally mapped in both Desktop and Mobile); 9 / 22 are cloud-anchored by design (documented deferrals, not omissions). 0 conflicts at the entity level.

## [0.1.0-alpha.9] — 2025-09-10 (core)
### Added
- Branded IDs added to `@soostori/core/ids`: `PersonId`, `BusinessId`, `MembershipId`, `IdempotencyKey`, `SyncCursorId`, `StockMovementId`, `CommissionRuleId`, `CommissionLedgerId`, `SalespersonApplicationId`, `SalespersonProfileId`, `InfluencerProfileId`, `AuthAuditEventId`, plus matching `as*()` cast helpers.
- `ShopId` is now a type alias to `BusinessId` (legacy brand preserved; canonical name per Cycle 04 §10 is `BusinessId`).
- Adds `@soostori/contracts` as a workspace dependency in preparation for Sub-cycle B reconciliation.

### Deferred
- `@soostori/contracts` is NOT yet re-exported through `@soostori/core`. The legacy types in `packages/core/src/types.ts` overlap with the new contract; Sub-cycle B will reconcile. Downstream consumers should `import { … } from '@soostori/contracts'` directly.

## [0.1.0-alpha.1] — 2025-09-10 (contracts, first release)
### Added
- New workspace package `@soostori/contracts` — canonical data + sync contract for all 22 Soostori entities: Person, Business, Membership, Employee, Device, Invitation, Product, Category, StockMovement, Sale, SaleLineItem, Customer, Debt, DebtPayment, Expense, Subscription, SalespersonApplication, SalespersonProfile, InfluencerProfile, CommissionLedger, CommissionRule, AuthAuditEvent.
- `SyncEvent` contract + `SyncEngine` interface + `NoOpSyncEngine` stub returning the documented responses (Cycle 04 Sub-cycle E requirement).
- `SyncApplyResult` discriminated union: `no_op | applied | conflict_replay | version_older`.
- Conflict-resolution principles documented in `packages/contracts/docs/sync-semantics.md` with citations to the §vision sections.
- Type-level + runtime tests in `packages/contracts/test/` (`data-contract.test.ts`, `sync-contract.test.ts`).

## [0.1.0-alpha.8] — 2025-09-10

### Fixed
- **`CLOUD_APP_ID`**: aligned to `'487be5c5-7615-4bbd-b3b7-3aa97154ca99'` (the canonical Soostori FIDScript app ID per Ken; matches the ID used by soostori-mobile, soostori-desktop, and soostori-web). Closes the cross-app inconsistency where SDK consumers wrote to a different FIDScript app than the apps consumed from (Question 3 from Cycle 02 audit).

## [0.1.0-alpha.7] — 2025-09-10

### Added
- **`@soostori/core`**: `UNAUTHORIZED_LOGIN_CONTACT_PHONE = '+254 732 203 353'` constant in `@soostori/core/constants` for the §29 "person not found" UX. Consumed by Mobile in this cycle; Desktop and Web will follow.
- **`@soostori/core`**: Updated committed `src/constants.js` and `src/constants.d.ts` to mirror the new `src/constants.ts` export (these companion compiled artifacts are committed to this repo and were stale).

## [Unreleased]

### Added

- **`@soostori/auth`** (NEW): `OperationalAuth` class in `operational-auth.ts` — device-local PIN verification and enrollment state machine. Handles "can this device operate?" layer separate from cloud `CloudAuth`.
- **`@soostori/auth`** (NEW): `DeviceEnrollmentState` union type: `DEVICE_NOT_ENROLLED | PIN_SETUP_REQUIRED | PIN_VERIFICATION_REQUIRED | OPERATIONAL`.
- **`@soostori/auth`** (NEW): `OperationalSession` interface — local PIN-verified session with TTL.
- **`@soostori/auth`** (NEW): `PIN_RATE_LIMIT_MS`, `MAX_PIN_ATTEMPTS`, `ENROLLMENT_TOKEN_TTL_MS` constants.
- **`@soostori/auth`** (NEW): `authError()` / `AuthError` / `AuthErrorCode` in `errors.ts` — shared error factory to avoid circular imports.
- **`@soostori/auth`**: `AuthApiClient.verifyPinForEnrollment()` — cloud-assisted PIN verification for device enrollment (Section 10 critical path: new device with existing employee PIN).
- **`@soostori/auth`**: `signInWithGoogleIdToken(params)` — Mobile Google ID-token authentication.
- **`@soostori/auth`**: `GoogleSignInResult.accountStatus?: 'provisioned' | 'active'`.
- **`@soostori/auth`**: `AuthResult<T>` re-exported for SDK consumers.
- **`@soostori/core`**: `Employee.cloudId: string` (required) — links Employee to FIDScript `$users.id`. **NOTE: requires FIDScript schema update** — add `employees.cloudId: string` to remote schema.
- **`@soostori/core`**: `Device.hasPin: boolean` (required) — cloud flag indicating device has enrolled a local PIN. **NOTE: requires FIDScript schema update** — add `devices.hasPin: boolean` to remote schema.
- **`@soostori/core`**: `Device.pinSetupAt?: ISO8601 | null` — when PIN was first set. **NOTE: requires FIDScript schema update** — add `devices.pinSetupAt: ISO8601` to remote schema.

### Fixed

- **`@soostori/auth`**: `cloud-auth.ts` was structurally broken — `CloudAuth` class body ended after `signInWithGoogle` (line 524); all subsequent methods (`handleOAuthCallback`, `signInWithGoogleIdToken`, `signInWithEmail`, `refreshSession`, `restoreSession`, `signOut`, trusted device methods, and all private helpers) were standalone functions outside the class. Class fully rewritten with correct structure.
- **`@soostori/auth`**: Syntax error in PKCE helper (`}));` → `}))`).
- **`@soostori/auth`**: `signInWithGoogle` no longer returns a misleading fake `GoogleSignInResult` — returns `GoogleSignInPartial { state }` and delegates token exchange to `handleOAuthCallback`.
- **`@soostori/auth`**: `_storeSession` null-safety — TypeScript correctly narrows `StoredSession` before use.
- **`@soostori/core`**: `Company` removed — no such entity exists in FIDScript remote schema. `identity.ts` and all downstream types updated.
- **`@soostori/core`**: `Employee.localPinHash` and `Employee.localPinSalt` removed — these were never in the remote schema and have no business in the `Employee` type.
- **`@soostori/cloud`**: `health()` latency now uses `performance.now()` (sub-ms) instead of `Date.now()` for accurate measurement.
- **`@soostori/cloud`**: `health` test — assertion relaxed from `toBeGreaterThan(0)` to `toBeGreaterOrEqual(0)` since synchronous mocks yield 0 latency.
- **`@soostori/auth`**: Stale compiled `identity.js` / `identity.js.map` removed from `src/` and `node_modules/` copies — was shadowing the corrected `.ts` source and causing `nextRequiredLink` to return `'company'` instead of `'shop'`.
- **`@soostori/contract-tests`**: Test updated — `nextRequiredLink` chain now expects `'shop'` after `'user'` (not `'company'`); `isValidChain` ctx no longer includes removed `company` field.

### Changed

- **`@soostori/auth`**: `index.ts` now also exports `operational-auth.js` public API.
- **`@soostori/auth`**: Removed `'use server'` directive — auth module is fully client-compatible.
- **`@soostori/auth`**: `handleOAuthCallback` is now a proper instance method on `CloudAuth` (was standalone function).
- **`@soostori/auth`**: `signInWithGoogle` returns `AuthResult<GoogleSignInPartial>` (not `AuthResult<GoogleSignInResult>`) — partial result with `state` for callback correlation.
- **`@soostori/identity`**: `IdentityContext.company` removed — `Company` was not in the remote schema.
- **`@soostori/identity`**: `nextRequiredLink` no longer returns `'company'`.
- **`@soostori/identity`**: `IdentityAction.SET_COMPANY` removed.
- **`@soostori/identity`**: `identityReducer` no longer handles `SET_COMPANY`.

### Security

- PIN is now explicitly documented as a LOCAL credential only. Cloud stores only `Device.hasPin: boolean` — the PBKDF2 verifier never leaves the device.

### Phase 0.5 Architecture Reconciliation (2026-09-09)

Completed full architecture decision pass across SDK, Web, Mobile, and Desktop agents.
All four agents now describe the same canonical architecture.

### SDK Gap Fixes (2026-09-09)

- **`@soostori/auth`**: `AuthApiClient` interface in `cloud-auth.ts` is now the single canonical source for all 14 API methods. Unified naming: all PIN proof parameters use `pinProof` (not `pinHash`).
- **`@soostori/auth`**: Added `getDeviceStatus`, `createDeviceEnrollment`, `changePin`, `listEnrolledDevices`, `revokeDevice`, `getSubscriptionStatus` to `AuthApiClient`.
- **`@soostori/auth`**: `api-spec.md` created — full Next.js Route Handler specification for all `AuthApiClient` endpoints including DB schema, error codes, and security model.
- **`@soostori/core`**: `SyncEvent` type corrected — `sequenceNumber` (not `timestamp`/`version`/`idempotencyKey`) is the FIDScript field.
- **`@soostori/core`**: `Device` type corrected — `lastSyncAt` and `tokenRef` removed (not in FIDScript). `hasPin` and `pinSetupAt` marked as PENDING schema additions.
- **`@soostori/core`**: `CompanyId` and `asCompanyId()` removed from `ids.ts` — `Company` entity does not exist.
- **`@soostori/schema`**: `companies` entity removed from `entities.ts` — only `shops` exists.
- **`@soostori/auth`**: Stale `.d.ts` declaration files (`identity.d.ts`, `errors.d.ts`) removed — generated output lives in `dist/`.
- **`@soostori/auth`**: `errors.ts` `AuthErrorCode` union includes all error codes used across cloud and operational auth flows.

#### Verified Live Remote State (via /instant-self)
- `employees.cloudId`: ✅ PRESENT — forward-identity link to `$users.id`
- `devices.hasPin`: ❌ MISSING — platform `push_schema` blocker (MCP returns `steps: []`)
- `devices.pinSetupAt`: ❌ MISSING — same platform blocker
- `syncEvents.idempotencyKey`: ❌ MISSING — needs schema addition
- Shop-level permissions: ❌ MISSING — `$default` allows any authenticated user access

#### Canonical Decisions
1. **Person→Business→Membership**: `employees` IS the canonical Membership entity — no separate `memberships` entity needed
2. **PIN**: Canonical verifier in Next.js backend encrypted DB; local verifier in device Keychain; FIDScript stores only `devices.hasPin` boolean
3. **Enrollment tokens**: Next.js backend DB (NOT FIDScript entities) — short-lived, scoped, single-use, atomic consumption
4. **PIN recovery**: Separate 3-step flow from cloud password reset; uses transactional email provider (NOT FIDScript magic-code)
5. **AuthApiClient**: All operations → Next.js Route Handlers; no separate backend service
6. **Permissions**: CEL-based on FIDScript: `employees.filter(e => e.cloudId == auth.uid && e.shopId == data.shopId)`
7. **Sync**: `idempotencyKey` on syncEvents; `version` on business entities (not syncEvents)
8. **Primary Device**: Do NOT add `isPrimary` field — use `isLanHost` + business logic for authority
9. **CEL expressions**: Must be verified against actual FIDScript permissions engine before use

#### Exact Blockers
- **CRITICAL**: `push_schema` MCP tool returns `steps: []` without committing — `devices.hasPin`/`pinSetupAt` cannot be added via MCP
- **CRITICAL**: Shop-level data isolation missing — `$default` permissions allow any authenticated user full access
- **HIGH**: `AuthApiClient` backend not implemented (Next.js Route Handlers)
- **HIGH**: `syncEvents.idempotencyKey` missing from schema
- **HIGH**: Business domain entities (`products`, `customers`, `sales`, `debts`) absent

See `packages/auth/src/api-spec.md` for full Next.js Route Handler specification.

### Remote Schema Dependencies

The following FIDScript schema additions are required for full functionality:
- `employees.cloudId: string` — links Employee to `$users.id`
- `devices.hasPin: boolean` — flags that device has a local PIN enrolled
- `devices.pinSetupAt: ISO8601` — when PIN was set

Without these schema additions, `DeviceEnrollmentState` will always default to `PIN_SETUP_REQUIRED` on first enrollment.
- **`@soostori/cloud`**: 9 tests for remaining methods — `signOut`, `health`, `query`, `transact`, `upsert`, `getById` (all passing).

### Fixed (this session)

- **`@soostori/auth`**: `index.d.ts` synced — now re-exports `cloud-auth.js` and `operational-auth.js` matching `index.ts`
- **`@soostori/auth`**: `identity.d.ts` regenerated — removed stale `Company` import/type/field, fixed `IdentityContext`, `buildSession`, and `IdentityAction` to match current source
- **`@soostori/auth`**: `errors.ts` — added missing `'ENROLLMENT_REQUIRED'` to `AuthErrorCode` union
- **`@soostori/core`**: `Employee.cloudId` NOTE comment removed — field IS present in live FIDScript schema (verified via `/instant-self`)
- **`@soostori/core`**: `SyncEvent` type fixed — removed `timestamp` and `version` (not in FIDScript), added NOTE comments for planned `idempotencyKey` and `version` additions
- **`@soostori/core`**: `Device` type fixed — removed `hasPin`, `pinSetupAt`, `tokenRef`, `lastSyncAt` (not in FIDScript yet), added NOTE comments for planned additions
- **`@soostori/auth`**: Created `packages/auth/src/api-spec.md` — full Next.js Route Handler spec for `AuthApiClient` backend (10 endpoints, DB schema, security model)

---

## [0.1.0-alpha.3] — 2026-09-08

### Added

- **`@soostori/auth`**: Full `CloudAuth` class with PKCE S256 browser OAuth, email/password registration and verification, password reset, session refresh with rotation, trusted device management, offline session caching, event emission.
- **`@soostori/auth`**: `PlatformAuthAdapter` interface — abstracts `openOAuthBrowser`, `getSecureStorage`, `getNetworkStatus`, `randomString`.
- **`@soostori/auth`**: `AuthApiClient` interface — REST contract for auth backend.
- **`@soostori/auth`**: `AuthResult<T>` discriminated union: `{ ok: true; data: T } | { ok: false; error: AuthError }`.
- **`@soostori/auth`**: 24 unit tests for all auth flows.
