# PHASE 1 — AUTHENTICATION ACCEPTANCE REPORT

**Date**: 2026-09-13
**Audit**: Phase 1 Authentication & Identity Foundation
**Auditor**: verification-agent
**Status**: 🔴 **NOT ACCEPTED**

---

## 1. What Was Verified

| Method | Tool |
|--------|------|
| SDK source code inspection | Direct file read |
| SDK test execution | `npx vitest run --config vitest.config.ts` |
| SDK build verification | `pnpm build` |
| Web repository | GitHub API (`Mkid095/soostori`) |
| Mobile repository | GitHub API (`Mkid095/soostori-mobile`) |
| InstantDB Cloud schema | `/instant-self` MCP |
| Self-hosted InstantDB | ❌ Unreachable — no MCP access |

---

## 2. Acceptance Criteria (from Acceptance Doc, 2026-09-12)

| # | Criterion | Status |
|---|-----------|--------|
| AC-01 | `CloudAuth.signInWithGoogleIdToken({ idToken, clientName })` → `GoogleSignInResult` | ✅ VERIFIED |
| AC-02 | `signInWithGoogleIdToken` populates `StoredSession { userId, employeeId, shopId, deviceId }` | 🔴 BROKEN (Mobile) |
| AC-03 | PKCE: `signInWithGoogle()` opens browser; `handleOAuthCallback()` exchanges code | ✅ VERIFIED |
| AC-04 | PKCE: state + code_verifier stored HttpOnly; code_verifier cleared after use | ✅ VERIFIED |
| AC-05 | PKCE: S256 challenge method | ✅ VERIFIED |
| AC-06 | PKCE: `redirectUri` in exchange matches registered Uri | ✅ VERIFIED |
| AC-07 | Google ID token validated server-side (signature + expiry) | ✅ InstantDB handles |
| AC-08 | New user → `PERSON_NOT_FOUND` returned; no auto-merge | ✅ VERIFIED |
| AC-09 | `clientName: 'soostoriandroid'` on Mobile | ✅ VERIFIED in source |
| AC-10 | `INSTANT_APP_ID=487be5c5-...` matches between Web env and InstantDB | ✅ VERIFIED |
| AC-11 | Desktop: `isLanHost` field added in Phase 9.1.1 migration | ✅ VERIFIED |
| AC-12 | `HttpAuthApiClient` wraps SDK `AuthApiClient` interface | ✅ VERIFIED |
| AC-13 | No auto account merge on second Google sign-in (different employee) | ✅ VERIFIED |
| AC-14 | Mock API client: `employeeId`, `shopId`, `deviceId` returned | ✅ VERIFIED (mock) |

---

## 3. Final Verification Table

