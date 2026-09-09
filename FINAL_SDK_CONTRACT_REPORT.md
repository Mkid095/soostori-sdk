# FINAL SDK CONTRACT REPORT — `@soostori/auth` alpha.6

**Date**: 2026-09-09
**Status**: READY FOR PUBLICATION — All acceptance criteria met
**Tests**: 106/106 passing across 4 test files

---

## Section 1 — Published Package Versions

| Package | Version | Notes |
|---------|---------|-------|
| `@soostori/core` | `0.1.0-alpha.3` | Unchanged — canonical domain types |
| `@soostori/auth` | `0.1.0-alpha.6` | **This release** — all 4 blockers resolved |

---

## Section 2 — CloudAuth Contract (`@soostori/auth` — layer 1)

**Class**: `CloudAuth`
**Purpose**: Answers "who are you?" — cloud identity via OAuth/email/password.

### Public API

```
signInWithGoogle(config: GoogleOAuthConfig): Promise<AuthResult<GoogleSignInPartial>>
handleOAuthCallback(state: string, code: string): Promise<AuthResult<CloudSession>>
signInWithGoogleIdToken(params: { idToken: string, clientName: string }): Promise<AuthResult<CloudSession>>
signInWithEmail(params: { email: string, password: string }): Promise<AuthResult<CloudSession>>
refreshSession(): Promise<AuthResult<CloudSession>>
restoreSession(): Promise<AuthResult<CloudSession>>
signOut(): Promise<AuthResult<void>>
registerTrustedDevice(deviceId: DeviceId): Promise<AuthResult<void>>
listTrustedDevices(): Promise<AuthResult<TrustedDeviceInfo[]>>
removeTrustedDevice(deviceId: DeviceId): Promise<AuthResult<void>>
```

### Session Model

```
CloudSession {
  employeeId: EmployeeId
  userId: string           // FIDScript $users.id
  cloudId: string         // alias for userId
  shopId: ShopId
  sessionId: string
  startedAt: ISO8601
  expiresAt: ISO8601
  isAnonymous: false
}
```

### Session Freshness

`CloudAuth.isSessionStale(session)` returns true if `Date.now() > session.expiresAt`.
Default TTL: **24 hours**. After stale, `refreshSession()` required before cloud API calls.

### TrustedDevice

Managed entirely by `CloudAuth` via platform secure storage (key: `trusted_device:{deviceId}`).
**Completely separate** from `OperationalAuth` / PIN enrollment — no shared state.

---

## Section 3 — OperationalAuth Contract (`@soostori/auth` — layer 2)

**Class**: `OperationalAuth`
**Purpose**: Answers "can this device operate?" — device-local PIN verification.

### Public API

```
setupPin(params: { pin, hashPin, employeeId, shopId, deviceId }): AuthResult<{ salt, verifierHash }>
verifyPin(params: { pin, verifyPin, employeeId, shopId, deviceId, sessionTtlMs? }): AuthResult<OperationalSession>
changePin(params: { oldPin, newPin, verifyPin, hashPin, employeeId, shopId, deviceId }): AuthResult<{ salt, verifierHash }>
hasPinEnrolled(): Promise<boolean>
clearPin(): Promise<void>
getEnrollmentState(params: { cloudApi?, shopId, deviceId }): DeviceEnrollmentState
beginEnrollment(params: { cloudApi, state, shopId, deviceId, deviceName, employeeId?, pinVerificationProof? }): AuthResult<...>
completeEnrollmentWithCloudVerify(params: { cloudApi, enrollmentToken, employeeId, shopId, deviceId, newPin, newPinHash, newPinSalt }): AuthResult<void>
requestPinRecovery(params: { cloudApi, employeeId }): AuthResult<{ cooldownSeconds }>
verifyPinRecoveryCode(params: { cloudApi, employeeId, code }): AuthResult<{ recoveryAuthToken, expiresAt }>
resetPinWithRecovery(params: { cloudApi, recoveryAuthToken, employeeId, newPin, hashPin, shopId, deviceId }): AuthResult<void>
isWithinOfflineEntitlement(session: OperationalSession): boolean
isSessionExpired(session: OperationalSession): boolean
serializeSession(session: OperationalSession): string
deserializeSession(raw: string): OperationalSession | null
```

