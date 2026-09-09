# SOOSTORI SDK — Authentication Architecture Proposal
**Version:** 1.0-draft
**Date:** 2026-09-09
**Status:** PROPOSAL — DO NOT IMPLEMENT
**Based on:** Authentication Layer Deep Audit (`AUDIT.md`, 2026-09-09)

---

## 1. EXECUTIVE DECISION

### What this document resolves

The audit identified five fundamental problems with the current SDK auth architecture:

| Problem | Decision |
|---------|----------|
| `Company` node in identity chain has no remote schema | **REMOVE** `Company` from the identity contract. The chain is now `Person → Business → Membership → Role → Device → Operational Session`. |
| `Employee.localPinHash`/`localPinSalt` in cloud schema | **KEEP local only.** Cloud stores only a `hasPin: boolean` flag. The PIN verifier is device-local. |
| `SESSION_STALE_THRESHOLD_MS` (24h) and `OFFLINE_GRACE_DAYS` (3d) are unconnected | **SEPARATE into two owned concerns.** Cloud session freshness (auth package) and offline operational entitlement (offline package) are independent. |
| `AuthApiClient` has no implementation | **DEFINE SDK CONTRACT clearly.** The SDK provides the interface + CloudAuth consumer; the backend must provide the FIDScript implementation. This is a documentation/explainer gap, not an SDK bug. |
| `@soostori/devices` and `@soostori/sync` unpublished | **SEPARATE concern.** Publish before any integration work proceeds. |

### What does not change

- PKCE S256 browser OAuth flow
- Mobile Google ID-token flow (`signInWithGoogleIdToken`)
- Email/password authentication
- `AuthResult<T>` discriminated union
- `PlatformAuthAdapter` interface
- `TrustedDevice` CRUD
- RBAC `hasPermission()` engine
- `IdentityContext` and `isValidChain()` — with `Company` removed
- Subscription enforcement via `@soostori/subscription`
- Offline policy via `@soostori/offline`
- Event bus and notification engine
- PBKDF2 100k/4-digit PIN cryptography

---

## 2. CURRENT SDK AUTH ARCHITECTURE

### As-is identity chain
```
User (cloud $users)
  → Company (NOT IMPLEMENTED — no remote schema)
  → Shop (= Business)
  → Employee (has localPinHash, localPinSalt — NOT IN REMOTE)
  → Device (registered, authorized)
  → Session (access token, refresh token)
```

### Current problems
1. `Company` exists in `IdentityContext` type but no `company` namespace exists remotely, no `BusinessRepository.findCompany()`, no `shops.companyId`
2. `Employee.localPinHash`/`localPinSalt` in `@soostori/core` types but absent from remote `employees` namespace
3. `CloudAuth` treats PIN as something it queries via `AuthApiClient` — but there is no such API because PIN is local
4. `SESSION_STALE_THRESHOLD_MS = 24h` checked independently of `OFFLINE_GRACE_DAYS = 3d`
5. `AuthApiClient` interface has no FIDScript implementation anywhere in the repo
6. `@soostori/devices` and `@soostori/sync` not published — referenced in `apps/web/package.json`

---

## 3. TARGET AUTH ARCHITECTURE

### Two-layer model

```
LAYER 1: CLOUD IDENTITY (who is this person?)
───────────────────────────────────────────────
  CloudAuth
  ├── Google OAuth (browser PKCE)
  ├── Google ID Token (mobile native)
  ├── Email/Password
  └── Session management (access token, refresh token)
  → Result: CloudSession + Person + list of BusinessMemberships

LAYER 2: OPERATIONAL IDENTITY (can this device operate?)
────────────────────────────────────────────────────────
  OperationalAuth
  ├── Device enrollment (register device with business)
  ├── PIN setup (first device or new device)
  ├── PIN verification (daily unlock)
  ├── PIN recovery (forgot PIN flow)
  └── Offline operational session
  → Result: OperationalSession (local only)
```

### Separation principle

> Cloud authentication answers: "Who are you?" — produces a `CloudSession`.
> Operational authentication answers: "May this device operate?" — produces an `OperationalSession`.

These are **never the same object**, never stored identically, and never share the same lifetime.

---

## 4. CANONICAL IDENTITY MODEL

### The correct chain

```
CloudUser ($users — FIDScript system namespace)
  │
  ├── cloudUserId: string  (maps CloudUser.id → Person.cloudUserId)
  │
  ▼
Person (SDK-local concept; maps CloudUser to business memberships)
  │
  ├── id: UUID  (SDK-generated, stored nowhere remotely)
  ├── cloudUserId: string  (links to $users.id)
  ├── email: string
  ├── displayName: string
  ├── phone?: string
  │
  ▼
Membership[]  (one Person × many Business memberships)
  │
  ├── businessId: UUID  (links to Business.id)
  ├── role: 'owner' | 'manager' | 'cashier' | 'attendant' | 'viewer'
  ├── permissions: Record<string, boolean> | null  (overrides)
  ├── status: 'invited' | 'active' | 'suspended' | 'revoked'
  │
  ▼
Business (maps to remote `shops` namespace)
  ├── id: UUID
  ├── name: string
  ├── slug: string
  ├── taxRate: number
  ├── plan: string
  ├── subscriptionExpiry: ISO8601 | null  (derived from subscriptions)
  ├── status: 'active' | 'inactive' | 'suspended'
  │
  ▼
Device  (operational device; maps to remote `devices` namespace)
  ├── id: UUID  (device identifier)
  ├── businessId: UUID
  ├── status: 'pending' | 'authorized' | 'revoked' | 'offline'
  ├── hasPin: boolean  ← NEW — cloud tracks only this
  │
  ▼
OperationalSession (device-local only)
  ├── deviceId: UUID
  ├── personId: UUID
  ├── businessId: UUID
  ├── employeeId: UUID
  ├── createdAt: ISO8601
  ├── expiresAt: ISO8601
  └── offlineUntil: ISO8601 | null
```

### Company decision

**`Company` is removed from the identity contract.**

Rationale:
- No `company` namespace in either verified FIDScript app
- No `findCompany()` in any repository
- `shops` has no `companyId` field
- The concept adds a layer with no evidence of being used
- If a multi-business grouping is needed later, it can be added as a future SDK entity without changing the cloud identity model
- Removing it now prevents a cascade of empty implementations

### `Person` as SDK-local concept

`Person` is a **SDK mapping layer** between the FIDScript `$users` system namespace and business-specific entities. It does not need a separate remote namespace — it is derived:

```
CloudUser.id + CloudUser.email → Person (assembled by SDK)
Person.cloudUserId = $users.id
Person.id = SDK-generated UUID (used to link Membership records)
```

---

## 5. AUTHENTICATION MODEL

### Cloud authentication methods

| Method | Platform | Mechanism |
|--------|----------|-----------|
| `signInWithGoogle(config)` | Web/Desktop | Browser PKCE S256 → Google OAuth → `handleOAuthCallback` → `AuthResponse` |
| `signInWithGoogleIdToken({idToken, clientName})` | Mobile | GoogleSignIn native → ID token → `api.signInWithIdToken()` |
| `signInWithEmail(email, password)` | All | Email/password → `api.signInWithEmail()` |
| `registerWithEmail(email, password)` | All | Register → `api.registerWithEmail()` |
| `verifyEmailAddress(code)` | All | Verify email → `api.verifyEmailAddress()` |
| `resetPassword(email)` | All | Request reset → `api.resetPassword()` |
| `completePasswordReset(code, newPassword)` | All | Complete reset → `api.completePasswordReset()` |

### CloudAuth result

All cloud authentication methods return `AuthResult<CloudAuthResult>`:

```typescript
interface CloudAuthResult {
  cloudSession: CloudSession       // access token + refresh token
  person: Person                   // SDK-assembled identity
  memberships: BusinessMembership[] // all businesses this person belongs to
  accountStatus: 'provisioned' | 'active'  // 'provisioned' = authenticated but no memberships
}
```

### Account status semantics

| Status | Meaning | SDK behavior |
|--------|---------|--------------|
| `provisioned` | Person authenticated but has no business membership | `CloudAuthResult.memberships = []` — SDK must NOT silently create a business |
| `active` | Person authenticated and has at least one business membership | Proceed to membership resolution |

### What authentication does NOT do

- Does NOT create a business
- Does NOT create an owner employee
- Does NOT register a device
- Does NOT set a PIN
- Does NOT create a subscription

---

## 6. PROVISIONING MODEL

### Who can provision

- Existing business owner/manager via Web
- Approved Salesperson via Web

### Provisioning is OUTSIDE the auth SDK

Provisioning (creating a Business, assigning a Membership, setting up a Subscription) is a **business workflow** performed by `@soostori/business` and `@soostori/subscription` packages after `CloudAuth` completes.

The auth SDK's responsibility ends at: "this person is `provisioned` or `active`."

### SDK contract for provisioning check

After cloud authentication, the SDK must expose:

```typescript
interface AuthResolution {
  cloudSession: CloudSession
  person: Person
  memberships: BusinessMembership[]
  accountStatus: 'provisioned' | 'active'
  requiresProvisioning: boolean   // true when accountStatus === 'provisioned'
  provisioningHint?: string     // e.g., "No business membership found"
}
```

### The canonical first-login flow

