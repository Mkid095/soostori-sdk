# Changelog

All notable changes to this project will be documented in this file.

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