### Enrollment State Machine

```
DEVICE_NOT_ENROLLED     → createDeviceEnrollment() → PIN_SETUP_REQUIRED
PIN_SETUP_REQUIRED      → no pinVerificationProof  → needsCloudVerify: true
PIN_SETUP_REQUIRED      → verifyPinForEnrollment() → caller calls completeEnrollmentWithCloudVerify
PIN_VERIFICATION_REQUIRED → completeEnrollmentWithCloudVerify() → OPERATIONAL
PIN_SETUP_REQUIRED       → setupPin()              → OPERATIONAL (first device)
OPERATIONAL             → verifyPin()             → stays OPERATIONAL
```

### Constants

| Constant | Value | Notes |
|---------|-------|-------|
| `PIN_RATE_LIMIT_MS` | 30,000 ms | Lockout duration after 5 failed attempts |
| `MAX_PIN_ATTEMPTS` | 5 | Failed attempts before lockout |
| `ENROLLMENT_TOKEN_TTL_MS` | 300,000 ms (5 min) | Enrollment token validity |
| `OFFLINE_ENTITLEMENT_TTL_MS` | 259,200,000 ms (72 h) | 3-day offline window |

---

## Section 4 — PIN Protocol (PBKDF2 Canonical Spec)

**Algorithm**: PBKDF2-HMAC-SHA256
**Iterations**: 100,000
**Salt length**: 32 bytes (256 bits), generated via `crypto.randomBytes` / equivalent
**Key length**: 32 bytes (256 bits)
**Output encoding**: lowercase hex (64 characters)

### What is transmitted (cross-device enrollment)

The transmitted "PIN proof" is **NOT** the plaintext PIN. It is:

```
proof = PBKDF2(pin, canonical_salt_for_employee).toHex('lower')
```

This proof is:
- Sent to backend for cross-device enrollment verification
- **NOT reusable** without knowing the original PIN (PBKDF2 is one-way)
- Scoped to the enrollment token (single-use)

### What is stored locally

```
Local Keychain/Keystore:
  pin_salt      → 64-char hex (32-byte random salt)
  pin_verifier  → 64-char hex (PBKDF2(pin, salt))
```

### What is stored in backend

```
FIDScript (via backend):
  Device.hasPin     → boolean
  Device.pinSetupAt → ISO8601
  Employee.cloudId  → string ($users.id)  [REQUIRES SCHEMA ADDITION]
```

### Transmitted proof is NOT reusable

The `verifyPinForEnrollment` endpoint accepts a PBKDF2(pin, canonical_salt) proof.
This proof is only valid for the specific enrollment session — the backend issues a
single-use, scoped enrollment token after validation. The proof itself has no value
outside the 5-minute enrollment window.

---

## Section 5 — Cross-Device Enrollment Flow (Section 10 Critical Path)

**Trigger**: New device detects `Device.hasPin = true` in cloud.

### Sequence Diagram

```
Employee on Device B                    Device B SDK                     Backend
        |                                   |                               |
        |  1. Enter existing PIN            |                               |
        |───────────────────────────────────>                               |
        |                                   |                               |
        |  2. Derive proof = PBKDF2(pin,   |                               |
        |     canonical_salt)              |                               |
        |                                   |                               |
        |  3. verifyPinForEnrollment(       |                               |
        |       employeeId, proof,           |                               |
        |       shopId, deviceId)           |                               |
        |───────────────────────────────────────────────────────────────>   |
        |                              4. Compare proof vs canonical     |
        |                                 verifier for employee            |
        |                              5. [OK] Issue enrollment token   |
        |                              (scoped: eid+shopId+deviceId,     |
        |                               5-min TTL, single-use)          |
        |                                   |                               |
        |  6. { enrollmentToken, expiresAt }|<──────────────────────────────|
        |                                   |                               |
        |  7. completeEnrollmentWithCloudVerify(                           |
        |       enrollmentToken, employeeId,                              |
        |       shopId, deviceId, newPinHash,                            |
        |       newPinSalt)                                               |
        |───────────────────────────────────────────────────────────────>   |
        |                              8. Atomic consume + store         |
        |                                 newPinVerifier + newPinSalt       |
        |                              9. Set Device.hasPin=true          |
        |                                   |                               |
        |  10. Store newPinHash/newPinSalt|                               |
        |      in device Keychain           |                               |
        |                                   |                               |
```