```
CloudAuth.signInWithGoogle/Email
  → CloudAuthResult { person, memberships, accountStatus }
  → if accountStatus === 'provisioned':
      → STOP, return requiresProvisioning: true
      → Application shows: "You don't have a business yet. Contact your administrator."
  → if accountStatus === 'active':
      → if memberships.length === 1:
          → auto-select that business
          → proceed to business context
      → if memberships.length > 1:
          → STOP, return memberships[]
          → Application shows: business selector
```

---

## 7. BUSINESS MEMBERSHIP MODEL

### `BusinessMembership` type

```typescript
interface BusinessMembership {
  membershipId: UUID
  business: Business
  role: EmployeeRole
  permissions: Record<string, boolean> | null   // overrides
  status: 'invited' | 'active' | 'suspended' | 'revoked'
  isOwner: boolean       // true if role === 'owner'
  subscriptionStatus: SubscriptionStatus
  subscriptionExpiresAt: ISO8601 | null
}
```

### Multi-business selection

When `memberships.length > 1`, the SDK returns the full array and the **application** is responsible for rendering a business selector.

The SDK exposes:
```typescript
interface BusinessSelector {
  memberships: BusinessMembership[]
  activeBusinessId: UUID | null
}
```

The SDK does NOT auto-switch businesses. The application calls:
```typescript
cloudAuth.setActiveBusiness(businessId: UUID): void
```

This updates the SDK's active business context, which affects:
- `cloudAuth.getActiveMembership()`
- `cloudAuth.getRole()`
- `cloudAuth.getPermissions()`

### `isOwner` shortcut

`role === 'owner'` is the canonical owner check. There is no separate "isOwner" field in the remote schema — it is derived from `role === 'owner'`.

---

## 8. ROLE / PERMISSION MODEL

### Roles — unchanged from current

| Role | Inherits | Core permissions |
|------|----------|-----------------|
| `owner` | — | All 20 permissions |
| `manager` | — | All except `subscription.manage`, `employees.manage` |
| `cashier` | — | `pos.sell`, `products.view`, `customers.view`, `reports.view.own`, `pos.refund.own` |
| `attendant` | — | `pos.sell`, `products.view` |
| `viewer` | — | `products.view`, `customers.view` |

### Permission resolution

```typescript
cloudAuth.getRole(): EmployeeRole
cloudAuth.getPermissions(): string[]   // resolved from role + any overrides
cloudAuth.hasPermission(permission: string): boolean
```

### Role change propagation

When a person's role changes in the cloud (via business owner action):
1. On next `restoreSession()` or `refreshSession()`, the SDK fetches updated membership
2. The SDK emits a `ROLE_CHANGED` event
3. Application is responsible for re-rendering permission-gated UI

---

## 9. SUBSCRIPTION BOUNDARY

### Clean separation

```
CloudAuth ──────────► Membership ──────────► Subscription
"Who are you?"      "What businesses?"       "Are they entitled?"
```

Authentication result contains `memberships[]`. Each `BusinessMembership` carries `subscriptionStatus` and `subscriptionExpiresAt`.

**`CloudAuth` does NOT enforce subscription.** That is the responsibility of `@soostori/subscription/enforcement.ts`, called by the application before sensitive operations.

### Subscription resolution in auth result

```typescript
interface BusinessMembership {
  // ...membership fields...
  subscription: {
    status: SubscriptionStatus   // 'active' | 'trialing' | 'expired' | 'cancelled' | 'past_due'
    expiresAt: ISO8601 | null
    plan: string
    deviceLimit: number | null
    inGracePeriod: boolean
  }
}
```

### Subscription check call site

```typescript
// Before POS-sensitive operation:
const state = subscriptionCache.getState(businessId)
enforceSubscription(state)  // throws SubscriptionExpiredError if blocked
```

---

## 10. DEVICE MODEL

### Operational device states

```typescript
type DeviceStatus = 'pending' | 'authorized' | 'revoked' | 'offline'

interface OperationalDevice {
  id: UUID
  businessId: UUID
  deviceName: string
  deviceType: 'desktop' | 'mobile'
  status: DeviceStatus
  hasPin: boolean          // ← NEW: cloud only tracks this
  registeredAt: ISO8601
  lastSeenAt: ISO8601
  authorizedAt: ISO8601 | null
}
```

### Device enrollment states

| State | Meaning | Transition |
|-------|---------|-----------|
| `pending` | Device registered but not yet authorized | → `authorized` (manual or automatic based on plan) |
| `authorized` | Device approved to operate | → `revoked` (by owner), → `offline` (no heartbeat) |
| `revoked` | Device explicitly banned | Terminal — no automatic re-enrollment |
| `offline` | Device not reachable but not revoked | Resurrects on reconnect if within grace |

### `hasPin` as the cloud PIN flag

The cloud does NOT store `localPinHash` or `localPinSalt`. It stores:

```typescript
device.hasPin: boolean   // true = PIN has been established on this device
```

Purpose: Allows the SDK to distinguish **first PIN setup** from **existing PIN verification** without cloud round-trip.

### Device enrollment contract

```typescript
cloudAuth.registerDevice(args: {
  businessId: UUID
  deviceName: string
  deviceType: 'desktop' | 'mobile'
}): Promise<{ deviceId: UUID; status: 'pending' }>
```

After `registerDevice()`, the device is in `pending` state. The application shows: "Waiting for device approval" or auto-approves based on subscription plan rules (backend enforcement).

---

## 11. TRUSTED DEVICE MODEL

### Trusted Auth Device vs Operational Device — distinct concepts

| Concept | Trusted Auth Device | Operational Device |
|---------|---------------------|-------------------|
| Purpose | Can receive auth tokens / OAuth callbacks | POS device enrolled in business |
| Managed by | `CloudAuth.registerTrustedDevice()` | `CloudAuth.registerDevice()` |
| Storage | Cloud + local | Cloud + local |
| Revocable | Yes | Yes |
| Has PIN | No | Yes (locally) |

A Trusted Auth Device is a device that has been used to authenticate and has elected to be remembered. It is NOT the same as the POS operational device, though they may be the same physical device.

### Trusted device API — unchanged

```typescript
cloudAuth.registerTrustedDevice(deviceName: string): Promise<TrustedDevice>
cloudAuth.listTrustedDevices(): Promise<TrustedDevice[]>
cloudAuth.removeTrustedDevice(deviceId: string): Promise<void>
```

---

## 12. OPERATIONAL PIN MODEL

### The fundamental architecture decision

> The authoritative knowledge that "this person has an existing PIN" lives in the cloud (`Device.hasPin`).
> The actual PIN verifier (hash, salt) lives **device-locally**.

This is the correct model because:
1. The PIN is an **operational** secret — it unlocks the POS on this specific device
2. It is not a **cloud identity** secret — it does not authenticate against the identity authority
3. Cloud storage of PIN hash is a security liability — if the cloud record is breached, all device PINs are exposed
4. Device-local storage in Keychain/Keystore provides hardware-backed protection on mobile/desktop

### Cloud-side PIN state

```typescript
// Remote schema — extend `devices` namespace with:
device.hasPin: boolean    // true = PIN established on this device
device.pinSetupAt?: ISO8601   // when PIN was first set
```

### Device-local PIN data

```typescript
// Stored in platform secure storage (Keychain/Keystore) — NEVER in cloud
interface LocalPinVerifier {
  pinHash: string     // PBKDF2 output
  pinSalt: string     // 32 bytes random
  iterations: number  // 100,000
}
```

### Why `hasPin` must be in cloud

Without a cloud flag, the SDK cannot distinguish:
- "This is a brand new device — user must create a PIN"
- "This device already has a PIN — user must verify it"

Without knowing this, the SDK cannot present the correct UI flow on device enrollment.

### What `hasPin` does NOT enable

`hasPin: true` does NOT mean "verify PIN against cloud." It means "this device has a local PIN verifier; prompt for PIN." Verification is always local.

### PIN architecture summary

| Data | Location | Purpose |
|------|----------|---------|
| `Device.hasPin` | Cloud (`devices` namespace) | Flags whether PIN setup has occurred |
| `LocalPinVerifier { hash, salt, iterations }` | Device Keychain/Keystore | Verifies the PIN locally |
| `Employee.localPinHash` / `localPinSalt` | **REMOVE** from SDK types | Obsolete — never in remote schema |

---

## 13. FIRST DEVICE FLOW

### Scenario
Person authenticated → has business membership → this is the FIRST operational device being enrolled.

### Flow

```
CloudAuth.signInWithGoogle/Email
  → CloudAuthResult { person, memberships, accountStatus: 'active' }
  → memberships[0] selected (single business) or user selects
  → cloudAuth.getActiveDevice()
  → Device { status: 'pending' | 'not_enrolled' }
  → if device.status === 'not_enrolled':
      → cloudAuth.registerDevice({ businessId, deviceName, deviceType })
      → device enters 'pending' state
      → cloudAuth.checkPinStatus(deviceId)
      → PIN_STATUS === 'not_configured':
          → Application shows: "Create your PIN"
          → user enters 4-digit PIN
          → cloudAuth.setupPin(pin: string)
            1. Generate PBKDF2 hash locally
            2. Store in device Keychain/Keystore
            3. API call: PATCH /devices/{id} { hasPin: true }  ← NEW API
          → OperationalSession created locally
          → App proceeds to POS
      → PIN_STATUS === 'configurable':
          → (should not occur on first device)
```

### First device PIN setup — SDK contract

