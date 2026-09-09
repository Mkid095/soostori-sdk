# AuthApiClient — Next.js Route Handler Specification

> This document specifies the backend REST API endpoints that implement the `AuthApiClient`
> interface. All endpoints live in the Next.js application as Route Handlers.
> No separate backend service exists — Next.js IS the backend for these operations.
>
> These endpoints are NOT part of the public SDK contract — they are internal
> backend implementation details consumed only by SDK platform adapters.

**Base path**: `/api/auth`
**Auth**: All endpoints require a valid FIDScript session cookie or access token.
**Content-Type**: `application/json`

---

## Security Model

Each endpoint that operates on an employee or device MUST verify that the
authenticated `$users.id` (from session) corresponds to a valid `employees` record
with `employees.cloudId == auth.uid`. All mutations must be scoped to that employee
and shop.

Rate limits are enforced server-side per employeeId for recovery operations.
Enrollment token operations are atomic single-use operations.

---

## POST `/api/auth/verify-pin-for-enrollment`

**Purpose**: Cross-device PIN verification — second device proves knowledge of existing PIN.

**Request**:
```typescript
{
  employeeId: string    // Which employee is enrolling
  pinProof: string      // PBKDF2(pin, canonicalSalt) — lowercase hex
  shopId: string
  deviceId: string
}
```

**Behavior**:
1. Validate session → get `auth.uid` → verify `employees.cloudId == auth.uid` for this employeeId
2. Fetch `canonicalSalt` and `canonicalVerifier` for this employee from the encrypted DB
3. Compute `PBKDF2(pinProof_input, canonicalSalt)` and constant-time compare to `canonicalVerifier`
4. On match: generate enrollment token, store in DB with 5-minute TTL, return token
5. On mismatch: increment failed-attempt counter; after 5 failures, apply 30-second lockout
6. Rate limit: 1 verification per 30 seconds per employeeId

**Response (success)**:
```typescript
{
  data: {
    enrollmentToken: string  // opaque UUID, single-use
    expiresAt: string       // ISO8601, 5 minutes from now
  }
}
```

**Response (error)**:
```typescript
{
  error: {
    code: 'INVALID_PIN' | 'RATE_LIMITED' | 'EMPLOYEE_NOT_FOUND'
    message: string
    retryAfterMs?: number
  }
}
```

**Error codes**:
- `INVALID_PIN` — PIN proof does not match
- `RATE_LIMITED` — too many attempts, `retryAfterMs` included
- `EMPLOYEE_NOT_FOUND` — no employee with that ID for this user

---

## POST `/api/auth/consume-enrollment-token`

**Purpose**: Atomic single-use token consumption — validates token, stores new canonical PIN verifier.

**Request**:
```typescript
{
  enrollmentToken: string   // The token from verify-pin-for-enrollment
  employeeId: string
  shopId: string
  deviceId: string
  newPinVerifier: string   // PBKDF2(newPin, newSalt) — lowercase hex
  newPinSalt: string       // hex-encoded 32-byte salt
}
```

**Behavior**:
1. Find token in DB — if not found or expired → `TOKEN_EXPIRED`
2. If `consumed == true` → `TOKEN_ALREADY_USED`
3. If `scope_hash != SHA256(employeeId + shopId + deviceId)` → `TOKEN_SCOPE_MISMATCH`
4. All validations pass: atomically in one transaction:
   - Mark token as `consumed = true`, `consumed_at = now()`
   - Store `canonicalVerifier = newPinVerifier`, `canonicalSalt = newPinSalt` for this employeeId
   - Optionally: upsert `devices` record with `hasPin = true`, `pinSetupAt = now()`
5. Return success

**Response (success)**:
```typescript
{ data: { success: true } }
```

**Response (error)**:
```typescript
{
  error: {
    code: 'TOKEN_EXPIRED' | 'TOKEN_ALREADY_USED' | 'TOKEN_SCOPE_MISMATCH'
    message: string
  }
}
```

---

## POST `/api/auth/request-pin-recovery`

**Purpose**: Initiate PIN recovery — sends 6-digit code to employee's verified email.

**Request**:
```typescript
{ employeeId: string }
```

**Behavior**:
1. Validate session → verify `auth.uid == employees.cloudId` for this employeeId
2. Check rate limit: if a recovery code was sent in the last 60 seconds → `RATE_LIMITED`
3. Generate 6-digit random code (uniform distribution, not predictable)
4. Store `code_hash = bcrypt(code, cost=10)` with `expires_at = now + 10 minutes`
5. Store `attempts = 0`
6. Send email via transactional email provider (NOT FIDScript magic-code email)
7. Return cooldown seconds

