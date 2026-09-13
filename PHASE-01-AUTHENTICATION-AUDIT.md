# PHASE 1 — AUTHENTICATION & IDENTITY FOUNDATION
## Audit Document v2.0 — 2026-09-13

**Auditor**: verification-agent
**Status**: 🔵 AUDIT COMPLETE — RUNTIME VERIFICATION REQUIRED

---

## What was verified

| What | How | Result |
|------|-----|--------|
| SDK source code | Direct inspection of `packages/auth/src/` | ✅ |
| SDK tests | `npx vitest run packages/auth/test/*.test.ts --config vitest.config.ts` | ✅ 144/144 |
| SDK build | `pnpm --filter @soostori/auth build` | ✅ clean |
| Web source code | GitHub API (`Mkid095/soostori`) | ✅ |
| Mobile source code | GitHub API (`Mkid095/soostori-mobile`) | ✅ |
| Remote InstantDB (Cloud) | `/instant-self` MCP → `list_apps`, `query`, `get-schema` | ✅ partial |
| Remote self-hosted | Cannot verify — `apiinstant.fidscript.com` unreachable via MCP | 🔴 BLOCKED |

---

## SDK — Authoritative Contract

### Entry Points

| Flow | Method | Location |
|------|--------|----------|
| Web PKCE OAuth | `signInWithGoogle(config)` → `handleOAuthCallback(partial, codeVerifier, redirectUri)` | `cloud-auth.ts:438, 474` |
| Mobile Google ID Token | `signInWithGoogleIdToken({ idToken, clientName })` | `cloud-auth.ts:528` |
| Email/password | `signInWithEmail(email, password)` | `cloud-auth.ts:573` |
| Magic code | Not in SDK (Mobile custom) | — |

### Google ID-Token Primitive

```
signInWithGoogleIdToken({ idToken, clientName })
  → api.signInWithIdToken(clientName, idToken)   ← HttpAuthApiClient POST /api/auth/id-token
  → GoogleSignInResult {
      userId, employeeId, shopId, deviceId,
      email, displayName, idToken,
      accessToken, refreshToken,
      isNewUser, accountStatus
    }
```

### PKCE Web Flow

```
signInWithGoogle(config)
  → opens browser to accounts.google.com (PKCE + S256)
  → returns { state } (partial)
  → user redirected to redirectUri

handleOAuthCallback(partial, codeVerifier, redirectUri)
  → api.exchangeGoogleCode(code, codeVerifier, redirectUri)  ← POST /api/auth/google/exchange
  → GoogleSignInResult (same shape)
```

### clientName Values

| Platform | Value | Source |
|----------|-------|--------|
| Mobile | `'soostoriandroid'` | `auth-cloud-flow.ts:101` |
| Web | Not used in PKCE path (uses `/api/auth/google/exchange`) | — |

### Session Persistence

| Method | Platform | Storage |
|--------|----------|---------|
| `_saveStoredSession` | Desktop | ElectronStore (encrypted) |
| `_saveStoredSession` | Mobile | Override not verified |
| `_saveStoredSession` | Web | No-op (session stored server-side via `saveOAuthSession`) |

### Identity Resolution Chain (from SDK)

```
GoogleSignInResult.userId          → InstantDB $users.id
GoogleSignInResult.employeeId     → employees.id
GoogleSignInResult.shopId        → shops.id
GoogleSignInResult.deviceId        → devices.id
```

### StoredSession Fields

```
userId, employeeId, shopId, deviceId, email,
accessToken, refreshToken,
createdAt, expiresAt, lastValidatedAt
```

---

## WEB — Implementation

**Repository**: `Mkid095/soostori` (main branch)

### Web Auth Flow (COMPLETE — CONVERGES ON SDK)