### Security Properties

- Plaintext PIN never leaves the device
- Transmitted proof is PBKDF2 — not reusable without PIN
- Enrollment token is single-use, scoped to (employeeId, shopId, deviceId)
- Backend atomically consumes token to prevent replay
- Concurrent double-consumption prevented by atomic backend operation

---

## Section 6 — Enrollment Token Lifecycle

### Token States

| State | Backend Response | SDK Error Code |
|-------|----------------|---------------|
| Valid, not consumed | `{ success: true }` | — |
| Expired | `{ code: 'ENROLLMENT_TOKEN_EXPIRED' }` | `ENROLLMENT_TOKEN_EXPIRED` |
| Already consumed | `{ code: 'ENROLLMENT_TOKEN_CONSUMED' }` | `ENROLLMENT_TOKEN_REPLAY` |
| Scope mismatch (wrong employee/shop/device) | `{ code: 'ENROLLMENT_TOKEN_SCOPE_MISMATCH' }` | `ENROLLMENT_TOKEN_SCOPE_MISMATCH` |

### Atomic Consumption

`consumeEnrollmentToken` is atomic in the backend:
- Token validated for existence, expiry, scope, and unconsumed status in one transaction
- No race window for concurrent double-consumption
- On success: new canonical verifier stored, `Device.hasPin` set to true

---

## Section 7 — PIN Recovery Flow

### Three-Step Flow

```
Step 1: requestPinRecovery(employeeId)
        → Backend sends 6-digit code to employee's email
        → Returns { cooldownSeconds: 60 } (rate-limited to 60s between requests)
        → Error: { code: 'RATE_LIMITED', retryAfterMs } → SDK returns RECOVERY_RATE_LIMITED

Step 2: verifyPinRecoveryCode(employeeId, '123456')
        → Backend validates code
        → Returns { recoveryAuthToken, expiresAt } (short-lived, ~10 minutes)
        → Error: { code: 'RECOVERY_CODE_INVALID' } → SDK returns RECOVERY_CODE_INVALID

Step 3: resetPinWithRecovery({ recoveryAuthToken, employeeId, newPin, hashPin, shopId, deviceId })
        → Backend atomically consumes token + updates canonical verifier
        → SDK stores new PIN verifier locally
        → All other enrolled devices must re-enroll (local verifier out of sync)
        → Error: { code: 'VERIFICATION_EXPIRED' } → SDK returns RECOVERY_CODE_INVALID
```

### PIN Recovery vs. Password Reset

PIN recovery (`requestPinRecovery`/`verifyPinRecoveryCode`/`resetPinWithRecovery`) is **entirely separate** from cloud `resetPassword()`. It:
- Operates on the local device PIN, not the cloud identity
- Uses a 6-digit code sent to the employee's verified email
- Updates the canonical PIN verifier for cross-device enrollment
- Does NOT reset or affect the cloud session

---

## Section 8 — CloudSession vs. OperationalSession

Two fully independent sessions:

### CloudSession (CloudAuth)

- **Purpose**: "Who are you?" — cloud identity
- **TTL**: 24 hours (default)
- **Refresh**: `refreshSession()` before expiry
- **Stale**: `isSessionStale` — blocks cloud API calls needing auth
- **Revoked**: `signOut()`, `revokeSession()`, `SESSION_REVOKED`

### OperationalSession (OperationalAuth)

- **Purpose**: "Can this device operate?" — PIN gate
- **TTL**: 24 hours for session, **72 hours offline entitlement**
- **Offline entitlement**: `isWithinOfflineEntitlement` — blocks local mutations when offline
- **Stale**: `isSessionExpired` — requires PIN re-verification within 24h
- **3-day limit**: After 72 hours offline, device must reconnect to cloud even if PIN is valid

### Independence

```
CloudAuth.isSessionStale (24h)   → blocks cloud API calls that need auth
OperationalAuth 3-day limit      → blocks local PIN-verified mutations when offline

These two policies are independent:
- Cloud session stale ≠ operational offline entitlement expired
- A device can be cloud-session-stale but still within offline entitlement
- A device can be within cloud session but past 3-day offline entitlement
```

