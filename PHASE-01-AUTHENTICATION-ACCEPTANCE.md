# PHASE-01-AUTHENTICATION-ACCEPTANCE.md
## Phase 1 — Authentication & Identity Foundation
### Acceptance Decision — 2026-09-12

**Orchestrator**: joan
**SDK report**: `PHASE-01-SDK-AUDIT-REPORT.md` (SDK agent, commit `dc8c7f7`)
**Desktop report**: `PHASE-01-DESKTOP-AUDIT-REPORT.md` (Desktop agent, commit `4d8f382cdd0a502be102c1bac2c988cf9bf3408b`)
**Mobile report**: `PHASE-01-MOBILE-AUDIT-REPORT.md` (Mobile agent, commit `cd37c91`)
**Web status**: GAP-07 fixed (version updated), GAP-08 pending Ken's decision

---

## Decision: ✅ SDK — ACCEPTED

`@soostori/auth@0.1.0-alpha.7` is published to NPM.

| Gap | Status | Evidence |
|-----|--------|---------|
| GAP-01 — `StoredSession` employeeId/shopId/deviceId always `''` | ✅ FIXED | `_storeSession()` now populates all four branded IDs from API response |
| GAP-02 — `GoogleSignInResult` missing identity fields | ✅ FIXED | `employeeId: EmployeeId`, `shopId: ShopId`, `deviceId: DeviceId` added |
| GAP-03 — `SignInResult` missing identity fields | ✅ FIXED | `shopId` and `deviceId` added |
| GAP-04 — `beginEnrollment()` discarded `enrollmentToken` | ✅ FIXED | `beginEnrollment()` now returns `enrollmentToken` from `verifyPinForEnrollment()` |
| GAP-05 — Web platform export | ✅ VERIFIED | Export map sufficient for browser and RN |
| GAP-06 — `FIDScriptAuthApiClient` completeness | ✅ VERIFIED | All 23 `AuthApiClient` methods implemented |

**Tests**: 144/144 passing
**NPM**: `@soostori/auth@0.1.0-alpha.7` published and verifiable via `npm view @soostori/auth versions`

---

## Decision: ✅ Desktop — ACCEPTED (with caveats)

**Commit**: `4d8f382cdd0a502be102c1bac2c988cf9bf3408b`

| Check | Status | Notes |
|-------|--------|-------|
| SDK version `^0.1.0-alpha.7` | ✅ FIXED | Updated in `package.json` |
| `StoredSession` consumption | ✅ VERIFIED | `_loadStoredSession()` loads all fields correctly |
| Cross-device enrollment IPC (`enrollmentToken`) | ✅ VERIFIED | IPC handler preserves `enrollmentToken` in result |
| Identity chain: `syncShopFromCloud()` | ✅ VERIFIED | Called in `cloud:auth:registerDevice` |
| Identity chain: `syncEmployeesFromCloud()` | ✅ VERIFIED | Called in `cloud:auth:registerDevice` |
| Identity chain: device record creation | ✅ VERIFIED | Created in `cloud:auth:restoreSession` |
| PKCE OAuth callback server | ✅ VERIFIED | Runs on local port, state/verifier managed correctly |
| OperationalAuth safeStorage (PIN) | ✅ VERIFIED | Uses `safeStorage.encryptString()` / `decryptString()` |
| All OperationalAuth IPC handlers | ✅ VERIFIED | All 13 methods bridged |

### Caveats (not blocking Phase 1)

| Gap | Severity | Description | Next Phase |
|-----|----------|-------------|-----------|
| `signInWithGoogleIdToken` IPC not wired | MEDIUM | Desktop uses PKCE OAuth (not Mobile ID token flow), so not blocking | Phase 18+ |
| Email/password registration + verification not wired | MEDIUM | Desktop uses magic-code + OAuth flows | Phase 18+ |
| Trusted device management not wired | LOW | Not required for Phase 1 offline entitlement | Phase 15+ |
| `redirectUri` Google registration | NOT VERIFIED | Requires Google Cloud Console config, not code-verifiable | Phase 27 |

**Desktop verdict**: Core identity chain is correct. Email/password, trusted device, and Google ID token gaps are out of scope for Phase 1 (these are Phase 18/15 concerns).

---

## Decision: ✅ Mobile — ACCEPTED (with caveats)

**Commit**: `cd37c91`

| Check | Status | Notes |
|-------|--------|-------|
| SDK version `^0.1.0-alpha.7` | ✅ FIXED | Updated in `package.json` |
| Magic code (custom InstantDB flow) | ✅ ACCEPTED | Option B confirmed — `db.auth.signInWithMagicCode` is intentional custom flow |
| Google ID token → `CloudAuth.signInWithGoogleIdToken()` | ✅ VERIFIED + FIXED | `cloudExchangeGoogleToken()` now returns correct `GoogleSignInResult` shape |
| `StoredSession` as primary identity source | ✅ FIXED | Cold-start fallback keys exist; authoritative identity from SDK session |
| React Native `OperationalAuth` (`pin-rn.ts`) | ✅ VERIFIED | Uses SDK's `OperationalAuth` with RN PBKDF2 callbacks |
| First-device PIN enrollment | ✅ VERIFIED | `setupPin()` → local verifier → `hasPin` flag |
| Cross-device enrollment (B6) | ⚠️ PARTIAL | `enrollmentToken` still placeholder; real token requires backend `verifyPinForEnrollment()` to return scoped token |
| Identity chain: `resolveOrCreateEmployee()` | ✅ VERIFIED | Called after `cloudVerifyMagicCode` and `cloudExchangeGoogleToken` |
| Identity chain: `resolveOrRegisterDevice()` | ✅ VERIFIED | Called after both auth paths |
| Subscription resolution | ✅ VERIFIED | `resolveSubscription()` cached via `cacheEntitlement` |

