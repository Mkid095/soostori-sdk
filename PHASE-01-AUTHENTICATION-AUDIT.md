# PHASE 1 — AUTHENTICATION & IDENTITY FOUNDATION
## Audit Document v1.0 — 2026-09-12

**Author**: joan (orchestrator)
**Status**: 🔵 AUDIT IN PROGRESS
**Next action**: Dispatch SDK agent to implement fixes, then Desktop/Mobile/Web agents

---

## What this document is

This is the **audit brief and fix mandate** for the Soostori SDK agent.

The SDK agent reads this file, implements or fixes everything described below, commits, pushes, and publishes to NPM. After that, Desktop/Mobile/Web each receive their own Phase 1 brief telling them what the newly published SDK contract requires them to fix.

---

## How Phase 1 works

```
SDK agent reads this document
         ↓
Audits current SDK state against canonical vision
         ↓
Identifies gaps (SDK vs. published contract vs. vision)
         ↓
Fixes gaps in SDK packages
         ↓
Commits + pushes + publishes to NPM
         ↓
Desktop/Mobile/Web agents receive their own Phase 1 briefs
         ↓
CROSS-SYSTEM INTEGRATION TEST
         ↓
PHASE 1 ACCEPTED → PHASE-01-AUTHENTICATION-ACCEPTANCE.md produced
```

---

## The vision: one coherent identity architecture

```
Google OAuth  ──────────────────────────────► Person
Email/Password  ──────────────────────────► Person
     │
     ▼
  Session (accessToken + refreshToken)
     │
     ▼
  Identity Resolution: Person → Business → Membership → Role → Device
     │
     ▼
  Operational PIN (device-local, separate from cloud session)
     │
     ▼
  Trusted Devices (cloud-managed, separate from PIN)
```

**No platform invents its own identity model. The SDK is the authority.**

---

## Current State of Each Repository

| Repo | Head commit | `@soostori/auth` version | Notes |
|------|-------------|--------------------------|-------|
| `soostori-sdk` | `c87f4d7` | `0.1.0-alpha.6` | Published to NPM |
| `soostori-desktop` | `a63978d` | `^0.1.0-alpha.6` | OK |
| `soostori-mobile` | `dc6703c` | `^0.1.0-alpha.6` | OK |
| `soostori` (web) | `c758a962` | `0.1.0-alpha.5` | ⚠️ OUTDATED |

---

## PART A — SDK SELF-AUDIT

### A1 — `@soostori/auth` Published Contract Audit

**Read first**:
- `packages/auth/src/cloud-auth.ts`
- `packages/auth/src/operational-auth.ts`
- `FINAL_SDK_CONTRACT_REPORT.md`

#### A1.1 — CloudAuth class: verify every method

| # | Method | Expected return | Action |
|---|--------|-----------------|--------|
| 1 | `signInWithGoogle(config)` | `AuthResult<GoogleSignInPartial>` | Verify |
| 2 | `handleOAuthCallback(partial, codeVerifier, redirectUri)` | `AuthResult<GoogleSignInResult>` | Verify |
| 3 | `signInWithGoogleIdToken(params)` | Mobile Google ID token flow | Verify |
| 4 | `signInWithEmail(email, password)` | Email/password sign-in | Verify |
| 5 | `registerWithEmail(email, password, name)` | Registration with email verification | Verify |
| 6 | `verifyEmailAddress(token)` | Email verification | Verify |
| 7 | `resetPassword(email)` | Password reset request | Verify |
| 8 | `completePasswordReset(token, newPassword)` | Password reset completion | Verify |
| 9 | `refreshSession()` | Token refresh with offline fallback | Verify |
| 10 | `restoreSession()` | Session restore on app startup | Verify |
| 11 | `signOut()` | Clear local + revoke server token | Verify |
| 12 | `registerTrustedDevice(name)` | Add trusted device | Verify |
| 13 | `listTrustedDevices()` | List trusted devices | Verify |
| 14 | `removeTrustedDevice(deviceId)` | Revoke trusted device | Verify |

#### A1.2 — StoredSession vs AuthSession contract

**StoredSession** (persisted locally — fields populated from API response):
```
userId, employeeId, shopId, deviceId, email,
accessToken, refreshToken, createdAt, expiresAt, lastValidatedAt
```

**AuthSession** (in-memory, returned to callers):
```
userId, shopId?, employeeId?, deviceId?, email, createdAt, expiresAt
```

**⚠️ GAP-01 — StoredSession fields always empty**:
`_storeSession()` in `cloud-auth.ts` lines 776-799 does NOT receive `employeeId`, `shopId`, `deviceId` from the API response. It sets them all to `''`. These MUST be populated.