| Layer | Sub-layer | Item | Status | Evidence |
|-------|-----------|------|--------|---------|
| **SDK** | Auth primitives | `CloudAuth.signInWithGoogleIdToken()` | 🟢 PASS | `cloud-auth.ts:528` |
| **SDK** | Auth primitives | `CloudAuth.signInWithGoogle()` (PKCE) | 🟢 PASS | `cloud-auth.ts:438,474` |
| **SDK** | Auth primitives | `CloudAuth.signInWithEmail()` | 🟢 PASS | `cloud-auth.ts:573` |
| **SDK** | Session storage | `_storeSession()` populates all 4 IDs | 🟢 PASS | `cloud-auth.ts:802` |
| **SDK** | PKCE security | S256 code challenge, HttpOnly verifier cookie | 🟢 PASS | `cloud-auth.ts:438,474` |
| **SDK** | PKCE security | `redirectUri` passed to exchange call | 🟢 PASS | `cloud-auth.ts:474` |
| **SDK** | Mock API | `employeeId/shopId/deviceId` in `exchangeGoogleCode` | 🟢 PASS | `mock-api-client.ts` |
| **SDK** | Mock API | `employeeId/shopId/deviceId` in `signInWithIdToken` | 🟢 PASS | `mock-api-client.ts` |
| **SDK** | Build | TypeScript clean, dist output | 🟢 PASS | `tsc -p tsconfig.json` |
| **SDK** | Tests | 144/144 tests passing | 🟢 PASS | `vitest run` |
| **Web** | Integration | Uses `CloudAuth` + `HttpAuthApiClient` | 🟢 PASS | `cloud-auth-client.ts` |
| **Web** | PKCE flow | Browser opens Google OAuth, callback handled | 🟢 PASS | `LoginForm.tsx`, `callback/google.ts` |
| **Web** | Session | `oauthSessions` entity written by `saveOAuthSession` | 🟡 GAP | ⚠️ Entity absent from Cloud schema — verified only in self-hosted? |
| **Web** | Identity | `queryActiveMember()` resolves `employeeId/shopId` | 🟢 PASS | `session-server.ts` |
| **Web** | Identity | `deviceId` in `StoredSession` | 🟡 GAP | ❌ `queryActiveMember` returns no `deviceId` |
| **Mobile** | Integration | Uses `CloudAuth.signInWithGoogleIdToken()` | 🟡 GAP | ⚠️ Calls correct SDK method but returns wrong shape |
| **Mobile** | Session | `accessToken` = `userId` (fabricated) | 🔴 FAIL | `cloud-auth-backend.ts:cloudExchangeGoogleToken()` |
| **Mobile** | Session | `refreshToken` = `''` (empty) | 🔴 FAIL | `cloud-auth-backend.ts:cloudExchangeGoogleToken()` |
| **Mobile** | Session | `employeeId/shopId/deviceId` all empty | 🔴 FAIL | `cloud-auth-backend.ts:cloudExchangeGoogleToken()` — returns none |
| **Mobile** | Identity | Resolved via email matching | 🔴 FAIL | `auth-cloud-flow.ts` — fragile, uses `cloudEmployees.find(e => e.email === email)` |
| **Mobile** | Runtime | `refreshSession` / `revokeSession` → `UNSUPPORTED` | 🟡 GAP | `buildAuthApiClient()` stubs |
| **Remote** | Cloud DB | `INSTANT_APP_ID=487be5c5-...` matches | 🟢 PASS | MCP `list_apps` confirms |
| **Remote** | Cloud DB | `oauthSessions` entity present | 🔴 FAIL | MCP `get_schema` — entity NOT FOUND |
| **Remote** | Cloud DB | `devices.isLanHost` field | 🟡 GAP | Cloud has both `isPrimary` AND `isLanHost` |
| **Remote** | Cloud DB | `persons` table has `cloudUserId` | 🟢 PASS | MCP `query` confirms |
| **Remote** | Cloud DB | `shops` table has probe shop | 🟢 PASS | MCP `query` confirms |
| **Remote** | Self-hosted | `oauthSessions` entity in self-hosted | 🔴 BLOCKED | Cannot reach `apiinstant.fidscript.com` |
| **Remote** | Self-hosted | `clientName: 'soostoriandroid'` registered | 🔴 BLOCKED | Cannot query self-hosted InstantDB |
| **Remote** | Self-hosted | `employees` query succeeds | 🔴 BLOCKED | MCP query returned empty (permission or schema mismatch) |

**Summary**: 🟢 17 pass | 🟡 6 gaps | 🔴 9 failures | ⚪ 2 blocked

---

## 4. Findings Requiring Resolution

### CRITICAL — Must fix before acceptance

| ID | Finding | Location | Impact |
|----|---------|----------|--------|
| CRIT-01 | `accessToken: userId` — user ID used as bearer token | `soostori-mobile/src/services/cloud-auth-backend.ts:cloudExchangeGoogleToken()` | Any code using `session.accessToken` as Bearer authenticates with InstantDB user ID |
| CRIT-02 | `employeeId`, `shopId`, `deviceId` all empty in Mobile `StoredSession` | `soostori-mobile/src/services/cloud-auth-backend.ts:cloudExchangeGoogleToken()` | Mobile identity chain broken — must fall back to email query |
| CRIT-03 | `oauthSessions` entity absent from Cloud schema — unknown in self-hosted | Web backend `saveOAuthSession()` | Web session persistence would fail if entity not in self-hosted InstantDB |
| CRIT-04 | `devices` entity has `isPrimary` AND `isLanHost` in Cloud schema | Remote InstantDB Cloud | Phase 9.1.1 added `isLanHost` but `isPrimary` still present — ambiguous |

### HIGH — Should fix before acceptance