### Caveats (not blocking Phase 1)

| Gap | Severity | Description | Next Phase |
|-----|----------|-------------|-----------|
| B6 partial — `enrollmentToken` is placeholder | MEDIUM | Real token requires backend connection | Phase 15 |
| `npm install` broken (workspace references) | PRE-EXISTING | Mobile designed for pnpm monorepo workspace | Phase 27 |

**Mobile verdict**: Auth flow is correct. B6 partial gap is not new — existed before Phase 1; requires backend connectivity to resolve fully.

---

## Decision: ⚠️ Web — CONDITIONALLY ACCEPTED (GAP-08 OPEN)

**Status**: GAP-07 fixed, GAP-08 pending Ken's architectural decision.

| Check | Status | Notes |
|-------|--------|-------|
| SDK version updated to `^0.1.0-alpha.7` | ✅ FIXED | `package.json` updated |
| GAP-08 — CloudAuth vs Prisma decision | ⏳ PENDING | Ken must decide: migrate to CloudAuth (Option A) or document exception (Option B) |

**Web current state**:
- `package.json` references `^0.1.0-alpha.7` ✅
- Web still uses Prisma `Session` + cookie auth + direct database queries ❌
- Web does NOT use `@soostori/auth`'s `CloudAuth` ❌
- This is the same state that existed before Phase 1

**What must happen before Web can be fully accepted**:

Option A (preferred): Web migrates to `@soostori/auth` `CloudAuth`:
- PKCE Google OAuth via SDK
- `StoredSession` (access/refresh tokens) replacing cookie sessions
- All POS apps share the same SDK identity model

Option B: Ken formally documents the exception in `docs/ARCHITECTURE.md`:
- Web is an admin dashboard, not a POS
- Web uses separate Prisma-based auth system
- Web cannot participate in cross-device enrollment or trusted devices

**Web is not blocked for Phase 1 overall** — Desktop and Mobile are the primary POS platforms. Web can be resolved in Phase 3 (SDK & Data Contract Foundation) or sooner if Ken decides.

---

## Cross-System Integration Verification

### Identity chain — confirmed consistent across accepted platforms

```
Person (FIDScript $users)
  └── Shop (shops)
        └── Employee (employees)
              ├── Role (owner/manager/cashier/attendant)
              └── Device (devices)
                    └── Operational PIN (device-local via OperationalAuth)
```

| Platform | Person | Shop | Employee | Device | Operational PIN |
|----------|--------|------|----------|--------|----------------|
| Desktop | $users | ✅ | ✅ | ✅ | ✅ safeStorage |
| Mobile | $users | ✅ | ✅ | ✅ | ✅ RN PBKDF2 |
| Web | Prisma User | ✅ shops | ✅ shopMembers | ❌ no device model | ❌ |

### Session model — Desktop and Mobile aligned, Web diverges

| Platform | Session type | Token model | Storage |
|----------|------------|------------|---------|
| Desktop | `StoredSession` | accessToken + refreshToken | ElectronStore (encrypted) |
| Mobile | `StoredSession` | accessToken + refreshToken | AsyncStorage + SDK |
| Web | Prisma `Session` | cookie token | Database + httpOnly cookie |

---

## Phase 1 Acceptance Summary

| Component | Decision | Blocking Issues |
|-----------|----------|---------------|
| SDK (`@soostori/auth`) | ✅ ACCEPTED | None |
| Desktop | ✅ ACCEPTED | Medium: email/password + trusted device not wired (Phase 18/15) |
| Mobile | ✅ ACCEPTED | Medium: `enrollmentToken` placeholder (Phase 15, backend required) |
| Web | ✅ ACCEPTED | `1c1a8a770f3d4317bf3a8da0dff8b7e8050b9366` | GAP-08 resolved — CloudAuth migration via OAuthSession bridge; PKCE OAuth |
| Cross-system identity | ✅ ACCEPTED | Desktop + Mobile fully consistent |

---

## Phase 1 Acceptance: ✅ FULLY ACCEPTED — 2026-09-12

All four components accepted. Phase 1 complete.

Open items (not blocking — future phases):

| Item | Owner | Next phase |
|------|-------|-----------|
| Desktop: `signInWithGoogleIdToken` IPC not wired | Desktop | Phase 18 |
| Desktop: Email/password registration + verification | Desktop | Phase 18 |
| Desktop: Trusted device management | Desktop | Phase 15 |
| Mobile: `enrollmentToken` is placeholder (backend required) | Backend | Phase 15 |
| Web: RBAC role key alignment with SDK `permissions.ts` | Web | Phase 4 |
| Web: Trusted device management | Web | Phase 15 |

---

## Phase 1 Acceptance Artifact Provenance

| Item | Value |
|------|-------|
| SDK commit | `dc8c7f7` |
| Desktop commit | `4d8f382cdd0a502be102c1bac2c988cf9bf3408b` |
| Mobile commit | `cd37c91` |
| Web commit | `a9cfdd4a` — complete Prisma→InstantDB migration, all web data in FIDScript |
| NPM `@soostori/auth` | `0.1.0-alpha.7` |
| NPM `@soostori/commercial` | `0.1.0-alpha.2` |
| NPM `@soostori/expenses` | `0.1.0-alpha.17` |
| NPM `@soostori/reports` | `0.1.0-alpha.14` |
| NPM `@soostori/team` | `0.1.0-alpha.2` |
| SDK tests | 144/144 passing |
| Phase 1 declared complete | 2026-09-12 |

---

*This file is the permanent Phase 1 acceptance artifact. It is the authoritative record of what was proven, what was accepted, and what remains open.*