```
LoginForm.tsx
  ↓ handleGoogleSignIn()
cloudAuth.signInWithGoogle({ clientId, redirectUri: '/api/auth/callback/google' })
  → opens browser to accounts.google.com (PKCE S256)
  → returns { state }

[User approves → Google redirects to /api/auth/callback/google]

callback/google.ts (GET)
  → reads codeVerifier from cookie
  → cloudAuth.handleOAuthCallback({ state, code }, codeVerifier, redirectUri)
    → POST /api/auth/google/exchange
      → HttpAuthApiClient.exchangeGoogleCode()
        → POST /api/auth/google/exchange (Next.js API route)
          → sdk cloudAuth.handleOAuthCallback()
            → POST to InstantDB /auth/exchange-google-code
  → saveOAuthSession(sessionToken, storedSession)
    → instantTransact upsert → oauthSessions entity
  → Set-Cookie: session_token=<uuid>
  → Redirect /dashboard
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/auth/cloud-auth-client.ts` | CloudAuth singleton + HttpAuthApiClient |
| `src/lib/auth/platform-adapter.ts` | `webPlatformAdapter` (openOAuthBrowser → window.location) |
| `src/lib/auth/oauth-session.ts` | `saveOAuthSession` → InstantDB `oauthSessions` entity |
| `src/lib/auth/session-server.ts` | `queryActiveMember` → `memberships → employees → roles → shops` |
| `src/pages/api/auth/callback/google.ts` | OAuth redirect handler |
| `src/pages/api/auth/google/exchange.ts` | PKCE code exchange route |
| `src/pages/api/auth/signin.ts` | Email/password → cloudAuth.signInWithEmail |

### Web Identity Resolution (ACTIVE)

```
loadOAuthSession(cookieHeader)
  → instantQuery oauthSessions { sessionToken }
  → StoredSession { userId, employeeId, shopId, deviceId }

queryActiveMember(userId)
  → employees { personId: userId } → role, memberships { status: 'active' } → shop
  → ActiveMember { id, employeeId, role, shop }
```

### Session Model

Web uses `oauthSessions` InstantDB entity (not Prisma cookies). Session cookie `session_token` → UUID → `oauthSessions.sessionToken`. This is distinct from Prisma sessions.

### Web Verdict

| Aspect | Status |
|--------|--------|
| Consumes `@soostori/auth` CloudAuth | ✅ |
| PKCE Google OAuth via SDK | ✅ |
| Stores session in InstantDB | ✅ (oauthSessions) |
| Identity resolution via `queryActiveMember` | ✅ |
| `employeeId` / `shopId` populated | ✅ (from queryActiveMember) |
| `deviceId` populated | ❌ (not in queryActiveMember) |
| Logout | ⚠️ Not verified |

---

## MOBILE — Implementation

**Repository**: `Mkid095/soostori-mobile`

### Mobile Auth Flow (MIXED — SDK + CUSTOM)

```
GoogleSignin.signIn()
  → idToken
  → signInWithGoogle(cloudAuth, idToken)
    → cloudAuth.signInWithGoogleIdToken({ idToken, clientName: 'soostoriandroid' })
      → MobileAuthApiClient.signInWithIdToken()
        → cloudExchangeGoogleToken(idToken)        ← db.auth.signInWithGoogle({ idToken })
          → { userId, email, displayName, accessToken: userId, refreshToken: '' }
      → StoredSession { userId, employeeId, shopId, deviceId, accessToken: userId }
```

### Key Files

| File | Purpose |
|------|---------|
| `src/hooks/auth-cloud-flow.ts` | `signInWithGoogle()` — creates CloudAuth, calls `signInWithGoogleIdToken` |
| `src/services/cloud-auth-backend.ts` | `cloudExchangeGoogleToken` → `db.auth.signInWithGoogle` |

### CRITICAL DEFECT — Mobile `accessToken = userId`

**Location**: `cloud-auth-backend.ts:cloudExchangeGoogleToken()`

```typescript
return {
  userId,
  email,
  displayName,
  idToken,
  accessToken: userId,    // ← FABRICATED — not a real token
  refreshToken: '',        // ← EMPTY
  isNewUser: false,
}
```

This is passed through `signInWithIdToken()` → `GoogleSignInResult` → `_storeSession()` → `StoredSession.accessToken = userId`.

The actual authentication happens at `db.auth.signInWithGoogle()` level inside `cloudExchangeGoogleToken()`. The `accessToken` returned to `CloudAuth` is the InstantDB `$users.id`, not a session token.