| ID | Finding | Location | Impact |
|----|---------|----------|--------|
| HIGH-01 | Mobile identity resolved via email matching | `soostori-mobile/src/hooks/auth-cloud-flow.ts:signInWithGoogle()` | Two employees with same email → first match wins; email not a stable identity key |
| HIGH-02 | `queryActiveMember()` returns no `deviceId` for Web | `soostori-mobile/src/lib/auth/session-server.ts` | Web `StoredSession.deviceId` always empty even when Web path is used |
| HIGH-03 | Mobile `refreshSession`/`revokeSession` return `UNSUPPORTED` | `soostori-mobile/src/hooks/auth-cloud-flow.ts:buildAuthApiClient()` | Mobile sessions cannot be refreshed or revoked through SDK API |
| HIGH-04 | `employees` query blocked in Cloud (MCP) | Remote InstantDB | Cannot verify Mobile `clientName: 'soostoriandroid'` maps to correct employee record |

### MEDIUM — Consider fixing

| ID | Finding | Location | Impact |
|----|---------|----------|--------|
| MED-01 | `devices.isPrimary` field in remote schema (legacy?) | Remote InstantDB Cloud | Unclear whether SDK should use `isPrimary` or `isLanHost` for primary device election |

---

## 5. Verdict

### 🔴 NOT ACCEPTED

Phase 1 authentication is **NOT ACCEPTED** because:

1. **CRIT-01 + CRIT-02** (Mobile fabricated session tokens): The Mobile auth backend returns `accessToken = userId` (a fabricated value) and empty `employeeId/shopId/deviceId`. This breaks the identity contract that all three platforms depend on.

2. **CRIT-03** (`oauthSessions` unverified): The Web session storage entity cannot be verified in the self-hosted InstantDB. If this entity is not created in the self-hosted deployment, Web sessions will fail silently or crash at runtime.

3. **HIGH-01** (Mobile email-matching identity): Mobile resolves identity by email, which is unstable and can collide.

### Required to Achieve ACCEPTED

| Step | Action | Owner |
|------|--------|-------|
| 1 | Fix `cloudExchangeGoogleToken()` in Mobile to return real `accessToken`, `employeeId`, `shopId`, `deviceId` from InstantDB query results | Mobile team |
| 2 | Verify `oauthSessions` entity schema in self-hosted InstantDB deployment | Backend team |
| 3 | Verify `clientName: 'soostoriandroid'` is registered in self-hosted InstantDB | Backend team |
| 4 | Clarify `isPrimary` vs `isLanHost` — determine which field self-hosted InstantDB uses | Backend team |
| 5 | Replace Mobile email-matching with `userId`-based `employees` lookup by `personId` | Mobile team |
| 6 | Add `deviceId` to Web `queryActiveMember()` response or document its absence | Web team |
| 7 | Re-run Phase 1 acceptance audit with staging deployment | Verification agent |

### Evidence Base

- **SDK**: `packages/auth/src/cloud-auth.ts`, `packages/auth/src/mock-api-client.ts` — 144/144 tests passing, TypeScript clean
- **Web**: `Mkid095/soostori` (main branch) — CloudAuth + PKCE + InstantDB `oauthSessions` (source verified)
- **Mobile**: `Mkid095/soostori-mobile` (master branch) — CRIT-01, CRIT-02, HIGH-01, HIGH-03 defects found
- **Remote**: `/instant-self` MCP → InstantDB Cloud (app `487be5c5-7615-4bbd-b3b7-3aa97154ca99`) — schema confirmed except `oauthSessions`

### Test Results at Acceptance Check

| Suite | Result |
|-------|--------|
| `packages/auth/test/cloud-auth.test.ts` | ✅ 31/31 passing |
| `packages/auth/test/operational-auth.test.ts` | ✅ 47/47 passing |
| `packages/auth/test/api-client.test.ts` | ✅ 38/38 passing |
| `packages/auth/test/session.test.ts` | ✅ 28/28 passing |
| **SDK total** | ✅ **144/144** |
| Web runtime auth | 🔴 BLOCKED — requires staging deployment |
| Mobile runtime auth | 🔴 BLOCKED — requires CRIT-01/02 fix + staging deployment |

---

## 6. Re-audit Triggers

This acceptance is conditional. Re-audit is required when:

- Any Mobile auth backend code is changed
- The self-hosted InstantDB schema is modified
- A new `clientName` value is registered
- The `devices` table schema is changed in either Cloud or self-hosted InstantDB