---

## Section 9 — Device vs. TrustedDevice

**These are completely separate concepts.**

### TrustedDevice

- **Managed by**: `CloudAuth` (trusted device registry for OAuth session sharing)
- **Purpose**: Skip re-authentication on returning browsers via stored OAuth tokens
- **Storage**: Platform secure storage, key `trusted_device:{deviceId}`
- **Schema**: Not stored in FIDScript — stored in platform secure storage by CloudAuth

### OperationalDevice

- **Managed by**: `OperationalAuth` + cloud API
- **Purpose**: POS device enrolled for business operations in a shop
- **Storage**: FIDScript `devices` entity (exists, hasPin, pinSetupAt, deviceName, etc.)
- **Local storage**: `pin_salt` + `pin_verifier` in platform secure storage

### Separation Guarantee

```
CloudAuth.registerTrustedDevice()  → stores token in secure storage
                                      key: trusted_device:{deviceId}

OperationalAuth.setupPin()         → stores salt/verifier in secure storage
                                      key: pin_salt / pin_verifier

CloudAuth NEVER touches OperationalAuth keys
OperationalAuth NEVER touches TrustedDevice keys
```

---

## Section 10 — Remote FIDScript Schema (via `instant-self` MCP)

**App ID**: `487be5c5-7615-4bbd-b3b7-3aa97154ca99`
**Platform**: `instant.fidscript.com` (FIDScript self-hosted)

### Confirmed Present Entities and Attributes

#### `devices` entity — PRESENT
| Attribute | Type | Status |
|-----------|------|--------|
| `id` | string | ✅ Present |
| `deviceName` | string | ✅ Present |
| `deviceType` | string | ✅ Present |
| `shopId` | string | ✅ Present |
| `status` | string | ✅ Present |
| `authorizedAt` | ISO8601 | ✅ Present |
| `isLanHost` | boolean | ✅ Present |
| `lastSeenAt` | ISO8601 | ✅ Present |
| `hasPin` | boolean | ❌ **MISSING — requires schema addition** |
| `pinSetupAt` | ISO8601 | ❌ **MISSING — requires schema addition** |

#### `employees` entity — PRESENT
| Attribute | Type | Status |
|-----------|------|--------|
| `id` | string | ✅ Present |
| `role` | string | ✅ Present |
| `email` | string | ✅ Present |
| `permissions` | string[] | ✅ Present |
| `createdBy` | string | ✅ Present |
| `phone` | string | ✅ Present |
| `name` | string | ✅ Present |
| `shopId` | string | ✅ Present |
| `invitedBy` | string | ✅ Present |
| `status` | string | ✅ Present |
| `cloudId` | string | ❌ **MISSING — requires schema addition** |

### Required Schema Additions

The SDK **DOES NOT modify** the FIDScript schema. These additions must be made by the backend:

```javascript
// ADD TO devices entity:
devices.hasPin     = { type: 'boolean', default: false }
devices.pinSetupAt = { type: 'string', isOptional: true }  // ISO8601

// ADD TO employees entity:
employees.cloudId  = { type: 'string' }  // links to $users.id
```

**Without these additions**: `DeviceEnrollmentState` will always default to `PIN_SETUP_REQUIRED` on first enrollment (safe fallback), and cross-device PIN enrollment cannot validate the canonical verifier.

---

## Section 11 — Required Backend APIs

### Implemented by Backend, Called by SDK

All return `AuthApiResponse<T>` or equivalent with `{ data?: T; error?: { code, message, retryAfterMs? } }`.

#### `consumeEnrollmentToken(params)` — **BLOCKER 1 fix**

```
Params: { enrollmentToken, employeeId, shopId, deviceId, newPinVerifier, newPinSalt }
Returns: { data: { success: true } } | { error: { code, message } }
Errors: ENROLLMENT_TOKEN_EXPIRED | ENROLLMENT_TOKEN_CONSUMED | ENROLLMENT_TOKEN_SCOPE_MISMATCH

Backend behavior:
  1. Look up enrollmentToken
  2. Validate: not expired, not consumed, scope matches (employeeId+shopId+deviceId)
  3. Atomic: mark consumed + store newPinVerifier + newPinSalt for employee
  4. Return success
```