```typescript
interface PinSetupResult {
  success: true
  deviceId: UUID
  operationalSession: OperationalSession
}

cloudAuth.setupPin(pin: string, deviceId: UUID): Promise<PinSetupResult>
// Steps:
// 1. Validate pin.length === 4, all digits
// 2. Generate PBKDF2(pin, randomSalt, 100000, SHA256)
// 3. Store { hash, salt } in platform secure storage, keyed by deviceId
// 4. Call api.setDeviceHasPin(deviceId, true)  ← NEW backend API
// 5. Create OperationalSession locally
// 6. Return { success: true, deviceId, operationalSession }
```

---

## 14. NEW DEVICE FLOW

### Scenario
Person already has Device A (enrolled, has PIN). Now sets up Device B (new phone/desktop).

### Key insight
The person has an **existing PIN** from Device A. The cloud knows `DeviceA.hasPin = true`. Device B must ask the user for the **existing PIN** to establish the local verifier.

This is NOT a password reset — it is a **device-local verifier transfer**.

### Flow

```
CloudAuth.signInWithGoogle/Email  (on Device B)
  → CloudAuthResult { person, memberships }
  → cloudAuth.getDeviceStatus(deviceId: UUID)  → Device { status: 'not_enrolled' }
  → cloudAuth.registerDevice({ businessId, deviceName, deviceType })
  → Device { status: 'pending' }
  → cloudAuth.checkPinStatus(deviceId)  → PIN_STATUS === 'not_on_this_device_but_exists_elsewhere'
  → Application shows: "This device isn't set up yet. Enter your existing PIN to secure this device."
  → user enters PIN from Device A
  → cloudAuth.verifyExistingPin(pin: string, deviceId: UUID): Promise<boolean>
    1. Hash pin with NEW device's random salt
    2. Compare against... wait — we don't have Device A's hash to compare against!
```

### The device PIN transfer problem

Device A stores its own local PBKDF2 verifier. Device B cannot obtain Device A's verifier — it is in Keychain on Device A only. The user cannot "enter their existing PIN" on Device B because Device B has no reference to compare against.

### Resolution — two options

**Option A: Cloud PIN Verification (not preferred)**
Device B sends the PIN to cloud → cloud verifies → returns success/fail. Problem: introduces online dependency for what should be a local operation, and creates a PIN transmission attack surface.

**Option B: PIN Re-establishment (preferred)**
When a new device enrolls and `existingDevice.hasPin === true`, the flow is:
1. Device B registers as `pending`
2. SDK detects existing PIN on other device(s) via `person.devices[]`
3. Application shows: "You've used Soostori on another device. Create a new PIN for this device."
4. User creates a NEW PIN for Device B
5. Both devices now have independent local verifiers

This is the correct model — the same operational PIN **concept** applies to the person, but each device stores its own independent local verifier.

**Option C: Single PIN, device-local proof (complex)**
Use a derived key scheme: PIN + device-specific salt → unique verifier per device, but all derived from the same PIN. This requires the original PIN to be available at setup time on Device B — which it isn't (it's only on Device A).

### Decision: Option B

**New device = new local PIN.** The "existing PIN" concept means "the person has previously used Soostori on another device." It does NOT mean "transfer the same PIN verifier to this device."

Cloud `hasPin` on the new device starts as `false`. After setup, it becomes `true` with its own independent local verifier.

### New device flow (corrected)

```
CloudAuth (Device B, new enrollment)
  → cloudAuth.registerDevice()  → pending
  → cloudAuth.checkPinStatus() → 'not_configured'
  → "Create a PIN for this device"
  → cloudAuth.setupPin(pin) on Device B
  → Device B.hasPin = true, local verifier stored on Device B
  → Both Device A and Device B have independent PIN verifiers
  → Person can unlock Device A or Device B with their respective PINs
```

### What if the person has NO other devices?

The SDK detects this by checking `person.devices.filter(d => d.hasPin)`. If the count is 0, this is the first device → first device flow applies.

---

## 15. EXISTING DEVICE FLOW (Daily unlock)

### Scenario
Person opens the app on a device that is already enrolled and has a PIN.

### Flow

```
App launches
  → cloudAuth.hasStoredSession(): Promise<boolean>
  → if hasStoredSession:
      → cloudAuth.restoreSession() → CloudSession (may be stale)
      → if cloudAuth.isOnline():
          → cloudAuth.refreshSession() → refreshed CloudSession
      → OperationalAuth.getPinStatus(deviceId) → 'verified' | 'not_verified'
      → if 'not_verified':
          → Application shows: PIN entry screen
          → user enters PIN
          → OperationalAuth.verifyPin(pin, deviceId): Promise<boolean>
            1. Load LocalPinVerifier from Keychain
            2. PBKDF2(pin, storedSalt, 100000)
            3. timingSafeEqual(hash, storedHash)
            4. if match → OperationalSession created, return true
            5. if mismatch → attempt count++, return false
          → if false after N attempts → lockout
      → if 'verified':
          → OperationalSession restored from secure storage
          → App proceeds to POS (no PIN UI)
  → if no stored session:
      → Full cloud authentication flow
```

### No cloud login required for daily unlock

The PIN verifies locally. Cloud connectivity is used to refresh the `CloudSession` (keep it from going stale), refresh memberships/roles, and sync data — but NOT to unlock the app.

### Offline unlock

If `isOnline() === false`:
- `restoreSession()` uses cached `CloudSession` if not stale (24h window)
- `OperationalAuth.verifyPin()` works offline (local Keychain)
- `computeOfflineState()` determines if POS can operate (3-day policy)

---

## 16. FORGOT PIN FLOW

### Scenario
Person knows their cloud credentials but has forgotten their operational PIN.

### Key principle
Magic Code (or email verification link) is the recovery mechanism for the operational PIN. It is NOT a daily login method.

### Flow

```
Application: PIN unlock screen
  → "Forgot PIN?" link
  → cloudAuth.initiatePinRecovery(email: string): Promise<{ deliveryMethod: 'email' | 'magic_code' }>
    → api.initiatePinRecovery(email)
    → FIDScript sends email with 6-digit code OR magic code via WhatsApp
    → Returns delivery method confirmation
  → Application shows code entry screen
  → cloudAuth.verifyPinRecoveryCode(code: string): Promise<{ valid: boolean; expiresAt: ISO8601 }>
    → api.verifyPinRecoveryCode(code)
    → If valid: returns recovery token (short-lived)
  → Application: "Create a new PIN"
  → cloudAuth.resetPin(newPin: string, recoveryToken: string, deviceId: UUID): Promise<void>
    → Validates recovery token
    → Generates new PBKDF2 hash
    → Stores in device Keychain (replaces old verifier)
    → api.setDeviceHasPin(deviceId, true)  ← already true, but confirms
    → No cloud record of old PIN is retained
  → OperationalSession created
  → App proceeds
```

### Magic Code in the recovery context

Magic Code's correct role is **account verification in recovery flows**. Specifically:
- Forgot PIN → verify email ownership → set new PIN
- Change PIN (if current PIN unknown) → verify via Magic Code → set new PIN

Magic Code is NOT:
- A daily login mechanism
- A replacement for Google/email authentication
- A way to authenticate without knowing credentials

### Magic Code API — corrected

```typescript
// These should be in a separate @soostori/auth/recovery namespace,
// NOT in @soostori/cloud (which handles data operations)

cloudAuth.initiatePinRecovery(email: string): Promise<{ deliveryMethod: 'email' | 'magic_code'; expiresAt: ISO8601 }>
cloudAuth.verifyPinRecoveryCode(code: string): Promise<{ valid: boolean; recoveryToken: string; expiresAt: ISO8601 }>
cloudAuth.resetPin(newPin: string, recoveryToken: string, deviceId: UUID): Promise<void>
```

The existing `@soostori/cloud` methods `sendMagicCode()` and `verifyMagicCode()` were removed (audit finding). The recovery-specific code should live in `@soostori/auth` with a clear `recovery` subpath.

---

## 17. CHANGE PIN FLOW

### Scenario
Person wants to change their PIN (knows current PIN).

### Questions answered

| Question | Answer |
|----------|--------|
| Is PIN change propagated? | NO — each device has its own independent local verifier |
| What happens to other devices? | Nothing — they continue using their local verifier |
| Does it invalidate existing local sessions? | YES — all OperationalSessions on this device are invalidated |
| Does it require cloud verification? | NO — current PIN verified locally |
| Does it require current PIN? | YES — `changePin(currentPin, newPin, deviceId)` |
| Does recovery reset all devices? | NO — only the current device |
| Does it require Magic Code? | NO — current PIN is sufficient |

### Change PIN flow

```
Application: Settings → Change PIN
  → cloudAuth.changePin(currentPin: string, newPin: string, deviceId: UUID): Promise<void>
    1. verifyPin(currentPin, deviceId) → must succeed
    2. if (currentPin === newPin) → reject with error "PIN unchanged"
    3. Generate new PBKDF2(newPin, newRandomSalt, 100000)
    4. Replace LocalPinVerifier in device Keychain
    5. Invalidate all OperationalSessions for this device (local)
    6. Return void
```

### Cloud notification — optional