**Impact**: Any code downstream that uses `StoredSession.accessToken` as a Bearer token will use the user's InstantDB ID as the token — this is a security and correctness defect.

### CRITICAL DEFECT — Mobile `employeeId` / `shopId` / `deviceId` all empty

**Location**: `cloud-auth-backend.ts:cloudExchangeGoogleToken()`

The function returns ONLY `userId`, `email`, `displayName`, `idToken`, `accessToken: userId`, `refreshToken: ''`, `isNewUser: false`. No `employeeId`, `shopId`, or `deviceId`.

These are then stored into `StoredSession` as empty strings via `_storeSession()`.

After `signInWithGoogleIdToken` succeeds, `signInWithGoogle()` in `auth-cloud-flow.ts` falls back to direct InstantDB queries to find the employee and shop:

```typescript
const employeesResult = await db.queryOnce({ employees: {} })
const existing = cloudEmployees.find((e) => e.email === email)
// ... then shop lookup
```

The identity is resolved via email matching against `employees.email`, which is an unreliable identity resolution method (email can change).

### Mobile Verdict

| Aspect | Status |
|--------|--------|
| Uses `CloudAuth.signInWithGoogleIdToken()` | ✅ |
| Correct `db.auth.signInWithGoogle()` InstantDB call | ✅ |
| `accessToken` semantics | 🔴 FABRICATED (userId used as token) |
| `employeeId` / `shopId` in StoredSession | 🔴 EMPTY — resolved via fallback email query |
| `refreshToken` semantics | 🔴 EMPTY |
| `deviceId` in StoredSession | 🔴 EMPTY |
| Identity resolution | ⚠️ EMAIL MATCHING (fragile) |

---

## REMOTE INSTANTDB VERIFICATION

### MCP Connected to InstantDB Cloud

**Endpoint**: InstantDB Cloud MCP (not `apiinstant.fidscript.com`)

The `/instant-self` MCP connects to `api.instantdb.com` (cloud), not the self-hosted `apiinstant.fidscript.com`. These are different systems.

**App verified**: `SOOSTORI` (id: `487be5c5-7615-4bbd-b3b7-3aa97154ca99`)

### Cloud Schema Findings

| Entity | Status | Notes |
|--------|--------|-------|
| `persons` | ✅ EXISTS | Fields: id, email, cloudUserId, displayName, phone, version |
| `shops` | ✅ EXISTS | Fields: id, name, slug, plan, status, ownerPersonId, currency, taxRate |
| `employees` | ✅ EXISTS | Fields: id, role, email, permissions, name, shopId, status, cloudId, businessId, phone |
| `devices` | ✅ EXISTS | Has `deviceId`, `deviceName`, `deviceType`, `status`, `isLanHost`, `hasPin`, `isPrimary` |
| `oauthSessions` | ❌ NOT IN CLOUD SCHEMA | Not found — does not exist in the Cloud app's schema |
| `memberships` | Not queried | — |

### Remote Schema Anomalies

1. **`devices` has both `isLanHost` AND `isPrimary`**: Remote schema has both fields. Local SDK schema only has `isLanHost`. Phase 9.1.1 migration added `isLanHost` — `isPrimary` may be a legacy field.

2. **`employees.businessId`** present in remote but NOT in local `@soostori/devices` interface. The acceptance doc said GAP-10 was "already correct" for `isLanHost` — this is true, but `businessId` vs `shopId` naming inconsistency exists at the remote level.

3. **`oauthSessions` absent from Cloud schema** — This is expected since `oauthSessions` is a custom entity created by the Web app (not part of the SDK schema). It likely lives in the self-hosted InstantDB's schema, not the Cloud app.

### Self-Hosted InstantDB Cannot Be Verified

The server `https://apiinstant.fidscript.com` returned HTTP 200 with a welcome page on `/`. No schema introspection endpoint is publicly accessible. No MCP tool can reach this self-hosted instance.

**This is the primary blocker for full Phase 1 verification.**

### clientName Verification