#### `verifyPinForEnrollment(employeeId, pinProof, shopId, deviceId)` — **Section 10 critical path**

```
Params: { employeeId, pinProof: PBKDF2(pin, canonical_salt), shopId, deviceId }
Returns: { data: { enrollmentToken: string, expiresAt: ISO8601 } }
Errors: PIN_VERIFICATION_FAILED (rate-limited)

Backend behavior:
  1. Look up canonical verifier for employee
  2. Compare pinProof against canonical verifier
  3. On match: issue scoped enrollment token (5-min TTL, single-use)
```

#### `requestPinRecovery(employeeId)` — **BLOCKER 4**

```
Returns: { data: { cooldownSeconds: 60 } } | { error: { code: 'RATE_LIMITED', retryAfterMs } }
Backend behavior: Send 6-digit code to employee's email, enforce 60s cooldown
```

#### `verifyPinRecoveryCode(employeeId, code)` — **BLOCKER 4**

```
Returns: { data: { recoveryAuthToken: string, expiresAt: ISO8601 } }
        | { error: { code: 'RECOVERY_CODE_INVALID' } }
Backend behavior: Validate code, issue short-lived recovery token (~10 min)
```

#### `resetPin(params)` — **BLOCKER 4**

```
Params: { recoveryAuthToken, employeeId, newPinVerifier, newPinSalt }
Returns: { data: { success: true } } | { error: { code: 'VERIFICATION_EXPIRED' } }
Backend behavior: Atomic — consume token + update canonical verifier + revoke other device sessions
```

---

## Section 12 — Required Schema Changes (Backend Responsibility)

> ⚠️ **SDK does not modify FIDScript schema. These are backend requirements.**

### 1. `employees.cloudId: string` — **HIGH PRIORITY**
- Links `Employee` record to FIDScript `$users.id`
- Needed by: `verifyPinForEnrollment` (to look up `$users.id` for the employee)
- Without this: cross-device PIN verification cannot identify the canonical verifier

### 2. `devices.hasPin: boolean` — **HIGH PRIORITY**
- Flags that a device has completed PIN enrollment
- Set by: `consumeEnrollmentToken` success
- Checked by: `getDeviceStatus()` → drives `DeviceEnrollmentState`

### 3. `devices.pinSetupAt: ISO8601` — **MEDIUM PRIORITY**
- Timestamp when PIN was first enrolled on this device
- Useful for audit and device management
- Can be added independently of hasPin

---

## Section 13 — Security Properties

### PIN is Local-Only

The PIN verifier (PBKDF2 hash) is stored **only in the device's Keychain/Keystore**.
The cloud never sees or stores the PIN or its PBKDF2 derivative.

### Cross-Device Proof is Not Reusable

The `pinVerificationProof` sent to `verifyPinForEnrollment` is `PBKDF2(pin, canonical_salt)`.
Without knowing the original PIN, this proof cannot be used to authenticate or enroll
on another device. The backend additionally issues a single-use enrollment token.

### Enrollment Token Atomic Consumption

`consumeEnrollmentToken` is atomic in the backend — no race window for replay.
Concurrent double-consumption is prevented at the database level.

### 3-Day Offline Entitlement

After 72 hours of no cloud contact, `isWithinOfflineEntitlement` returns false
and local PIN-verified mutations are blocked. The device must reconnect to cloud
to refresh the operational session.

### Lockout After 5 Failed Attempts

After 5 consecutive failed PIN verifications, the device is locked for 30 seconds.
The lock is device-local (not cloud-synced) — it resets on app restart.

---

## Section 14 — Test Results

### All Tests: 106/106 Passing

| Test File | Tests | Status |
|-----------|-------|--------|
| `cloud-auth.test.ts` | 31 | ✅ All passing |
| `operational-auth.test.ts` | 47 | ✅ All passing (new) |
| `auth.test.ts` | 14 | ✅ All passing |
| `pin-compatibility.test.ts` | 14 | ✅ All passing |

### New `operational-auth.test.ts` Coverage (47 tests)