**Response (success)**:
```typescript
{ data: { cooldownSeconds: number } }  // typically 60
```

**Response (error)**:
```typescript
{
  error: {
    code: 'RATE_LIMITED' | 'EMPLOYEE_NOT_FOUND' | 'EMAIL_DELIVERY_FAILED'
    message: string
    retryAfterMs?: number
  }
}
```

---

## POST `/api/auth/verify-pin-recovery-code`

**Purpose**: Validate recovery code, return short-lived recovery auth token.

**Request**:
```typescript
{ employeeId: string; code: string }
```

**Behavior**:
1. Fetch stored `code_hash` for this employeeId
2. If expired (`expires_at < now`) → `CODE_EXPIRED`
3. If `attempts >= 5` → `TOO_MANY_ATTEMPTS`
4. Compute `bcrypt.compare(code, code_hash)` — constant-time
5. If mismatch: increment `attempts++`, save → `INVALID_CODE`
6. If match: delete `code_hash` row, generate `recoveryAuthToken = JWT{employeeId, exp: +10min}`
7. Store `recoveryAuthToken_hash = SHA256(token)` in DB with `expires_at = now + 10 minutes`
8. Return token and expiry

**Response (success)**:
```typescript
{
  data: {
    recoveryAuthToken: string  // JWT, 10-minute TTL
    expiresAt: string         // ISO8601
  }
}
```

**Response (error)**:
```typescript
{
  error: {
    code: 'INVALID_CODE' | 'CODE_EXPIRED' | 'TOO_MANY_ATTEMPTS'
    message: string
    retryAfterMs?: number
  }
}
```

---

## POST `/api/auth/reset-pin-with-recovery`

**Purpose**: Final step of PIN recovery — atomically consume token and reset PIN.

**Request**:
```typescript
{
  recoveryAuthToken: string
  employeeId: string
  newPinVerifier: string   // PBKDF2(newPin, newSalt)
  newPinSalt: string
}
```

**Behavior**:
1. Find `recoveryAuthToken_hash` for this employeeId
2. Compute `SHA256(recoveryAuthToken)` and compare
3. If not found or `expires_at < now` → `TOKEN_EXPIRED`
4. Atomically:
   - Update `canonicalVerifier = newPinVerifier`, `canonicalSalt = newPinSalt`
   - Delete `recoveryAuthToken_hash` row
   - Optionally: set `hasPin = false` on all other enrolled devices (force re-enrollment)
5. Return success

**Response (success)**:
```typescript
{ data: { success: true } }
```

**Response (error)**:
```typescript
{
  error: {
    code: 'TOKEN_EXPIRED' | 'TOKEN_INVALID'
    message: string
  }
}
```

---

## POST `/api/auth/change-pin`

**Purpose**: Change PIN when already authenticated with existing PIN (not recovery).

**Request**:
```typescript
{
  employeeId: string
  shopId: string
  deviceId: string
  oldPinProof: string    // PBKDF2(oldPin, canonicalSalt)
  newPinVerifier: string
  newPinSalt: string
}
```

**Behavior**:
1. Validate session → verify `auth.uid == employees.cloudId`
2. Fetch `canonicalVerifier` for employeeId
3. Compute `PBKDF2(oldPinProof, canonicalSalt)` — constant-time compare to stored verifier
4. If mismatch → `INVALID_PIN`
5. On match: update `canonicalVerifier = newPinVerifier`, `canonicalSalt = newPinSalt`
6. Optionally: mark other enrolled devices for re-enrollment
7. Return success

**Response (success)**:
```typescript
{ data: { success: true } }
```

**Response (error)**:
```typescript
{
  error: {
    code: 'INVALID_PIN' | 'RATE_LIMITED'
    message: string
    retryAfterMs?: number
  }
}
```

---

## GET `/api/auth/enrolled-devices`

**Purpose**: List all enrolled devices for an employee in a shop.

**Request**: `?employeeId=<id>&shopId=<id>`

**Behavior**:
1. Validate session → verify `auth.uid == employees.cloudId` for this employeeId
2. Query FIDScript `devices` entity for all records where `shopId == shopId`
3. For each device, return id, deviceName, hasPin (if field exists), pinSetupAt, lastSeenAt, status