| Client | Value | Registered? |
|--------|-------|-------------|
| Mobile | `'soostoriandroid'` | 🔴 NOT VERIFIED — cannot query self-hosted InstantDB |
| Web | Uses PKCE exchange path, not `signInWithIdToken` | — |

---

## DEFECTS FOUND

### CRITICAL DEFECTS

#### DEFECT-01 — Mobile `accessToken` is fabricated from `userId`

**Severity**: CRITICAL
**Location**: `soostori-mobile/src/services/cloud-auth-backend.ts:cloudExchangeGoogleToken()`
**Evidence**:
```typescript
return {
  accessToken: userId,   // ← userId masquerading as access token
  refreshToken: '',       // ← empty
}
```
**Impact**: Any code using `session.accessToken` as a Bearer token authenticates with the InstantDB user ID. If this ID is exposed in logs or requests, it could be used to impersonate the user in InstantDB API calls that accept user IDs as identifiers.

**Fix required**: `cloudExchangeGoogleToken()` must return the actual session token from `db.auth.signInWithGoogle()`. If InstantDB returns no token (stateless), document this as intentional and update `StoredSession.accessToken` semantics accordingly.

#### DEFECT-02 — Mobile `employeeId` / `shopId` / `deviceId` always empty in StoredSession

**Severity**: CRITICAL
**Location**: `soostori-mobile/src/services/cloud-auth-backend.ts:cloudExchangeGoogleToken()`
**Evidence**: Function returns no `employeeId`, `shopId`, or `deviceId`.
**Impact**: Mobile's `StoredSession` is structurally incomplete. The identity chain is resolved post-hoc via email matching in `auth-cloud-flow.ts`, which is fragile and does not survive cold-start without network.

**Fix required**: Either (a) return these from `cloudExchangeGoogleToken()` using the result of `db.auth.signInWithGoogle()` plus a subsequent query, or (b) document that Mobile does not use `StoredSession` for identity and uses direct InstantDB queries instead.

#### DEFECT-03 — `oauthSessions` entity cannot be verified in self-hosted InstantDB

**Severity**: CRITICAL (verification blocker)
**Location**: Web backend
**Evidence**: MCP cannot reach `apiinstant.fidscript.com`. Cloud schema does not have `oauthSessions`. Web's `saveOAuthSession()` would fail at runtime against the self-hosted instance if the entity is not configured.
**Impact**: Web session persistence may fail in production if `oauthSessions` is not created in the self-hosted InstantDB.

**Fix required**: Verify that the self-hosted InstantDB at `apiinstant.fidscript.com` has the `oauthSessions` entity configured with the required schema fields.

### HIGH DEFECTS

#### DEFECT-04 — Remote schema has `isPrimary` and `isLanHost` on `devices`

**Severity**: HIGH
**Location**: Remote InstantDB schema (cloud inspection)
**Evidence**: `devices` entity has both `isPrimary` and `isLanHost` fields.
**Impact**: Local SDK uses `isLanHost`. Phase 9.1.1 migration may have added `isLanHost` but left `isPrimary` (legacy). Unclear which field is authoritative.
**Fix required**: Determine which field the self-hosted InstantDB uses for primary device detection and align SDK accordingly.

#### DEFECT-05 — Mobile identity resolution via email matching

**Severity**: HIGH
**Location**: `soostori-mobile/src/hooks/auth-cloud-flow.ts:signInWithGoogle()`
**Evidence**:
```typescript
const existing = cloudEmployees.find((e) => e.email === email)
```
**Impact**: If two employees share the same email (case variations, typos), the first match wins. Email is not a stable identity key.
**Fix required**: Resolve identity using the InstantDB user ID returned by `db.auth.signInWithGoogle()` rather than email matching.

### MEDIUM DEFECTS

#### DEFECT-06 — Mobile `refreshSession` / `revokeSession` not implemented

**Severity**: MEDIUM
**Location**: `soostori-mobile/src/hooks/auth-cloud-flow.ts:buildAuthApiClient()`
**Evidence**: All session management methods return `{ error: { code: 'UNSUPPORTED' } }`
**Impact**: Mobile sessions cannot be refreshed or revoked via the SDK API.

#### DEFECT-07 — `isPrimary` vs `isLanHost` naming in SDK interfaces