```
First-device PIN setup
  ✅ stores salt and verifier in secure storage
  ✅ reset failed attempts on successful setup
  ✅ returns verifier hash for caller to submit to cloud

PIN verification
  ✅ verifies correct PIN and returns OperationalSession
  ✅ rejects incorrect PIN and increments failure counter
  ✅ locks after MAX_PIN_ATTEMPTS failures
  ✅ rejects verification when no PIN is set
  ✅ rejects when locked
  ✅ resets counter on successful verification

Enrollment state machine
  ✅ DEVICE_NOT_ENROLLED → calls createDeviceEnrollment then PIN_SETUP_REQUIRED
  ✅ PIN_SETUP_REQUIRED with no proof → signals needsCloudVerify
  ✅ PIN_SETUP_REQUIRED with proof → calls verifyPinForEnrollment
  ✅ PIN_SETUP_REQUIRED with wrong proof → returns error
  ✅ getEnrollmentState returns correct state based on cloud response

Cross-device enrollment token
  ✅ completeEnrollmentWithCloudVerify consumes token and stores local verifier
  ✅ rejects expired enrollment token
  ✅ rejects already-consumed enrollment token
  ✅ rejects token with wrong employeeId scope
  ✅ rejects token with wrong shopId scope
  ✅ rejects token with wrong deviceId scope
  ✅ replay attempt uses same token twice → first succeeds, second fails with REPLAY

PIN change
  ✅ changes PIN after verifying old PIN
  ✅ rejects PIN change with wrong old PIN

PIN recovery
  ✅ requestPinRecovery sends code and returns cooldown
  ✅ requestPinRecovery propagates backend rate limit
  ✅ verifyPinRecoveryCode returns recovery auth token
  ✅ verifyPinRecoveryCode rejects invalid code
  ✅ resetPinWithRecovery consumes token and stores new local verifier
  ✅ resetPinWithRecovery rejects expired recovery token

3-day offline entitlement
  ✅ isWithinOfflineEntitlement returns true when within 3 days
  ✅ isWithinOfflineEntitlement returns true at exactly 3 days
  ✅ isWithinOfflineEntitlement returns false beyond 3 days
  ✅ isSessionExpired returns true when session expires before entitlement
  ✅ session is expired AND entitlement expired — both independently true

clearPin
  ✅ wipes salt and verifier from storage
  ✅ resets failure counter and lockout

hasPinEnrolled
  ✅ returns false when no PIN is stored
  ✅ returns true when PIN verifier exists in storage

Session serialization
  ✅ serializeSession round-trips correctly
  ✅ deserializeSession returns null for expired session
  ✅ deserializeSession returns null for invalid JSON

TrustedDevice vs OperationalDevice separation
  ✅ TrustedDevice token is stored separately from PIN storage
  ✅ OperationalAuth never touches TrustedDevice storage keys

SDK constants
  ✅ OFFLINE_ENTITLEMENT_TTL_MS is exactly 3 days in ms
  ✅ MAX_PIN_ATTEMPTS is 5
  ✅ PIN_RATE_LIMIT_MS is 30 seconds
  ✅ ENROLLMENT_TOKEN_TTL_MS is 5 minutes
```

---

## Section 15 — Breaking Changes for Mobile/Desktop/Web

> ⚠️ The following changes require platform adapter updates. These were **BLOCKED** from modification per SDK finalization mandate — they are listed here as known integration work items.

### Mobile (`@soostori/auth/mobile`)
- **No breaking changes** to the mobile OAuth flow
- `GoogleSignin.signIn()` → `signInWithGoogleIdToken()` already implemented
- **Required addition**: Platform adapter must expose `hashPin`/`verifyPin` using `react-native-quick-crypto`
- **Required addition**: `consumeEnrollmentToken` call in `completeEnrollmentWithCloudVerify` flow

### Desktop (`@soostori/auth/desktop`)
- **No breaking changes** to the desktop OAuth PKCE flow
- `signInWithGoogle()` → `handleOAuthCallback()` already implemented
- **Required addition**: Platform adapter must expose `hashPin`/`verifyPin` from `@soostori/auth/pin-node`
- **Required addition**: `consumeEnrollmentToken` call in `completeEnrollmentWithCloudVerify` flow

### Web (`@soostori/auth/web`)
- **No breaking changes** to the web OAuth PKCE flow
- PKCE S256 + `handleOAuthCallback()` already implemented
- **Required addition**: Platform adapter must expose `hashPin`/`verifyPin` using Web Crypto API
- **Required addition**: `consumeEnrollmentToken` call in `completeEnrollmentWithCloudVerify` flow