**Fix required**: `GoogleSignInResult`, `SignInResult`, and `PasswordResetCompleteResult` API response types must include `employeeId`, `shopId`, `deviceId`. `_storeSession()` must extract and store them.

#### A1.3 — OperationalAuth class completeness

**Read**: `packages/auth/src/operational-auth.ts`

| # | Method | Purpose | Action |
|---|--------|---------|--------|
| 1 | `setupPin()` | First device PIN setup | Verify |
| 2 | `verifyPin()` | PIN verification for operational session | Verify |
| 3 | `changePin()` | Change PIN with old PIN verification | Verify |
| 4 | `hasPinEnrolled()` | Check if device has PIN | Verify |
| 5 | `clearPin()` | Clear PIN | Verify |
| 6 | `getEnrollmentState()` | Get device enrollment state | Verify |
| 7 | `beginEnrollment()` | Begin cross-device enrollment | Verify |
| 8 | `completeEnrollmentWithCloudVerify()` | Complete enrollment with cloud token | Verify |
| 9 | `requestPinRecovery()` | Initiate PIN recovery via email | Verify |
| 10 | `verifyPinRecoveryCode()` | Verify recovery code | Verify |
| 11 | `resetPinWithRecovery()` | Reset PIN with recovery token | Verify |
| 12 | `isWithinOfflineEntitlement()` | Check offline entitlement window | Verify |
| 13 | `isSessionExpired()` | Check operational session expiry | Verify |
| 14 | `serializeSession()` / `deserializeSession()` | Session persistence | Verify |

#### A1.4 — AuthApiClient interface completeness

**Read**: `packages/auth/src/cloud-auth.ts` lines 158-298 (AuthApiClient interface)

**Read**: `electron/auth/fidscript-auth-api.ts` (FIDScriptAuthApiClient implementation)

**Verify every AuthApiClient method is implemented** in FIDScriptAuthApiClient:

**OAuth / Identity**:
- `exchangeGoogleCode(code, codeVerifier, redirectUri)`
- `linkGoogleAccount(idToken, sessionAccessToken)`
- `signInWithIdToken(clientName, idToken)`
- `registerEmail(email, password, employeeName)`
- `verifyEmail(token)`
- `requestPasswordReset(email)`
- `completePasswordReset(token, newPassword)`
- `signInEmail(email, password)`
- `refreshSession(refreshToken)`
- `revokeSession(accessToken)`
- `registerTrustedDevice(deviceToken, deviceName, accessToken)`
- `listTrustedDevices(accessToken)`
- `removeTrustedDevice(deviceId, accessToken)`

**Device enrollment**:
- `getDeviceStatus(shopId, deviceId)`
- `createDeviceEnrollment(shopId, deviceId, deviceName)`
- `verifyPinForEnrollment(employeeId, pinProof, shopId, deviceId)`
- `consumeEnrollmentToken(...)`
- `changePin(...)`

**PIN recovery**:
- `requestPinRecovery(employeeId)`
- `verifyPinRecoveryCode(employeeId, code)`
- `resetPin(...)`

**Device management**:
- `listEnrolledDevices(employeeId, shopId)`
- `revokeDevice(employeeId, deviceId)`

**Subscription**:
- `getSubscriptionStatus(shopId)`

#### A1.5 — AuthEvent system

Verify `AuthEvent` type covers all emitted events:

```
SIGNED_IN, SIGNED_OUT, SESSION_REFRESHED, SESSION_EXPIRED,
EMAIL_VERIFIED, DEVICE_REGISTERED, DEVICE_REVOKED, ERROR
```

Verify every event fires correctly from `CloudAuth` and `OperationalAuth`.

#### A1.6 — Cross-device PIN enrollment flow

**Read**: `packages/auth/src/operational-auth.ts`

Verify this exact flow is implemented:

```
Device B (new device):
  1. getEnrollmentState() → PIN_VERIFICATION_REQUIRED
  2. beginEnrollment() → get challenge or initiate PIN proof
  3. Derive pinProof = PBKDF2(pin, canonical_salt_from_backend)
  4. verifyPinForEnrollment(employeeId, pinProof, shopId, deviceId)
     → Returns enrollmentToken (5 min TTL)
  5. consumeEnrollmentToken({ enrollmentToken, employeeId, shopId,
        deviceId, newPinVerifier, newPinSalt })
     → Backend atomically: validates token + updates canonical verifier
       + marks Device.hasPin=true + marks token consumed
  6. OPERATIONAL
```

If any step is missing or incorrect, fix it.