**Response (success)**:
```typescript
{
  data: Array<{
    deviceId: string
    deviceName: string
    hasPin: boolean
    pinSetupAt: string | null
    lastSeenAt: string | null
    status: string
  }>
}
```

---

## DELETE `/api/auth/devices/:deviceId`

**Purpose**: Revoke a device's PIN session — forces re-enrollment.

**Request**: URL param `deviceId`, body `{ employeeId: string; shopId: string }`

**Behavior**:
1. Validate session → verify `auth.uid == employees.cloudId` with owner/admin role for this shopId
2. Find device in FIDScript by `deviceId`
3. Update: set `hasPin = false`, `pinSetupAt = null`, `status = 'revoked'`
4. Optionally: delete local PIN verifier (it lives in device Keychain, not FIDScript — device will handle this)
5. Return success

**Response (success)**:
```typescript
{ data: { success: true } }
```

**Response (error)**:
```typescript
{
  error: {
    code: 'DEVICE_NOT_FOUND' | 'FORBIDDEN'
    message: string
  }
}
```

---

## GET `/api/auth/subscription-status`

**Purpose**: Fetch subscription status for device enrollment gate.

**Request**: `?shopId=<id>`

**Behavior**:
1. Validate session → verify `auth.uid == employees.cloudId` for this shopId
2. Query `subscriptions` entity for this shopId
3. Join with `plans` to get deviceLimit
4. Count enrolled devices for this shopId
5. Return status and counts

**Response (success)**:
```typescript
{
  data: {
    status: 'active' | 'past_due' | 'expired' | 'cancelled' | 'trialing'
    currentPeriodEnd: string   // ISO8601
    deviceLimit: number
    deviceCount: number       // enrolled devices in FIDScript
  }
}
```

**Response (error)**:
```typescript
{
  error: {
    code: 'SHOP_NOT_FOUND' | 'SUBSCRIPTION_NOT_FOUND'
    message: string
  }
}
```

---

## Database Schema (Encrypted DB Tables)

These tables live in the Next.js backend's encrypted database — NOT in FIDScript.

```sql
-- Canonical PIN verifier per employee
CREATE TABLE pin_verifiers (
  employee_id    TEXT PRIMARY KEY,  -- references employees.id
  verifier       TEXT NOT NULL,     -- PBKDF2 hash, lowercase hex
  salt           TEXT NOT NULL,    -- 32-byte salt, lowercase hex
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Enrollment tokens (short-lived, single-use)
CREATE TABLE enrollment_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   TEXT NOT NULL,
  shop_id       TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,  -- SHA256(token), for constant-time lookup
  scope_hash    TEXT NOT NULL,        -- SHA256(employee_id+shop_id+device_id)
  expires_at    TIMESTAMP NOT NULL,
  consumed      BOOLEAN DEFAULT FALSE,
  consumed_at   TIMESTAMP
);
CREATE INDEX idx_enrollment_tokens_token_hash ON enrollment_tokens(token_hash);
CREATE INDEX idx_enrollment_tokens_expires ON enrollment_tokens(expires_at) WHERE consumed = FALSE;

-- PIN recovery codes
CREATE TABLE pin_recovery (
  employee_id   TEXT PRIMARY KEY,  -- one active code per employee
  code_hash     TEXT NOT NULL,     -- bcrypt(code, cost=10)
  expires_at    TIMESTAMP NOT NULL,
  attempts      INT DEFAULT 0
);

-- PIN recovery auth tokens
CREATE TABLE pin_recovery_tokens (
  employee_id   TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,  -- SHA256(jwt_token)
  expires_at    TIMESTAMP NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_pin_recovery_tokens_hash ON pin_recovery_tokens(token_hash);
```

---

## Notes

- **Enrollment tokens are NOT FIDScript entities** — they are backend-only with TTL and atomic consumption semantics that FIDScript does not support.
- **PIN recovery codes are NOT FIDScript entities** — they require bcrypt hashing, rate limiting, and atomic TTL management.
- **Canonical PIN verifiers are NOT stored in FIDScript** — FIDScript's `$default` permissions allow any authenticated user to read/write — the PBKDF2 verifier is a secret and must not be accessible via FIDScript.
- **Email delivery** uses a transactional email provider (Resend/SendGrid/Postmark) — NOT FIDScript's magic-code email system. The FIDScript magic-code system is reserved for cloud identity authentication sessions.