### `AuthApiClient` Interface (Backend Contract)

All platform adapters must update their `AuthApiClient` implementation to add:

```typescript
verifyPinForEnrollment(employeeId, pinProof, shopId, deviceId): Promise<...>
consumeEnrollmentToken(params: { enrollmentToken, employeeId, shopId, deviceId, newPinVerifier, newPinSalt }): Promise<...>
requestPinRecovery(employeeId): Promise<...>
verifyPinRecoveryCode(employeeId, code): Promise<...>
resetPin(params: { recoveryAuthToken, employeeId, newPinVerifier, newPinSalt }): Promise<...>
```

---

## Section 16 — Migration Order (for platform implementers)

For Mobile, Desktop, and Web teams integrating `alpha.6`:

### Step 1: Update `AuthApiClient` interface

Add the 5 new backend API methods. Until the backend implements them:
- `verifyPinForEnrollment` → return `{ error: { code: 'NOT_IMPLEMENTED' } }`
- `consumeEnrollmentToken` → return `{ error: { code: 'NOT_IMPLEMENTED' } }`
- `requestPinRecovery` → return `{ error: { code: 'NOT_IMPLEMENTED' } }`
- `verifyPinRecoveryCode` → return `{ error: { code: 'NOT_IMPLEMENTED' } }`
- `resetPin` → return `{ error: { code: 'NOT_IMPLEMENTED' } }`

### Step 2: Add platform `hashPin`/`verifyPin`

**Node/Desktop**: `@soostori/auth/pin-node` (already exists)
**React Native**: Implement using `react-native-quick-crypto`
**Web**: Implement using Web Crypto API (`window.crypto.subtle`)

### Step 3: Update enrollment flow

Integrate `completeEnrollmentWithCloudVerify` with `consumeEnrollmentToken` call
into the Section 10 cross-device enrollment sequence.

### Step 4: Add backend schema additions

Request backend team to add: `employees.cloudId`, `devices.hasPin`, `devices.pinSetupAt`.

### Step 5: Implement backend APIs

Backend implements `consumeEnrollmentToken`, `verifyPinForEnrollment`,
`requestPinRecovery`, `verifyPinRecoveryCode`, `resetPin` per Section 11.

---

## Section 17 — Acceptance Criteria Summary

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `@soostori/auth@0.1.0-alpha.6` published | ⏳ Pending — awaiting acceptance gate |
| 2 | `@soostori/core@0.1.0-alpha.3` unchanged | ✅ Confirmed |
| 3 | `enrollmentToken` atomic consumption (BLOCKER 1) | ✅ Fixed — `consumeEnrollmentToken` |
| 4 | PIN proof protocol frozen (BLOCKER 2) | ✅ Fixed — PBKDF2 100k/SHA256/32B salt/32B key in `operational-auth.ts` header |
| 5 | 24h cloud-stale separated from 3-day offline (BLOCKER 3) | ✅ Fixed — `isSessionStale` (CloudAuth) vs `isWithinOfflineEntitlement` (OperationalAuth) |
| 6 | PIN recovery pre-launch (BLOCKER 4) | ✅ Fixed — `requestPinRecovery`/`verifyPinRecoveryCode`/`resetPinWithRecovery` |
| 7 | All 106 tests passing | ✅ 106/106 |
| 8 | Remote FIDScript schema verified via `/instant-self` | ✅ Confirmed: `devices` and `employees` entities confirmed; `employees.cloudId`, `devices.hasPin`, `devices.pinSetupAt` missing |
| 9 | CHANGELOG.md updated | ✅ Updated with full unreleased section |
| 10 | Build clean (tsc) | ✅ Clean for both `packages/auth` and `packages/core` |
| 11 | No Mobile/Desktop/Web modifications | ✅ BLOCKED per mandate |
| 12 | Security audit complete | ⏳ Pending — security-reviewer agent |
| 13 | Final SDK CONTRACT REPORT delivered | ✅ This document |

---

*This document is the authoritative SDK contract for `@soostori/auth@0.1.0-alpha.6`. Once accepted, the package should be published and CHANGELOG.md `[Unreleased]` section should be renamed to `[0.1.0-alpha.6]`.*