---

### A2 — `@soostori/core` Audit

**Read**: `packages/core/src/index.ts`

Verify all branded ID types are exported and used correctly everywhere:

```typescript
UserId, EmployeeId, DeviceId, ShopId, BusinessId,
SaleId, ProductId, CategoryId, CustomerId, InvoiceId,
ReceiptId, SubscriptionId, PaymentId
```

Every function accepting or returning a branded ID must use the branded type, not raw `string`.

---

### A3 — Web platform export

**Read**: `packages/auth/src/index.ts`, `packages/auth/package.json` exports field

The web platform (Next.js) must be able to `import { CloudAuth } from '@soostori/auth'`.

Verify the current export map is sufficient for web. If not, add a browser-specific entry to `package.json` exports.

---

### A4 — Test coverage

**Run**: `cd packages/auth && npm test`

**Requirement**: All 106 tests must pass. No skips, no deletions.

---

## PART B — DESKTOP INTEGRATION AUDIT

**Read first**:
- `electron/auth/desktop-cloud-auth.ts`
- `electron/auth/fidscript-auth-api.ts`
- `electron/auth/desktop-operational-auth.ts`
- `electron/ipc-handlers/cloud-auth-handlers.ts`
- `electron/preload/handlers-auth.ts`

### B1 — SDK consumption

Desktop `package.json` already declares `"@soostori/auth": "^0.1.0-alpha.6"` ✓

Verify `DesktopCloudAuth extends CloudAuth` correctly overrides:
- `_saveStoredSession()` → ElectronStore
- `_loadStoredSession()` → ElectronStore
- `_clearStoredSession()` → ElectronStore

### B2 — Google OAuth (PKCE)

Desktop uses system-browser PKCE OAuth (not webview).

Verify:
- `oauth-callback-server.ts` handles the redirect URI on a local port
- `oauth-server-state.ts` manages state between main and renderer
- `handleOAuthCallback()` is called with `{ state, code }` after redirect

### B3 — OperationalAuth on Desktop

`DesktopOperationalAuth` must use Electron safe storage for PIN, not a plain file.

Verify `_getPinStorage()` or equivalent uses `electron safeStorage` API.

### B4 — IPC bridge completeness

**Every** `CloudAuth` and `OperationalAuth` operation must be callable from the renderer via IPC.

If a method exists in the SDK class but has no IPC handler in `cloud-auth-handlers.ts`, the Desktop UI cannot use it. Audit and add any missing IPC handlers.

### B5 — Identity chain population after sign-in

After `exchangeGoogleCode` or `signInWithIdToken` succeeds, Desktop must:

1. Call `syncShopFromCloud()` — populate `shops` table in local InstantDB
2. Call `syncEmployeesFromCloud()` — populate `employees` table
3. Call `registerDevice()` — ensure `devices` table has this device record

Verify this chain is implemented. If missing, implement it.

---

## PART C — MOBILE INTEGRATION AUDIT

**Read first**:
- `src/services/cloud-auth-backend.ts`
- `src/hooks/auth-cloud-flow.ts`
- `src/hooks/auth-pin-flow.ts`
- `src/hooks/auth-device-enrollment.ts`
- `src/services/cloud-auth-employee.ts`
- `src/services/cloud-auth-device.ts`

### C1 — SDK consumption

Mobile `package.json` declares `"@soostori/auth": "^0.1.0-alpha.6"` ✓

**⚠️ CRITICAL AUDIT**: Determine whether Mobile actually uses `@soostori/auth`'s `CloudAuth` class or has a completely parallel implementation.

`src/services/cloud-auth-backend.ts` implements `cloudSendMagicCode` and `cloudVerifyMagicCode` using InstantDB directly. This bypasses `CloudAuth.signInWithGoogleIdToken()`.

If Mobile uses a custom auth implementation instead of the SDK's `CloudAuth`:
- Either migrate to the SDK's `CloudAuth` (preferred)
- Or add magic-code as a new method in the SDK's `AuthApiClient` interface so all platforms share the same contract

### C2 — Google ID Token flow

Mobile must use `GoogleSignin.signIn()` to get an ID token, then call `CloudAuth.signInWithGoogleIdToken({ idToken, clientName })`.

Verify `src/hooks/auth-cloud-flow.ts` does exactly this.

`clientName` must be the FIDScript app name from `@soostori/auth`'s `signInWithIdToken()` signature.

### C3 — OperationalAuth on Mobile

Mobile must NOT use `DesktopOperationalAuth`. It must use the React Native-specific PIN implementation.

**Read**: `packages/auth/src/pin-rn.ts` — this is the correct RN implementation.