After a PIN change, the device may optionally call:
```typescript
api.notifyPinChanged(deviceId: UUID, changedAt: ISO8601): Promise<void>
```
This allows the cloud to log the event for audit purposes, but is not required for security (each device's local verifier is the authority).

---

## 18. SESSION MODEL

### Two session types

```typescript
// CLOUD SESSION — owned by @soostori/auth
interface CloudSession {
  accessToken: string
  refreshToken: string
  userId: string         // cloud $users.id
  expiresAt: ISO8601     // access token expiry
  lastValidatedAt: ISO8601  // when cloud last confirmed validity
  deviceId?: string      // if device is enrolled
}

// OPERATIONAL SESSION — owned by @soostori/auth (device-local)
interface OperationalSession {
  deviceId: UUID
  personId: UUID
  businessId: UUID
  employeeId: UUID
  createdAt: ISO8601
  expiresAt: ISO8601       // offline operational window (derived from lastValidatedAt + grace days)
  lastValidatedAt: ISO8601  // last cloud verification of this session
  isUnlocked: boolean       // false until PIN verified
}
```

### Cloud session staleness

```typescript
// Owned by @soostori/auth
const CLOUD_SESSION_STALE_MS = 24 * 60 * 60 * 1000  // 24 hours

cloudAuth.isSessionStale(): boolean
// true if: Date.now() - lastValidatedAt > CLOUD_SESSION_STALE_MS

cloudAuth.restoreSession(): Promise<CloudSession | null>
// If offline and stale → returns null (cannot use cached)
// If offline and not stale → returns cached session
// If online → validates with server, updates lastValidatedAt
```

### Offline operational entitlement

```typescript
// Owned by @soostori/offline
const OFFLINE_GRACE_DAYS = 3

computeOfflineState(inputs: PolicyInputs): OfflineState
// Returns phase: ONLINE | OFFLINE_NORMAL | OFFLINE_WARNING | OFFLINE_LIMIT_EXCEEDED
// Computed from: lastValidatedAt + OFFLINE_GRACE_DAYS
```

### State relationship

```
CloudSession.isStale (24h) ←── owned by @soostori/auth
        ↓
     if stale + offline → cannot restore session
        ↓
if not stale + offline → can use cached CloudSession
        ↓
OperationalSession.expiresAt = lastValidatedAt + OFFLINE_GRACE_DAYS
        ↓
computeOfflineState() → determines canSell / canReceiveStock / canViewReports
```

These two policies are now **connected through `lastValidatedAt`** — the timestamp of the last successful cloud verification of the session.

---

## 19. OFFLINE AUTH MODEL

### State machine

```typescript
type AuthOfflinePhase =
  | 'ONLINE'                    // cloud reachable, session fresh
  | 'ONLINE_STALE'             // cloud reachable, session stale (needs refresh)
  | 'OFFLINE_NORMAL'           // offline, within grace, can operate
  | 'OFFLINE_WARNING'           // offline, day 3, banner shown
  | 'OFFLINE_LIMIT_EXCEEDED'   // offline, beyond grace, blocked
  | 'SIGNED_OUT'
  | 'REAUTH_REQUIRED'           // session expired, cloud login needed
```

### How states are determined

```typescript
// In @soostori/auth
cloudAuth.getAuthPhase(): AuthOfflinePhase {
  const session = this.getSession()
  const isOnline = await this.platform.getNetworkStatus()

  if (!session) return 'SIGNED_OUT'
  if (isOnline) {
    if (this.isSessionStale()) return 'ONLINE_STALE'
    return 'ONLINE'
  }
  // offline path
  const offlineState = computeOfflineState({ ...inputs, isOnline: false })
  if (offlineState.phase === 'OFFLINE_LIMIT_EXCEEDED') return 'OFFLINE_LIMIT_EXCEEDED'
  if (offlineState.phase === 'OFFLINE_WARNING') return 'OFFLINE_WARNING'
  return 'OFFLINE_NORMAL'
}
```

### What each phase allows

| Phase | Cloud Auth | POS Operations | PIN Verification | Data Sync |
|-------|-----------|---------------|------------------|-----------|
| `ONLINE` | ✅ | ✅ | ✅ | ✅ |
| `ONLINE_STALE` | ⚠️ refresh needed | ✅ | ✅ | ✅ |
| `OFFLINE_NORMAL` | ❌ | ✅ | ✅ | ❌ |
| `OFFLINE_WARNING` | ❌ | ✅ (banner) | ✅ | ❌ |
| `OFFLINE_LIMIT_EXCEEDED` | ❌ | ❌ | ❌ | ❌ |
| `SIGNED_OUT` | ❌ (re-login) | ❌ | ❌ | ❌ |
| `REAUTH_REQUIRED` | ❌ (full login) | ❌ | ❌ | ❌ |

---

## 20. MULTI-BUSINESS MODEL

### Data model

```typescript
interface PersonContext {
  person: Person
  memberships: BusinessMembership[]   // ALL businesses
  activeMembership: BusinessMembership | null   // currently selected
  activeBusiness: Business | null
  activeRole: EmployeeRole | null
  activePermissions: string[]
}

// Getting all memberships
cloudAuth.getPersonContext(): PersonContext

// Switching business
cloudAuth.setActiveBusiness(businessId: UUID): Promise<void>
// Invalidates activeRole, activePermissions, OperationalSession
// Requires re-enrollment check on new business
```

### Business switch flow

```
cloudAuth.setActiveBusiness(newBusinessId)
  → Validate person has membership on newBusinessId
  → Update activeMembership
  → cloudAuth.getDeviceStatus(newBusinessId, deviceId)
    → if device not enrolled for new business → DEVICE_ENROLLMENT_REQUIRED
    → if device hasPin for new business → PIN_VERIFICATION_REQUIRED
    → if device enrolled + PIN verified → OperationalSession for new business
```

### Role per business

A person with `owner` role on Business A and `cashier` role on Business B:
```typescript
cloudAuth.setActiveBusiness(businessA.id)
cloudAuth.getRole()  // → 'owner'

cloudAuth.setActiveBusiness(businessB.id)
cloudAuth.getRole()  // → 'cashier'
```

---

## 21. ACCOUNT LINKING MODEL

### The rule

> Google identity and email/password identity are NOT automatically linked, even if the email address is the same.

### When linking is needed

A person who registered with `email/password` should be able to add Google as an authentication method — so they can use either method to log in and get the same `CloudUser` record.

### Linking flow (explicit, user-initiated)

```
Person logged in via email/password
  → Settings → Linked Accounts → "Connect Google"
  → cloudAuth.linkGoogleAccount(idToken: string): Promise<{ linked: true }>
    → api.linkAccount({ type: 'google', idToken })
    → FIDScript matches Google email to existing $users record
    → Links googleCredentials to existing CloudUser
    → Future signInWithGoogle resolves to same CloudUser
```

### Security constraint

Account linking requires an **active cloud session** for the account being linked to. You cannot link to an account you are not currently logged into.

### Anti-auto-merge rule

```
signInWithGoogle(email: "alice@example.com")
  → If no existing account with that Google subject → create new CloudUser
  → If existing account with that Google subject → return existing CloudUser
  → If existing account with email "alice@example.com" but NOT linked to Google
    → Do NOT auto-merge
    → Show: "This email is registered. Please sign in with your password to link Google."
```

---

## 22. SECURITY MODEL

### Threat coverage

| Threat | Mitigation |
|--------|------------|
| PKCE code interception | S256 challenge — verifier never leaves device |
| Token replay | Short-lived access tokens; refresh token rotation |
| Session hijacking | Tokens in platform secure storage (Keychain/Keystore) |
| Offline session abuse | 24h staleness check on cached session; 3-day offline limit enforced by offline policy |
| PIN brute-forcing | 100,000 PBKDF2 iterations; per-device attempt lockout (see below) |
| PIN stored in cloud | Eliminated — local only |
| Device enrollment spoofing | Device authorization requires business membership (owner/manager can authorize) |
| Permission escalation | RBAC enforced in SDK + backend must enforce independently |
| Auth error information leakage | Generic error messages; no userExists() oracle |

### PIN attempt lockout — recommended

```typescript
interface PinAttemptPolicy {
  maxAttempts: 5
  lockoutDurationMs: 5 * 60 * 1000    // 5 minutes
  maxConsecutiveFailures: 10
  requireRecoveryAfterMax: true
}

// Stored device-locally (in Keychain alongside verifier)
// Resets on successful verification
```

If `maxConsecutiveFailures` reached: invoke `initiatePinRecovery()` automatically.

### Secure storage mapping by platform

| Platform | Storage for CloudSession | Storage for LocalPinVerifier |
|----------|------------------------|---------------------------|
| Web | HTTP-only cookie (handled by OAuth callback) | `sessionStorage` (web has no PIN) |
| Desktop (Electron) | `safeStorage` API (OS credential store) | `safeStorage` API |
| Mobile (React Native) | `expo-secure-store` (Keychain/Keystore) | `expo-secure-store` |

### What is NOT stored in the cloud

- PIN hash, salt, or any derived value
- `OperationalSession`
- Any device-local authentication state

---

## 23. ERROR MODEL

### Error ownership

| Package | Owns errors |
|---------|-------------|
| `@soostori/auth` | `AuthError`: all cloud authentication failures, session errors, PIN errors |
| `@soostori/offline` | `OfflineError`: offline policy violations |
| `@soostori/subscription` | `SubscriptionExpiredError`: entitlement violations |
| `@soostori/devices` | `DeviceError`: enrollment/revocation errors |

### AuthErrorCode — revised

```typescript
type AuthErrorCode =
  // Credentials
  | 'INVALID_CREDENTIALS'        // wrong password / Google token
  | 'ACCOUNT_NOT_FOUND'           // no CloudUser for this identifier

  // Session
  | 'SESSION_EXPIRED'             // access token expired, refresh needed
  | 'SESSION_REVOKED'             // token explicitly revoked server-side
  | 'REFRESH_TOKEN_INVALID'       // refresh token rejected

  // Operational
  | 'PIN_REQUIRED'               // device enrolled, PIN not verified yet
  | 'PIN_INVALID'                 // wrong PIN
  | 'PIN_LOCKED'                 // too many attempts
  | 'PIN_NOT_CONFIGURED'          // no PIN set on this device
  | 'PIN_CHANGE_REJECTED'         // current PIN wrong on change

  // Provisioning / Access
  | 'DEVICE_NOT_ENROLLED'        // device not registered for this business
  | 'DEVICE_PENDING_APPROVAL'    // device awaiting authorization
  | 'DEVICE_REVOKED'             // device explicitly revoked
  | 'MEMBERSHIP_REVOKED'         // person's access to business revoked
  | 'BUSINESS_SELECTION_REQUIRED' // multiple memberships, none selected
  | 'PROVISIONING_REQUIRED'      // no memberships found for this person
  | 'SUBSCRIPTION_EXPIRED'        // subscription blocks operation (delegate to subscription package)

  // Recovery
  | 'RECOVERY_CODE_INVALID'      // wrong/missing recovery code
  | 'RECOVERY_CODE_EXPIRED'      // recovery code timed out
  | 'RECOVERY_TOKEN_INVALID'      // recovery session token invalid

  // Auth protocol
  | 'OFFLINE_NOT_ALLOWED'        // operation requires online
  | 'INVALID_STATE'              // PKCE state mismatch, OAuth error
  | 'API_ERROR'                  // backend returned error
```

### AuthResult discriminated union

```typescript
type AuthResult<T> = { ok: true; data: T } | { ok: false; error: AuthError }

interface AuthError extends Error {
  code: AuthErrorCode
  status?: number        // HTTP status if from API
  details?: unknown      // extra context
  retryable: boolean    // true → can retry; false → must take action
}
```

---

## 24. STATE MACHINE

### Formal state machine

```typescript
type AuthState =
  | 'SIGNED_OUT'
  | 'CLOUD_AUTHENTICATING'
  | 'CLOUD_AUTHENTICATED'           // cloud session obtained, no business selected
  | 'PROVISIONING_REQUIRED'          // authenticated but no membership
  | 'BUSINESS_SELECTION_REQUIRED'    // multiple memberships, none selected
  | 'DEVICE_ENROLLMENT_REQUIRED'    // business selected, device not enrolled
  | 'PIN_SETUP_REQUIRED'            // device enrolled, no PIN configured
  | 'PIN_VERIFICATION_REQUIRED'     // PIN exists, not yet verified this session
  | 'OPERATIONAL'                   // fully unlocked, POS available
  | 'OFFLINE_OPERATIONAL'           // OPERATIONAL but offline
  | 'OFFLINE_WARNING'                // day 3 of offline, banner
  | 'OFFLINE_BLOCKED'               // beyond grace, all operations blocked
  | 'REAUTH_REQUIRED'               // cloud session expired, re-login needed
  | 'DEVICE_REVOKED'                // this device revoked
  | 'ACCESS_REVOKED'               // membership revoked

// Valid transitions
SIGNED_OUT
  → CLOUD_AUTHENTICATING: [signInWithGoogle, signInWithEmail, signInWithGoogleIdToken]
  ↓
CLOUD_AUTHENTICATED
  → PROVISIONING_REQUIRED: [if memberships.length === 0]
  → BUSINESS_SELECTION_REQUIRED: [if memberships.length > 1]
  → DEVICE_ENROLLMENT_REQUIRED: [if memberships.length === 1 and device not enrolled]
  ↓
PROVISIONING_REQUIRED / BUSINESS_SELECTION_REQUIRED
  → [user selects/creates business]
  → DEVICE_ENROLLMENT_REQUIRED
  ↓
DEVICE_ENROLLMENT_REQUIRED
  → [cloudAuth.registerDevice()]
  → PIN_SETUP_REQUIRED
  ↓
PIN_SETUP_REQUIRED
  → [cloudAuth.setupPin()]
  → OPERATIONAL
  ↓
PIN_VERIFICATION_REQUIRED
  → [cloudAuth.verifyPin()] → OPERATIONAL
  ↓
OPERATIONAL
  → [goes offline] → OFFLINE_OPERATIONAL
  → [refresh fails, session expired] → REAUTH_REQUIRED
  → [device revoked] → DEVICE_REVOKED
  → [membership revoked] → ACCESS_REVOKED
  → [signOut] → SIGNED_OUT
  ↓
OFFLINE_OPERATIONAL
  → [day 3] → OFFLINE_WARNING
  → [reconnects] → OPERATIONAL
  → [beyond grace] → OFFLINE_BLOCKED
  ↓
OFFLINE_WARNING
  → [reconnects] → OPERATIONAL
  → [beyond grace] → OFFLINE_BLOCKED
  ↓
OFFLINE_BLOCKED
  → [reconnect + cloudAuth.refreshSession()] → OPERATIONAL (if subscription valid)
```

### State ownership

| State | Owned by |
|-------|----------|
| `SIGNED_OUT` through `BUSINESS_SELECTION_REQUIRED` | `@soostori/auth` — CloudAuth |
| `DEVICE_ENROLLMENT_REQUIRED` | `@soostori/auth` + `@soostori/devices` |
| `PIN_SETUP_REQUIRED` / `PIN_VERIFICATION_REQUIRED` | `@soostori/auth` — OperationalAuth |
| `OPERATIONAL` through `OFFLINE_BLOCKED` | `@soostori/auth` + `@soostori/offline` |
| `DEVICE_REVOKED` | `@soostori/devices` |
| `ACCESS_REVOKED` | `@soostori/auth` (membership resolution) |

---

## 25. PACKAGE RESPONSIBILITY MATRIX

| Package | Responsibility |
|---------|----------------|
| `@soostori/core` | Shared types: `UUID`, `ISO8601`, `Money`, `EmployeeRole`, `SubscriptionStatus`, `DeviceStatus`, `SoostoriError`, constants (`OFFLINE_GRACE_DAYS`, `PIN_PBKDF2_ITERATIONS`, `EMPLOYEE_PIN_LENGTH`), ID brandings (`asShopId`, etc.) |
| `@soostori/auth` | CloudAuth, OperationalAuth, CloudSession, SessionStorage, PlatformAuthAdapter, AuthApiClient interface, AuthApiClient interface, TrustedDevice CRUD, PIN setup/verify/change/recovery, identity chain, RBAC, event emission |
| `@soostori/auth/pin` | React Native PIN stub (throws at runtime with migration instructions) |
| `@soostori/auth/pin-node` | Node.js PBKDF2 implementation (desktop server-side) |
| `@soostori/auth/recovery` | Magic-code based PIN recovery (new subpath) |
| `@soostori/business` | BusinessRepository interface, BusinessService, Person/Business/Membership types |
| `@soostori/subscription` | `SubscriptionCache`, `computeState()`, `isStatusActive()`, `enforceSubscription()`, `SubscriptionExpiredError`, `isApproachingDeviceLimit()` |
| `@soostori/offline` | `computeOfflineState()`, `PolicyInputs`, `OfflinePhase`, `OfflineState`, `stateChangeEvents()` |
| `@soostori/devices` | `PrimaryDeviceCoordinator`, device enrollment, heartbeat, primary election, `canAuthorStockOps()` |
| `@soostori/sync` | `SyncEngine`, idempotency, conflict detection, event queue, `STOCK_SENSITIVE_EVENTS` |
| `@soostori/events` | `EventBus`, `SoostoriEvent` envelope, `createEvent()`, `EventPayloadMap`, `SoostoriEventName` catalog |
| `@soostori/notifications` | `NotificationEngine`, `NotificationChannel`, `NotificationChannelRegistry`, `recipientResolver` |
| `@soostori/audit` | Audit event recording |
| `@soostori/cloud` | FIDScript REST transport: `CloudClient`, `createCloudClient()`, `query()`, `transact()`, `upsert()`, `getById()`, `signOut()`, `health()` — NO auth methods |

### What does NOT belong in `@soostori/cloud`

The audit found `sendMagicCode()` and `verifyMagicCode()` were previously in `@soostori/cloud`. These have been removed. The corrected rule:

> `@soostori/cloud` is a **data transport** layer for FIDScript REST operations. It handles queries, transactions, and entity helpers. Authentication — including recovery — belongs in `@soostori/auth`.

---

## 26. REMOTE DATABASE CONTRACT

### Audit of existing remote entities

| Entity | Status | Fields present | Gap |
|--------|--------|---------------|-----|
| `$users` | ✅ EXISTS | id, email, imageURL, type | None |
| `shops` | ✅ EXISTS | id, name, slug, taxRate, plan, subscriptionExpiry, status | No `companyId` |
| `employees` | ✅ EXISTS | id, createdBy, email, invitedBy, name, permissions, phone, role, shopId, status | **Missing**: `localPinHash`, `localPinSalt`, `cloudId` |
| `devices` | ✅ EXISTS | id, authorizedAt, deviceId, deviceName, deviceType, isLanHost, lastSeenAt, shopId, status | **Missing**: `hasPin` (needs addition) |
| `subscriptions` | ✅ EXISTS | amountPaid, billingCycle, currentPeriodEnd, currentPeriodStart, deviceLimit, id, planKey, shopId, status | **Missing**: `expiresAt` (derived from `currentPeriodEnd`), `nextVerificationDeadline` |
| `plans` | ✅ EXISTS | deviceLimit, features, key, name, priceMonthly, priceYearly | None |
| `syncEvents` | ✅ EXISTS | deviceId, entity, entityId, id, operation, payload, sequenceNumber, shopId, syncedAt | None |
| `payments` | ✅ EXISTS | amount, currency, id, method, paidAt, reference, shopId, status | None |
| `invitations` | ✅ EXISTS | code, createdBy, email, employeeId, employeeRole, expiresAt, id, phone, shopId, status | None |

### Classification of gaps

| Required concept | Classification | Action |
|-----------------|----------------|--------|
| `Employee.cloudId` | C (new field needed) | Add `cloudId: string` to `employees` namespace — links Employee to `$users.id` |
| `Employee.localPinHash` | D (local only) | DO NOT add to remote schema |
| `Employee.localPinSalt` | D (local only) | DO NOT add to remote schema |
| `Device.hasPin` | B (extend existing) | Add `hasPin: boolean` to `devices` namespace |
| `Device.pinSetupAt` | B (extend existing) | Add `pinSetupAt: ISO8601` to `devices` namespace (optional, for audit) |
| `subscriptions.expiresAt` | A sufficient | Use `currentPeriodEnd` as `expiresAt` |
| `subscriptions.nextVerificationDeadline` | C (new field needed) | Add `nextVerificationDeadline: ISO8601` to `subscriptions` |
| `Company` namespace | E (remove from SDK) | Remove `Company` from `IdentityContext` — not implemented |

### `Employee.cloudId` — critical missing link

The current `employees` namespace has no field linking an `Employee` record to the `$users` cloud identity. This is needed because:

```
CloudUser.id ($users.id)
  → Employee.cloudId (new field on employees)
  → links person identity to business membership
```

Without `cloudId` on `employees`, the SDK cannot resolve "which memberships does this authenticated person have?" except by querying `employees` by email — which is unreliable (email can change).

**This is the most critical remote schema addition needed.**

### Proposed `employees` extension

```json
{
  "cloudId": {
    "forward-identity": ["...", "employees", "cloudId"],
    "id": "...",
    "unique": true,
    "cardinality": "one",
    "value-type": "string",
    "catalog": "user",
    "index": true
  }
}
```

---

## 27. PROPOSED SDK API / TYPE CHANGES

### New types

```typescript
// In @soostori/auth — identity.ts (revised)

interface Person {
  id: UUID
  cloudUserId: string
  email: string
  displayName: string
  phone?: string | null
  createdAt: ISO8601
  updatedAt: ISO8601
}

interface BusinessMembership {
  membershipId: UUID
  personId: UUID
  business: Business
  role: EmployeeRole
  permissions: Record<string, boolean> | null
  status: 'invited' | 'active' | 'suspended' | 'revoked'
  subscription: {
    status: SubscriptionStatus
    expiresAt: ISO8601 | null
    plan: string
    deviceLimit: number | null
    inGracePeriod: boolean
  }
}

interface CloudAuthResult {
  cloudSession: CloudSession
  person: Person
  memberships: BusinessMembership[]
  accountStatus: 'provisioned' | 'active'
}

interface AuthResolution {
  cloudSession: CloudSession
  person: Person
  memberships: BusinessMembership[]
  accountStatus: 'provisioned' | 'active'
  requiresProvisioning: boolean
  provisioningHint?: string
}

// Operational session (device-local only — NOT in cloud)
interface OperationalSession { /* as defined in §17 */ }

// Device (extends core type)
interface OperationalDevice {
  id: UUID
  businessId: UUID
  deviceName: string
  deviceType: 'desktop' | 'mobile'
  status: DeviceStatus
  hasPin: boolean          // ← new
  registeredAt: ISO8601
  lastSeenAt: ISO8601
  authorizedAt: ISO8601 | null
}
```

### Revised CloudAuth public API

```typescript
class CloudAuth {
  // Cloud authentication — unchanged signatures
  signInWithGoogle(config: GoogleOAuthConfig): Promise<AuthResult<{ partial: true }>>
  handleOAuthCallback(code: string, state: string): Promise<AuthResult<CloudAuthResult>>
  signInWithGoogleIdToken(params: { idToken: string; clientName: string }): Promise<AuthResult<CloudAuthResult>>
  signInWithEmail(email: string, password: string): Promise<AuthResult<CloudAuthResult>>
  registerWithEmail(email: string, password: string): Promise<AuthResult<{ ok: true } | AuthError>>
  verifyEmailAddress(code: string): Promise<AuthResult<{ ok: true } | AuthError>>
  resetPassword(email: string): Promise<AuthResult<{ ok: true } | AuthError>>
  completePasswordReset(code: string, newPassword: string): Promise<AuthResult<CloudAuthResult>>

  // Session management — unchanged
  refreshSession(): Promise<AuthResult<CloudSession>>
  restoreSession(): Promise<AuthResult<CloudSession>>
  signOut(): Promise<void>

  // Business context — new
  setActiveBusiness(businessId: UUID): Promise<void>
  getActiveMembership(): BusinessMembership | null
  getPersonContext(): PersonContext

  // Device management — new/revised
  registerDevice(args: { businessId: UUID; deviceName: string; deviceType: 'desktop' | 'mobile' }): Promise<{ deviceId: UUID; status: 'pending' }>
  getDeviceStatus(businessId: UUID, deviceId: UUID): Promise<OperationalDevice>
  listDevices(businessId: UUID): Promise<OperationalDevice[]>

  // Trusted devices — unchanged
  registerTrustedDevice(deviceName: string): Promise<TrustedDevice>
  listTrustedDevices(): Promise<TrustedDevice[]>
  removeTrustedDevice(deviceId: string): Promise<void>

  // Operational Auth (PIN) — new
  getPinStatus(deviceId: UUID): Promise<'verified' | 'not_verified' | 'not_configured' | 'locked'>
  setupPin(pin: string, deviceId: UUID): Promise<{ success: true; operationalSession: OperationalSession }>
  verifyPin(pin: string, deviceId: UUID): Promise<{ success: boolean; attemptsRemaining: number }>
  changePin(currentPin: string, newPin: string, deviceId: UUID): Promise<void>
  getPinAttemptCount(deviceId: UUID): Promise<number>

  // PIN Recovery — new
  initiatePinRecovery(email: string): Promise<{ deliveryMethod: 'email' | 'magic_code'; expiresAt: ISO8601 }>
  verifyPinRecoveryCode(code: string): Promise<{ valid: boolean; recoveryToken: string; expiresAt: ISO8601 }>
  resetPin(newPin: string, recoveryToken: string, deviceId: UUID): Promise<void>

  // State queries — new
  getAuthPhase(): AuthOfflinePhase
  hasStoredSession(): Promise<boolean>

  // Events
  on(event: AuthEventName, handler: (event: AuthEvent) => void): () => void
  onAll(handler: (event: AuthEvent) => void): () => void
}

type AuthEventName =
  | 'SIGNED_IN'
  | 'SESSION_EXPIRED'
  | 'SESSION_REFRESHED'
  | 'DEVICE_REGISTERED'
  | 'DEVICE_REVOKED'
  | 'SIGNED_OUT'
  | 'ROLE_CHANGED'
  | 'MEMBERSHIP_CHANGED'
  | 'PIN_SETUP'
  | 'PIN_VERIFIED'
  | 'PIN_LOCKED'
  | 'PIN_CHANGED'
  | 'ACCOUNT_LINKED'
```

### Types to remove from `@soostori/core`

```typescript
// REMOVE from @soostori/core — not in remote schema
Employee.localPinHash: string    // device-local only
Employee.localPinSalt: string    // device-local only

// REVISE IdentityContext — remove Company
interface IdentityContext {
  user: User | null          // cloud $users record
  company: Company | null    // REMOVE — not implemented
  shop: Shop | null
  employee: Employee | null
  device: Device | null
  session: AuthSession | null
}
```

---

## 28. DEPRECATIONS

| Item | Deprecate | Replace With | Reason |
|------|-----------|-------------|--------|
| `Employee.localPinHash` in types | YES | Remove | Not in remote schema; local only |
| `Employee.localPinSalt` in types | YES | Remove | Not in remote schema; local only |
| `IdentityContext.company` | YES | Remove from type | No remote schema, not implemented |
| `BusinessRepository.findCompany()` | N/A | Does not exist | Never implemented |
| `cloudEntities.employees.localPinHash` in schema | N/A | Does not exist | Schema definition should not include |
| Magic code as primary auth | YES | Cloud auth only | Magic code is recovery only |
| `@soostori/cloud` auth methods | Already removed | N/A | Correct |
| `SESSION_STALE_THRESHOLD_MS` as auth-only | CLARIFY | Named `CLOUD_SESSION_STALE_MS` in auth, `OFFLINE_GRACE_DAYS` in offline | Both exist, clarify ownership |

### What remains unchanged

- PKCE S256 browser OAuth
- Mobile Google ID-token flow
- Email/password auth
- `AuthResult<T>` discriminated union
- `PlatformAuthAdapter`
- `TrustedDevice` CRUD
- `ROLE_PERMISSIONS` map
- `hasPermission()` / `checkPermission()`
- PBKDF2 100k/4-digit PIN cryptography (local)
- `@soostori/offline` `computeOfflineState()`
- `@soostori/subscription` `enforceSubscription()`

---

## 29. CONTRACT TEST PLAN

### Unit tests (in `@soostori/auth`)

**Cloud Auth:**
- `TEST 1` — `signInWithEmail` → returns `CloudAuthResult` with correct `memberships` array
- `TEST 2` — `signInWithGoogle` → PKCE state preserved, URL constructed correctly
- `TEST 3` — `signInWithGoogleIdToken` → passes `idToken` and `clientName` to API

**Account status:**
- `TEST 4` — authenticated person with membership → `accountStatus: 'active'`, `requiresProvisioning: false`
- `TEST 5` — authenticated person with multiple memberships → `memberships.length > 1`, no auto-selection
- `TEST 6` — authenticated person with NO memberships → `accountStatus: 'provisioned'`, `requiresProvisioning: true`

**Device enrollment:**
- `TEST 7` — first device enrollment → `registerDevice()` → `status: 'pending'`
- `TEST 8` — `getPinStatus()` on new device → `'not_configured'` when `hasPin === false`
- `TEST 9` — `getPinStatus()` on enrolled device with PIN → `'not_verified'`
- `TEST 10` — wrong PIN → returns `success: false`, decrements `attemptsRemaining`
- `TEST 11` — PIN lockout after 10 failures → `PIN_LOCKED` error

**PIN flows:**
- `TEST 12` — `setupPin()` stores verifier in secure storage mock
- `TEST 13` — `changePin()` with wrong current PIN → rejects
- `TEST 14` — `changePin()` with correct PIN → replaces verifier
- `TEST 15` — `initiatePinRecovery()` → returns delivery method
- `TEST 16` — `verifyPinRecoveryCode()` with valid code → returns `recoveryToken`
- `TEST 17` — `verifyPinRecoveryCode()` with expired code → `valid: false`
- `TEST 18` — `resetPin()` with valid recovery token → new verifier stored

**Session:**
- `TEST 19` — `restoreSession()` online → validates with server, updates `lastValidatedAt`
- `TEST 20` — `restoreSession()` offline + not stale → returns cached session
- `TEST 21` — `restoreSession()` offline + stale → returns `null`
- `TEST 22` — `refreshSession()` offline + not stale → uses cached session
- `TEST 23` — `refreshSession()` offline + stale → `AuthError('SESSION_EXPIRED')`

**Business context:**
- `TEST 24` — `setActiveBusiness()` updates `getActiveMembership()` and `getRole()`
- `TEST 25` — `setActiveBusiness()` with invalid membership → throws

**State machine:**
- `TEST 26` — `getAuthPhase()` returns correct phase for each combination of session + network + offline time
- `TEST 27` — `SIGNED_IN` event fires after successful cloud auth
- `TEST 28` — `PIN_SETUP` event fires after `setupPin()`

### Remote integration tests (contract-tests package)

These require a live FIDScript backend:
- `TEST A` — Full email/password auth flow → membership resolution → correct `BusinessMembership` returned
- `TEST B` — Google OAuth → person has correct `cloudUserId`
- `TEST C` — Authenticated person with 2 business memberships → both memberships returned
- `TEST D` — `Device.hasPin` set to `true` after PIN setup → reflected in subsequent query
- `TEST E` — Subscription expired → `enforceSubscription()` throws at correct boundary
- `TEST F` — Device revoked → `registerDevice()` returns `REVOKED` state
- `TEST G` — 3-day offline → `computeOfflineState()` returns `OFFLINE_LIMIT_EXCEEDED`

### E2E tests (apps/web, apps/mobile, apps/desktop)

Cover full user journeys in real environments with real OAuth flows.

---

## 30. WEB INTEGRATION CONTRACT

### Platform role

Web uses cloud authentication only. It does NOT implement operational PIN.

### What Web calls

```typescript
// 1. Initiate Google OAuth
cloudAuth.signInWithGoogle({ redirectUri: 'https://app.soostori.com/auth/callback' })

// 2. Handle callback (on callback page)
const result = await cloudAuth.handleOAuthCallback(code, state)
if (!result.ok) throw result.error

// 3. Check provisioning
if (result.data.requiresProvisioning) {
  showProvisioningRequiredUI()
  return
}

// 4. Check multi-business
if (result.data.memberships.length > 1) {
  showBusinessSelectorUI(result.data.memberships)
  return
}

// 5. Auto-select single business
await cloudAuth.setActiveBusiness(result.data.memberships[0].business.id)

// 6. Show POS dashboard
showDashboard(cloudAuth.getPersonContext())
```

### What Web stores

- `CloudSession` — via platform OAuth cookie storage (HTTP-only)
- NO `OperationalSession` — Web has no PIN
- NO PIN data — Web does not use PIN

### What Web never implements

- PIN setup or verification UI
- Device enrollment flow
- Offline operational mode
- Magic code entry

### What the SDK provides for Web

```typescript
cloudAuth.on('SIGNED_IN', handler)
cloudAuth.on('SESSION_EXPIRED', handler)  // → trigger re-auth
cloudAuth.on('ROLE_CHANGED', handler)      // → re-fetch permissions
cloudAuth.getPersonContext()               // → drive role-based UI
cloudAuth.setActiveBusiness(id)            // → business switcher
```

---

## 31. MOBILE INTEGRATION CONTRACT

### Platform role

Mobile implements both cloud authentication AND operational PIN.

### What Mobile calls

```typescript
// On app launch — try to restore
async function initApp() {
  const hasSession = await cloudAuth.hasStoredSession()
  if (hasSession) {
    const result = await cloudAuth.restoreSession()
    if (result.ok) {
      await navigateToPinEntry()    // PIN verification screen
      return
    }
  }
  navigateToCloudAuth()   // Full Google/email auth
}

// PIN verification
async function onPinEntered(pin: string) {
  const deviceId = getCurrentDeviceId()
  const result = await cloudAuth.verifyPin(pin, deviceId)
  if (result.success) {
    navigateToPOS()
  } else {
    showWrongPin(result.attemptsRemaining)
    if (result.attemptsRemaining === 0) {
      showPinLocked(() => cloudAuth.initiatePinRecovery(email))
    }
  }
}
```

### What Mobile stores

- `CloudSession` — via `expo-secure-store` (Keychain/Keystore)
- `OperationalSession` — via `expo-secure-store`
- `LocalPinVerifier { hash, salt }` — via `expo-secure-store`

### What Mobile never implements

- Custom PIN hashing — uses `cloudAuth.setupPin()`, `cloudAuth.verifyPin()`, `cloudAuth.changePin()`
- Magic code delivery — uses `cloudAuth.initiatePinRecovery()` / `cloudAuth.verifyPinRecoveryCode()`

---

## 32. DESKTOP INTEGRATION CONTRACT

### Platform role

Desktop (Electron) implements both cloud authentication AND operational PIN.

### What Desktop calls

```typescript
// Main process: register device on first run
async function registerDevice() {
  const result = await cloudAuth.registerDevice({
    businessId: activeBusinessId,
    deviceName: os.hostname(),
    deviceType: 'desktop'
  })
  // Show pending screen if status === 'pending'
  // Auto-approve if subscription plan allows
}

// Renderer process: PIN screen on every launch
async function unlockApp(pin: string) {
  const result = await cloudAuth.verifyPin(pin, deviceId)
  if (result.success) {
    showPOSWindow()
  }
}
```

### What Desktop stores

- `CloudSession` — via Electron `safeStorage` API (OS credential store)
- `OperationalSession` — via `safeStorage`
- `LocalPinVerifier { hash, salt, iterations }` — via `safeStorage`

### Electron safeStorage pattern

```typescript
// Storing credentials
import { safeStorage } from 'electron'
safeStorage.encryptString(JSON.stringify(credential))  // OS-protected storage

// Retrieving credentials
const decrypted = safeStorage.decryptString(encryptedBuffer)
```

---

## 33. MIGRATION PLAN

### APIs to keep (no change)

| API | Action |
|-----|--------|
| `signInWithGoogle(config)` | KEEP — signature unchanged |
| `handleOAuthCallback(code, state)` | KEEP — signature unchanged |
| `signInWithGoogleIdToken(params)` | KEEP — signature unchanged |
| `signInWithEmail(email, password)` | KEEP — signature unchanged |
| `registerWithEmail()` / `verifyEmailAddress()` / `resetPassword()` / `completePasswordReset()` | KEEP — signatures unchanged |
| `refreshSession()` / `restoreSession()` / `signOut()` | KEEP — signatures unchanged |
| `registerTrustedDevice()` / `listTrustedDevices()` / `removeTrustedDevice()` | KEEP — signatures unchanged |
| `AuthResult<T>` / `AuthError` | KEEP — shape unchanged |
| `PlatformAuthAdapter` interface | KEEP — shape unchanged |
| `hasPermission()` / `checkPermission()` | KEEP — signature unchanged |
| `computeOfflineState()` | KEEP — signature unchanged |
| `enforceSubscription()` | KEEP — signature unchanged |
| `CloudClient` methods | KEEP — unchanged |

### APIs to add

| New API | Package |
|---------|---------|
| `cloudAuth.setActiveBusiness(businessId)` | `@soostori/auth` |
| `cloudAuth.getPersonContext()` | `@soostori/auth` |
| `cloudAuth.registerDevice(args)` | `@soostori/auth` |
| `cloudAuth.getDeviceStatus(businessId, deviceId)` | `@soostori/auth` |
| `cloudAuth.listDevices(businessId)` | `@soostori/auth` |
| `cloudAuth.getPinStatus(deviceId)` | `@soostori/auth` |
| `cloudAuth.setupPin(pin, deviceId)` | `@soostori/auth` |
| `cloudAuth.verifyPin(pin, deviceId)` | `@soostori/auth` |
| `cloudAuth.changePin(current, new, deviceId)` | `@soostori/auth` |
| `cloudAuth.initiatePinRecovery(email)` | `@soostori/auth` |
| `cloudAuth.verifyPinRecoveryCode(code)` | `@soostori/auth` |
| `cloudAuth.resetPin(newPin, recoveryToken, deviceId)` | `@soostori/auth` |
| `cloudAuth.getAuthPhase()` | `@soostori/auth` |
| `cloudAuth.hasStoredSession()` | `@soostori/auth` |
| `AuthResolution` type | `@soostori/auth` |
| `BusinessMembership` type | `@soostori/auth` |
| `OperationalSession` type | `@soostori/auth` |
| `OperationalDevice` type | `@soostori/auth` |
| `AuthOfflinePhase` type | `@soostori/auth` |
| New auth events: `ROLE_CHANGED`, `PIN_SETUP`, `PIN_VERIFIED`, `PIN_LOCKED`, `PIN_CHANGED`, `MEMBERSHIP_CHANGED`, `SESSION_REFRESHED` | `@soostori/auth` |

### Types to remove from `@soostori/core`

| Removed type | Reason |
|-------------|--------|
| `Employee.localPinHash` | Not in remote schema; local only |
| `Employee.localPinSalt` | Not in remote schema; local only |
| `IdentityContext.company` | Not implemented |
| `AuthSession.companyId` | Not implemented |

### Remote schema changes required (outside SDK — backend team)

1. Add `cloudId: string` (unique, indexed) to `employees` namespace
2. Add `hasPin: boolean` to `devices` namespace
3. Add `pinSetupAt: ISO8601` (optional) to `devices` namespace
4. Add `nextVerificationDeadline: ISO8601` to `subscriptions` namespace

### Migration sequence

```
Phase 1: Remote schema (backend team)
  → Add cloudId to employees
  → Add hasPin, pinSetupAt to devices
  → Add nextVerificationDeadline to subscriptions

Phase 2: Publish unpublished packages
  → @soostori/devices@0.1.0-alpha.1
  → @soostori/sync@0.1.0-alpha.1

Phase 3: SDK type changes (@soostori/core)
  → Remove localPinHash, localPinSalt from Employee type
  → Remove company from IdentityContext

Phase 4: SDK API changes (@soostori/auth)
  → Add new methods and types
  → Add new events
  → Deprecate old events if any

Phase 5: App integration
  → Web: add business selector, remove any PIN code
  → Mobile: add PIN setup/verify/recovery flows
  → Desktop: add device enrollment, PIN setup/verify flows
```

---

## 34. RISKS / OPEN ARCHITECTURE QUESTIONS

### Risk 1: `Employee.cloudId` addition to FIDScript schema

**Risk:** Requires backend schema migration on both existing apps.
**Mitigation:** The `cloudId` field can be added as nullable initially, then populated retroactively by querying `employees` by email matching `$users.email`.
**Open question:** Can a FIDScript schema migration be performed without downtime?

### Risk 2: New device PIN independence may confuse users

**Risk:** Users who expect "same PIN on all devices" may be confused that each device has its own PIN.
**Mitigation:** UI must clearly communicate: "Create a PIN for THIS device." The concept is similar to "device passcode" on phones — each device has its own.
**Open question:** Should there be an optional "sync PIN setup" flow where the user enters their existing PIN once on the new device to derive the new device's local verifier? This would require Option A from §14 (cloud PIN verification on first entry). Deferred for later iteration.

### Risk 3: `AuthApiClient` reference implementation absent

**Risk:** Every platform (Web, Mobile, Desktop) must independently implement the `AuthApiClient` FIDScript calls. No reference implementation exists.
**Mitigation:** The `@soostori/auth` test suite provides mock implementations. A reference FIDScript implementation guide (document) should be produced alongside this architecture.
**Open question:** Should the SDK provide a default `MockAuthApiClient` for development?

### Risk 4: Magic code delivery mechanism

**Risk:** The audit found Magic Code was removed from `@soostori/cloud`. The recovery flow requires a mechanism to deliver a code. The current plan uses email + magic code, but the delivery channel (WhatsApp, email link, SMS) is not finalized.
**Open question:** What is the approved delivery channel for PIN recovery codes? Email magic code? WhatsApp? This must be confirmed before implementing `initiatePinRecovery()`.

### Risk 5: `@soostori/audit` implementation unknown

**Risk:** The `@soostori/audit` package was listed in `apps/web/package.json` but its implementation was not audited.
**Mitigation:** Full audit of `@soostori/audit` before any integration work.
**Open question:** Does `@soostori/audit` record `auth.login`, `auth.failed`, `auth.logout` events to FIDScript `syncEvents`, or to a separate audit namespace?

### Risk 6: Subscription grace period and session staleness interaction

**Risk:** A user could be `OPERATIONAL` (session not stale, within 3-day grace) but their subscription has actually expired — `enforceSubscription()` would block POS ops even though the auth phase appears green.
**Resolution in design:** `enforceSubscription()` is called explicitly by the application before POS operations. The auth phase and subscription state are independent. The application must check both.

### Risk 7: Company removal from IdentityContext

**Risk:** Any existing code that reads `identity.company` will break silently (returns `null`).
**Mitigation:** TypeScript will flag this at compile time. Search for `.company` access in identity context usage before shipping.

---

## 35. FINAL IMPLEMENTATION CHECKLIST

### Before any integration work

- [ ] Publish `@soostori/devices` to npm
- [ ] Publish `@soostori/sync` to npm
- [ ] Audit `@soostori/audit` implementation (full read)
- [ ] Confirm Magic Code delivery channel (email? WhatsApp?)

### Remote schema changes (backend team, outside SDK)

- [ ] Add `cloudId: string (unique, indexed)` to `employees` namespace
- [ ] Add `hasPin: boolean` to `devices` namespace
- [ ] Add `pinSetupAt: ISO8601` (optional) to `devices` namespace
- [ ] Add `nextVerificationDeadline: ISO8601` to `subscriptions` namespace
- [ ] Populate `employees.cloudId` for existing employees (match by email)

### Phase 1: SDK type changes

- [ ] `@soostori/core`: Remove `Employee.localPinHash`, `Employee.localPinSalt`
- [ ] `@soostori/core`: Remove `IdentityContext.company`
- [ ] `@soostori/core`: Add `Device.hasPin?: boolean` to type definition (optional — cloud may have it)
- [ ] `@soostori/core`: Add `SubscriptionEntitlement.expiresAt` (derived)

### Phase 2: SDK API additions

- [ ] `@soostori/auth`: Add `setActiveBusiness()`, `getPersonContext()`, `getActiveMembership()`
- [ ] `@soostori/auth`: Add `registerDevice()`, `getDeviceStatus()`, `listDevices()`
- [ ] `@soostori/auth`: Add `getPinStatus()`, `setupPin()`, `verifyPin()`, `changePin()`
- [ ] `@soostori/auth`: Add `initiatePinRecovery()`, `verifyPinRecoveryCode()`, `resetPin()`
- [ ] `@soostori/auth`: Add `getAuthPhase()`, `hasStoredSession()`
- [ ] `@soostori/auth`: Add new event types (`PIN_SETUP`, `PIN_VERIFIED`, etc.)
- [ ] `@soostori/auth`: Add new types (`BusinessMembership`, `OperationalSession`, `OperationalDevice`, `PersonContext`, `AuthResolution`)
- [ ] `@soostori/auth`: Implement `OperationalAuth` class (device-local PIN operations)
- [ ] Add `recovery` conditional export subpath to `@soostori/auth`

### Phase 3: SDK deprecations

- [ ] `@soostori/core`: Deprecate `Employee.cloudId` (add as new field, don't remove existing if any)
- [ ] Document: Magic code is recovery-only, not primary auth

### Phase 4: Package exports

- [ ] `@soostori/auth`: Export `OperationalAuth` and `OperationalSession` from main entry
- [ ] Web: Verify no accidental PIN imports
- [ ] Mobile: Add `@soostori/auth/pin-node` to optionalDeps (not required)
- [ ] Desktop: Ensure `@soostori/auth/pin-node` is imported for desktop PIN operations

### Phase 5: Tests

- [ ] Add 28 unit tests for new CloudAuth methods
- [ ] Add unit tests for OperationalAuth (setup, verify, change, lockout)
- [ ] Add unit tests for PIN recovery flow
- [ ] Add unit tests for state machine transitions
- [ ] Add contract tests for device enrollment
- [ ] Update CHANGELOG.md

### Phase 6: Documentation

- [ ] `@soostori/auth/README.md`: Document cloud vs operational auth separation
- [ ] `@soostori/auth/README.md`: Document device enrollment flow
- [ ] `@soostori/auth/README.md`: Document PIN architecture (local only)
- [ ] `@soostori/auth/README.md`: Document Magic Code (recovery only)
- [ ] Produce `AUTH_API_GUIDE.md` for backend team (AuthApiClient FIDScript implementation reference)

---

*End of Architecture Proposal.*
*This document is the specification for the next implementation task.*
*DO NOT IMPLEMENT until reviewed and approved.*