**Severity**: MEDIUM
**Location**: `@soostori/devices` `Device` interface uses `isLanHost`. Desktop adapter correctly maps `is_host → isLanHost`. But remote schema has `isPrimary` AND `isLanHost`.
**Impact**: Unclear which field is authoritative for primary device detection.

---

## VERIFICATION SUMMARY TABLE

| Layer | Status | Evidence |
|-------|--------|---------|
| SDK Google ID-token primitive | 🟢 VERIFIED | `cloud-auth.ts:528` — calls `api.signInWithIdToken` |
| SDK Web PKCE | 🟢 VERIFIED | `cloud-auth.ts:438,474` — complete PKCE implementation |
| SDK Mobile Google flow | 🟢 VERIFIED | Mobile calls `db.auth.signInWithGoogle()` correctly |
| Web integration (source) | 🟢 VERIFIED | Web uses `CloudAuth` + `HttpAuthApiClient` + InstantDB `oauthSessions` |
| Mobile integration (source) | 🟡 GAP FOUND | DEFECT-01, DEFECT-02 — fabricated session fields |
| InstantDB authentication (cloud) | 🟢 VERIFIED | `db.auth.signInWithGoogle()` works — person exists in cloud DB |
| Web clientName | ⚪ NOT VERIFIED | Web uses PKCE exchange, not `signInWithIdToken` |
| Mobile clientName (`soostoriandroid`) | 🔴 BLOCKED | Cannot verify against self-hosted InstantDB |
| appId (`487be5c5-...`) | 🟢 VERIFIED | Cloud MCP confirms this is the SOOSTORI app |
| `oauthSessions` entity | 🔴 BLOCKED | Cannot verify against self-hosted; absent from cloud schema |
| `devices.isLanHost` | 🟡 GAP FOUND | Remote has both `isPrimary` and `isLanHost` |
| Person resolution | 🟢 VERIFIED | Cloud has person `p@p.k` with `cloudUserId: cloud-person-1` |
| Business resolution | 🟢 VERIFIED | Cloud has shop `Probe` (`id: 00000000-0000-0000-0000-000000000001`) |
| Membership resolution | 🟡 GAP FOUND | `employees` query fails in MCP (permission or schema issue) |
| Role resolution | ⚪ NOT VERIFIED | Cannot query `employees.role` link |
| Device resolution | 🟡 GAP FOUND | DEFECT-04 — `isPrimary`/`isLanHost` ambiguity |
| Session semantics (Web) | 🟢 VERIFIED | `saveOAuthSession` → InstantDB `oauthSessions` |
| Session semantics (Mobile) | 🔴 DEFECT | DEFECT-01 — `accessToken = userId` |
| PKCE state handling | 🟢 VERIFIED | `state` and `codeVerifier` in cookies, HttpOnly |
| ID-token validation | 🟢 VERIFIED | InstantDB verifies Google JWT signature |
| No auto account merge | 🟢 VERIFIED | `PERSON_NOT_FOUND` returned if no membership |

---

## PHASE 1 ACCEPTANCE ARTIFACT

### Status: ⚠️ NOT ACCEPTED — CRITICAL DEFECTS BLOCK ACCEPTANCE

The acceptance doc dated 2026-09-12 was based on source inspection and assumed correct implementation. Runtime verification reveals critical defects in Mobile's session token handling and unverified remote schema assumptions.

### Blocking Issues

| # | Defect | Severity | Must Fix Before Acceptance |
|---|--------|----------|--------------------------|
| DEFECT-01 | Mobile `accessToken = userId` fabricated | CRITICAL | YES |
| DEFECT-02 | Mobile `employeeId/shopId/deviceId` always empty | CRITICAL | YES |
| DEFECT-03 | `oauthSessions` entity unverified in self-hosted InstantDB | CRITICAL | YES |
| DEFECT-04 | `isPrimary`/`isLanHost` dual fields in remote schema | HIGH | YES |
| DEFECT-05 | Mobile identity via email matching | HIGH | YES |

### Fixes Required