Verify Mobile imports via `@soostori/auth/react-native` export and implements the platform storage hooks.

### C4 — Session storage on Mobile

`CloudAuth` requires platform overrides for `_saveStoredSession`, `_loadStoredSession`, `_clearStoredSession`.

Mobile must implement these using `@react-native-async-storage/async-storage` via a React Native platform adapter.

Audit whether this is implemented. If not, implement it.

### C5 — Identity chain after sign-in

After `signInWithGoogleIdToken` succeeds, Mobile must:
- Call `resolveOrCreateEmployee()` in `cloud-auth-employee.ts`
- Call `resolveOrRegisterDevice()` in `cloud-auth-device.ts`
- Store `shopId`, `employeeId` in AsyncStorage

Verify this chain is implemented.

---

## PART D — WEB INTEGRATION AUDIT

**Read first**:
- `src/lib/auth/session-server.ts`
- `src/lib/auth/session-types.ts`
- `src/pages/login.tsx`
- `src/features/auth/components/LoginForm.tsx`

### D1 — SDK version outdated

**⚠️ CRITICAL**: Web `package.json` declares `"@soostori/auth": "0.1.0-alpha.5"` but Desktop and Mobile both reference `^0.1.0-alpha.6`.

Fix: Update Web to `"@soostori/auth": "^0.1.0-alpha.6"`.

### D2 — Web does not use `@soostori/auth`'s CloudAuth

Web uses a completely different auth system:
- `src/lib/auth/session-server.ts` — Prisma-based session management
- Cookie-based sessions (`session_token` cookie, not access/refresh tokens)
- Direct Prisma database queries for user/shopMember lookups

This is a **major architectural gap**. The Soostori vision requires all POS apps (Desktop, Mobile, Web) to share the same SDK auth contract.

**Decision required from Ken**: Should Web consume `@soostori/auth`'s `CloudAuth` like Desktop and Mobile? If yes, this must be fixed as part of Phase 1. If no, document this as an explicit architectural exception.

### D3 — Google OAuth on Web

Audit `src/features/auth/components/LoginForm.tsx` to determine:
- Does Web implement Google OAuth?
- If so, does it use `@soostori/auth`'s PKCE flow or its own implementation?
- If its own implementation, does it produce the same `StoredSession` structure?

### D4 — Session model mismatch

SDK uses:
```
StoredSession { userId, employeeId, shopId, deviceId, accessToken, refreshToken, ... }
```

Web uses:
```
Session { token (cookie), userId (Prisma join), activeShopId }
```

These are fundamentally different models. Without alignment, cross-platform identity cannot work.

---

## PART E — CROSS-SYSTEM IDENTITY AUDIT

### E1 — Identity chain consistency

Verify all three platforms implement the same identity chain:

```
Person (FIDScript $users / Prisma User)
  └── has → Memberships (employees / shopMembers)
        └── each has → Role (owner/manager/cashier/attendant)
        └── each scoped to → Business (shops)
        └── each uses → Device (devices)
```

| Platform | Person | Membership | Role | Business | Device |
|----------|--------|------------|------|----------|--------|
| Desktop | $users | employees | ✓ | shops | devices |
| Mobile | $users | employees | ✓ | shops | devices |
| Web | Prisma User | shopMembers | ✓ | shops | — |

Web does not have a Device model. This is a gap.

### E2 — Enrollment state machine

Verify all platforms handle these states:

**First device enrollment**:
```
DEVICE_NOT_ENROLLED → setupPin() → OPERATIONAL
```

**Cross-device enrollment**:
```
DEVICE_NOT_ENROLLED
  → beginEnrollment() + verifyPinForEnrollment()
  → consumeEnrollmentToken()
  → OPERATIONAL
```

**PIN recovery**:
```
OPERATIONAL
  → requestPinRecovery() → email sent
  → verifyPinRecoveryCode() → recoveryAuthToken
  → resetPinWithRecovery() → new PIN set, other devices de-enrolled
```

### E3 — Session persistence

| Platform | Session storage | Uses CloudAuth? |
|----------|----------------|----------------|
| Desktop | ElectronStore via DesktopCloudAuth | Yes ✓ |
| Mobile | AsyncStorage via RN platform adapter | Partial ⚠️ |
| Web | Cookie + Prisma | No ✗ |

---

## PART F — FIDScript BACKEND AUDIT

**Use `instant-self` MCP** to audit the actual InstantDB/FIDScript backend.

### F1 — Auth endpoints

Verify these REST endpoints exist and match `AuthApiClient` interface:

```
POST /api/v1/apps/{appId}/auth/exchange-google-code
POST /api/v1/apps/{appId}/auth/signin-with-id-token
POST /api/v1/apps/{appId}/auth/signin-with-magic-code   (if magic-code path exists)
POST /api/v1/apps/{appId}/auth/register-email
POST /api/v1/apps/{appId}/auth/verify-email
POST /api/v1/apps/{appId}/auth/signin-email
POST /api/v1/apps/{appId}/auth/refresh-session
POST /api/v1/apps/{appId}/auth/revoke-session
POST /api/v1/apps/{appId}/enrollment/device-status
POST /api/v1/apps/{appId}/enrollment/create
POST /api/v1/apps/{appId}/enrollment/verify-pin
POST /api/v1/apps/{appId}/enrollment/consume-token
```

### F2 — Data model

Query InstantDB schema to verify tables exist:

```instaq
{ users: $users {}, shops: shops {}, employees: employees {}, devices: devices {} }
```

Verify field names match what the SDK expects.

---

## PART G — FIX MANDATE

### MUST FIX (block Phase 1 acceptance)

| Gap | Description | Location |
|-----|-------------|----------|
| **GAP-01** | `StoredSession.employeeId/shopId/deviceId` always `''` — not populated from API | `cloud-auth.ts` `_storeSession()` + response types |
| **GAP-02** | `GoogleSignInResult` missing `employeeId`, `shopId`, `deviceId` fields | `cloud-auth.ts` interface |
| **GAP-03** | `SignInResult` missing `employeeId`, `shopId`, `deviceId` fields | `cloud-auth.ts` interface |
| **GAP-04** | Cross-device PIN enrollment flow incomplete or missing steps | `operational-auth.ts` |
| **GAP-05** | Web platform export not verified | `packages/auth/src/index.ts`, `package.json` exports |
| **GAP-06** | `FIDScriptAuthApiClient` — verify all `AuthApiClient` methods implemented | `electron/auth/fidscript-auth-api.ts` |
| **GAP-07** | Web `package.json` outdated: `@soostori/auth` is `0.1.0-alpha.5`, should be `^0.1.0-alpha.6` | Web `package.json` |
| **GAP-08** | Web uses Prisma/cookie auth instead of `@soostori/auth` `CloudAuth` | Web auth system |

### MUST VERIFY (already implemented, confirm still works)

| # | Item | Expected |
|---|------|----------|
| 1 | All 106 existing auth tests pass | `cd packages/auth && npm test` → 100% pass |
| 2 | PKCE Google OAuth on Desktop | Opens system browser, handles redirect |
| 3 | Mobile Google ID token via `CloudAuth.signInWithGoogleIdToken()` | Confirmed or flagged |
| 4 | `OperationalAuth` first-device PIN enrollment | Works on Desktop and Mobile |
| 5 | `AuthEvent` system fires for all auth state changes | All 8 event types emit correctly |
| 6 | Session refresh with offline fallback | Stale session → network available → refresh; offline + not stale → continues |
| 7 | PIN recovery flow (request → verify → reset) | Full 3-step flow works |
| 8 | Desktop IPC bridge for all auth operations | All `CloudAuth` methods accessible from renderer |

---

## PART H — COMMIT, PUSH, AND PUBLISH

After all fixes are verified:

```bash
# 1. Update CHANGELOG.md in SDK root — add entry for Phase 1 fixes

# 2. Bump version in packages/auth/package.json to 0.1.0-alpha.7

# 3. If @soostori/core changed, bump to 0.1.0-alpha.4 in packages/core/package.json

# 4. Commit
git add .
git commit -m "fix(auth): phase-1 gaps — populate employeeId/shopId/deviceId in StoredSession,
         complete cross-device enrollment flow, add missing AuthApiClient methods"

# 5. Push
git push origin main

# 6. Publish to NPM
cd packages/auth && npm publish --access public
# Verify: npm view @soostori/auth versions

# 7. Also publish any other changed packages
```

---

## OUTPUT: PHASE-01-SDK-AUDIT-REPORT.md

After completing this work, produce a file `PHASE-01-SDK-AUDIT-REPORT.md` in the SDK root containing:

```
- Which gaps were fixed (GAP-01 through GAP-08)
- Which gaps were already correct
- Any new gaps discovered during implementation
- Final published package version(s) and NPM package name(s)
- npm view @soostori/auth versions output (confirm new version present)
- git commit SHA
- npm test results (all passing / failures with names)
- Which Desktop/Mobile/Web version requirements changed
```

This report is what gets fed to Desktop, Mobile, and Web agents in their Phase 1 briefs.