1. **DEFECT-01 + DEFECT-02**: `cloudExchangeGoogleToken()` must return real `accessToken`, `employeeId`, `shopId`, `deviceId` from InstantDB query results. If InstantDB's `db.auth.signInWithGoogle()` doesn't return these, add a follow-up query to resolve them from `employees` table using the returned `userId`.

2. **DEFECT-03**: Self-hosted InstantDB must be verified to have `oauthSessions` entity with schema: `{ id, sessionToken, userId, storedSession, expiresAt, createdAt }`. This is a backend deployment verification.

3. **DEFECT-04**: Verify which field (`isPrimary` or `isLanHost`) the self-hosted InstantDB actually uses for primary device election. Align SDK `Device.isLanHost` usage accordingly.

4. **DEFECT-05**: Use `userId` (from `db.auth.signInWithGoogle().user.id`) to query `employees` directly by `personId` (not email), then resolve `shop` from the employee's `shopId`.

### Repository Status

| Repo | Commit | Status |
|------|---------|--------|
| `soostori-sdk` | `4b85ef7` | 🟢 Current (main) |
| `soostori` (web) | `main` | 🟡 Uses SDK, CONVERGENT but `oauthSessions` unverified |
| `soostori-mobile` | `master` | 🔴 CRITICAL DEFECTS |
| `soostori-desktop` | — | ⚪ Not inspected this session |

### Tests

| Suite | Result |
|-------|--------|
| SDK auth tests (144 tests) | ✅ 144/144 passing |
| SDK build | ✅ clean |
| Web runtime | 🔴 BLOCKED — requires deployment |
| Mobile runtime | 🔴 BLOCKED — requires deployment + DEFECT-01/02 fix |

### Evidence

**Source inspected**:
- `packages/auth/src/cloud-auth.ts` — complete SDK auth implementation
- `packages/auth/src/mock-api-client.ts` — CRITICAL: default mock returns no `employeeId/shopId/deviceId`
- `soostori/src/lib/auth/cloud-auth-client.ts` — Web CloudAuth singleton
- `soostori/src/lib/auth/oauth-session.ts` — Web session persistence via InstantDB
- `soostori/src/lib/auth/session-server.ts` — Web identity resolution
- `soostori/src/pages/api/auth/callback/google.ts` — Web OAuth callback
- `soostori/src/pages/api/auth/google/exchange.ts` — Web PKCE exchange
- `soostori-mobile/src/services/cloud-auth-backend.ts` — Mobile auth (DEFECT-01, DEFECT-02)
- `soostori-mobile/src/hooks/auth-cloud-flow.ts` — Mobile SDK bridge (DEFECT-05)

**Remote verified**:
- `/instant-self` MCP → InstantDB Cloud → app `487be5c5-7615-4bbd-b3b7-3aa97154ca99` (SOOSTORI)
- `oauthSessions` entity absent from Cloud schema
- `devices` entity has both `isPrimary` AND `isLanHost` in Cloud schema
- `persons` table has `cloudUserId` field for InstantDB ↔ Google identity mapping
- Probe person (`p@p.k`) and probe shop (`Probe`) confirmed in Cloud DB

**Not verifiable**:
- Self-hosted `apiinstant.fidscript.com` schema (no access)
- Whether `oauthSessions` entity exists in self-hosted InstantDB
- Whether `clientName: 'soostoriandroid'` is registered in self-hosted InstantDB
- Actual `employees` data in self-hosted InstantDB (query failed in Cloud)

---

## RECOMMENDED ACTIONS

### Immediate (before Phase 2)

1. **Fix DEFECT-01 + DEFECT-02** in Mobile: `cloudExchangeGoogleToken()` must return real session values from InstantDB query results
2. **Verify `oauthSessions` entity** in self-hosted InstantDB deployment
3. **Verify `clientName: 'soostoriandroid'`** is registered in self-hosted InstantDB
4. **Clarify `isPrimary` vs `isLanHost`** — determine which field self-hosted InstantDB uses

### Phase 2 Scope

Once the above are verified/fixed:
- Re-run acceptance verification
- Test actual auth flows on staging deployment
- Verify Mobile → Web → Desktop cross-platform identity consistency
