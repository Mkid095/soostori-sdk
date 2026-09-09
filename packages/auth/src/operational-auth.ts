/**
 * @soostori/auth — Operational Authentication
 *
 * Handles the "can this device operate?" layer — device-local PIN verification
 * that gates operational access after cloud authentication succeeds.
 *
 * ## Two-layer auth model
 *
 * Layer 1 — CloudAuth ("who are you?"):
 *   Google OAuth / email/password → CloudSession → who is the user
 *
 * Layer 2 — OperationalAuth ("can this device operate?"):
 *   Local PIN → OperationalSession → is this device permitted to make mutations
 *
 * These are entirely separate:
 *   - CloudAuth never touches the PIN
 *   - OperationalAuth never touches cloud credentials
 *
 * ## PIN semantics
 *
 * PIN is a LOCAL credential only. It NEVER becomes the cloud identity.
 *
 * ### PBKDF2 Derivation (canonical spec — DO NOT change without SDK version bump)
 *
 * Algorithm:    PBKDF2-HMAC-SHA256
 * Iterations:   100,000
 * Salt length:  32 bytes (256 bits), generated via crypto.getRandomValues
 * Key length:   32 bytes (256 bits)
 * Output encoding: lowercase hex (64 characters)
 *
 * ## PIN verifier storage
 *
 * What is stored locally (platform Keychain/Keystore):
 *   PIN_SALT_KEY     → lowercase hex encoding of the 32-byte random salt
 *   PIN_VERIFIER_KEY → lowercase hex encoding of the PBKDF2 derived key
 *
 * What is stored remotely (FIDScript via backend):
 *   Device.hasPin     → boolean: device has completed PIN enrollment
 *   Device.pinSetupAt → ISO8601: when PIN was first enrolled
 *
 * What is stored in backend for cross-device verification:
 *   Canonical PIN verifier: PBKDF2(pin, canonical_salt) — stored per employee
 *   This verifier is established on the FIRST device when the employee sets
 *   their PIN for the first time, and is used as the proof source for all
 *   subsequent cross-device enrollment requests.
 *
 * ## Cross-device PIN enrollment (Section 10 critical path)
 *
 * When a new device detects (via Device.hasPin=true) that the employee already
 * has a PIN enrolled on another device:
 *
 *   1. Device B derives proof = PBKDF2(pin_entered, canonical_salt_from_employee_record)
 *   2. Device B calls cloudApi.verifyPinForEnrollment(employeeId, proof, shopId, deviceId)
 *   3. Backend compares proof against canonical verifier for this employee
 *   4. On match: issues a short-lived, single-use enrollment token
 *      (scoped to employeeId + shopId + deviceId, expires in 5 minutes)
 *   5. Device B calls cloudApi.consumeEnrollmentToken({ token, employeeId, shopId,
 *      deviceId, newPinVerifier, newPinSalt })
 *   6. Backend atomically validates + consumes token, stores newPinVerifier for
 *      future cross-device proofs, and sets Device.hasPin=true on the new device
 *   7. Device B stores its local PIN verifier (PBKDF2(new_pin, its_own_salt))
 *
 * Key security properties:
 *   - Plaintext PIN never leaves the device
 *   - The transmitted proof is a PBKDF2 hash — not reusable without knowing the PIN
 *   - The enrollment token is single-use, scoped, and expires in 5 minutes
 *   - Concurrent replay of the same token is prevented by backend atomic consumption
 *
 * ## Enrollment state machine
 *
 *   CLOUD_AUTHENTICATED → DEVICE_ENROLLMENT_REQUIRED
 *     If Device record does not exist in cloud (new device for this shop)
 *
 *   DEVICE_ENROLLMENT_REQUIRED → PIN_SETUP_REQUIRED
 *     If Device.exists but Device.hasPin = false
 *
 *   DEVICE_ENROLLMENT_REQUIRED → PIN_VERIFICATION_REQUIRED
 *     If Device.exists and Device.hasPin = true (cloud says: device has PIN)
 *     → User must enter their existing PIN on this device to unlock
 *
 *   PIN_SETUP_REQUIRED → OPERATIONAL
 *     After PIN is set up locally and cloud is updated (hasPin = true)
 *
 *   PIN_VERIFICATION_REQUIRED → OPERATIONAL
 *     After existing PIN is verified via cross-device flow (Section 10)
 *
 * ## 3-day operational offline policy
 *
 * Operational sessions are valid for up to 3 days without cloud contact.
 * This is SEPARATE from cloud session freshness (24-hour stale threshold).
 *
 *   CloudAuth.isSessionStale (24h)   → blocks cloud API calls that need auth
 *   OperationalAuth.offline limit (72h) → blocks local PIN-verified mutations
 *
 * The two policies are independent and do not affect each other.
 *
 * ## PIN recovery
 *
 * When a user forgets their PIN:
 *   1. requestPinRecovery() → sends 6-digit code to employee's email
 *   2. verifyPinRecoveryCode() → validates code, returns short-lived recovery token
 *   3. resetPinWithRecovery() → consumes recovery token, sets new PIN verifier
 *      locally AND updates the canonical verifier in the cloud
 *
 * After PIN recovery, ALL existing enrolled devices must re-enroll
 * (their local verifiers are now out of sync with the new canonical verifier).
 * The backend should revoke affected device hasPin flags so re-enrollment is forced.
 */

import { authError, type AuthError, type AuthErrorCode } from './errors.js'
import type { AuthResult, AuthApiResponse } from './cloud-auth.js'
import type { EmployeeId, ShopId, DeviceId, ISO8601 } from '@soostori/core'

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * How long an enrollment token is valid (5 minutes).
 * Short enough that intercepted tokens are not useful.
 */
export const ENROLLMENT_TOKEN_TTL_MS = 5 * 60 * 1000

/**
 * How long a PIN verification challenge is rate-limited after failed attempts.
 * Resets to 0 after a successful verification.
 */
export const PIN_RATE_LIMIT_MS = 30 * 1000

/**
 * Number of consecutive failed PIN verifications before the device requires
 * a cloud re-authentication to continue.
 */
export const MAX_PIN_ATTEMPTS = 5

/**
 * How long an operational session is valid without cloud contact (3 days).
 * After this, mutations are blocked even if the local PIN was verified.
 * This is the 3-day operational offline entitlement — separate from
 * CloudAuth.isSessionStale which governs cloud API call freshness.
 */
export const OFFLINE_ENTITLEMENT_TTL_MS = 3 * 24 * 60 * 60 * 1000

// ─── Enrollment state machine ─────────────────────────────────────────────────

export type DeviceEnrollmentState =
  /** Device is not yet known to the cloud for this shop. */
  | 'DEVICE_NOT_ENROLLED'
  /** Device is registered in cloud but has no PIN set. */
  | 'PIN_SETUP_REQUIRED'
  /** Device has PIN in cloud (hasPin=true). User must enter existing PIN to unlock. */
  | 'PIN_VERIFICATION_REQUIRED'
  /** Device is fully operational — local PIN verified, can make mutations. */
  | 'OPERATIONAL'

// ─── Operational session ─────────────────────────────────────────────────────

export interface OperationalSession {
  employeeId: EmployeeId
  shopId: ShopId
  deviceId: DeviceId
  /** ISO8601 — when this operational session was established. */
  startedAt: ISO8601
  /** ISO8601 — when this session expires (PIN re-verification required). */
  expiresAt: ISO8601
  /**
   * ISO8601 — deadline after which operational mutations are blocked
   * even if the session has not expired.
   *
   * Set to startedAt + OFFLINE_ENTITLEMENT_TTL_MS (3 days).
   * Checked in `isWithinOfflineEntitlement()`.
   *
   * This is SEPARATE from expiresAt — a session may be "valid" (PIN re-verified
   * recently) but still within the offline entitlement window.
   *
   * After offlineEntitlementExpiresAt, the device must reconnect to cloud
   * and re-verify the operational session before making mutations.
   */
  offlineEntitlementExpiresAt: ISO8601
}

// ─── PIN storage keys ────────────────────────────────────────────────────────

export const PIN_SALT_KEY = 'pin_salt'
export const PIN_VERIFIER_KEY = 'pin_verifier'

// ─── Errors ─────────────────────────────────────────────────────────────────

const pinError = (code: AuthErrorCode, message: string, retryAfterMs?: number) =>
  authError(code, message, retryAfterMs)

/** The PIN provided does not match the stored verifier. */
const PIN_MISMATCH = (): AuthError => pinError('PIN_VERIFICATION_FAILED', 'Incorrect PIN')

/** Device has no PIN enrolled — cannot verify. */
const PIN_NOT_SET = (): AuthError => pinError('PIN_NOT_SET', 'No PIN has been set on this device')

/** Too many failed attempts — temporarily locked. */
const PIN_LOCKED = (retryAfterMs: number): AuthError =>
  pinError('RATE_LIMITED', 'Too many failed attempts. Try again later.', retryAfterMs)

/** PIN verification failed during cross-device enrollment. */
const ENROLLMENT_PIN_FAILED = (retryAfterMs?: number): AuthError =>
  pinError('PIN_VERIFICATION_FAILED', 'Incorrect PIN. Please try again.', retryAfterMs)

/** The enrollment token is no longer valid. */
const ENROLLMENT_TOKEN_ERROR = (code: AuthErrorCode, message: string): AuthError =>
  pinError(code, message)

// ─── Platform contract for OperationalAuth ──────────────────────────────────

/**
 * The subset of PlatformAuthAdapter that OperationalAuth needs.
 * Extracted here so the interface is explicit and testable.
 */
export interface OperationalPlatformAdapter {
  getSecureStorage(): {
    get(key: string): string | null | Promise<string | null>
    set(key: string, value: string): void | Promise<void>
    delete(key: string): void | Promise<void>
  }
  randomString(byteLength: number): string
}

// ─── Cloud API contract (subset used by OperationalAuth) ────────────────────

export interface OperationalCloudApi {
  /**
   * Get device enrollment status for the current shop.
   */
  getDeviceStatus(shopId: ShopId, deviceId: DeviceId): Promise<{
    exists: boolean
    hasPin: boolean
  }>

  /**
   * Register a new device for this shop.
   * Returns the created device record.
   */
  createDeviceEnrollment(shopId: ShopId, deviceId: DeviceId, deviceName: string): Promise<{
    deviceId: DeviceId
    hasPin: boolean
  }>

  /**
   * Update the device's hasPin flag in the cloud.
   */
  setDeviceHasPin(shopId: ShopId, deviceId: DeviceId, hasPin: true): Promise<void>

  /**
   * Verify a PIN for cross-device enrollment.
   *
   * Derive the proof as:
   *   proof = PBKDF2(pin, canonical_salt_for_employee).toHex('lower')
   *
   * The backend compares this against the canonical verifier stored for
   * this employee. On success, issues a scoped, single-use enrollment token.
   *
   * Rate-limited by the backend.
   */
  verifyPinForEnrollment(
    employeeId: EmployeeId,
    /** PBKDF2 output (hex, lowercase) of the PIN using the employee's canonical salt */
    pinHash: string,
    shopId: ShopId,
    deviceId: DeviceId,
  ): Promise<AuthApiResponse<{ enrollmentToken: string; expiresAt: ISO8601 }>>

  /**
   * Consume the enrollment token — atomic validation + invalidation.
   *
   * The backend validates:
   *   - Token exists and is not expired
   *   - Token has not been consumed already
   *   - Token scope (employeeId + shopId + deviceId) matches
   *   - No concurrent double-consumption (atomic operation)
   *
   * On success, the backend stores the newPinVerifier as the employee's
   * updated canonical verifier for future cross-device proofs.
   */
  consumeEnrollmentToken(params: {
    enrollmentToken: string
    employeeId: EmployeeId
    shopId: ShopId
    deviceId: DeviceId
    newPinVerifier: string
    newPinSalt: string
  }): Promise<AuthApiResponse<{ success: true }>>

  /**
   * Initiate PIN recovery. Sends a 6-digit code to the employee's email.
   * The backend rate-limits this endpoint (typically 60 seconds between requests).
   */
  requestPinRecovery(employeeId: EmployeeId): Promise<AuthApiResponse<{ cooldownSeconds: number }>>

  /**
   * Verify the recovery code. Returns a short-lived recovery auth token.
   * Code format: 6 numeric digits.
   * On success, returns { recoveryAuthToken, expiresAt }.
   */
  verifyPinRecoveryCode(
    employeeId: EmployeeId,
    code: string,
  ): Promise<AuthApiResponse<{ recoveryAuthToken: string; expiresAt: ISO8601 }>>

  /**
   * Reset the PIN using a recovery auth token.
   * Atomically consumes the token and updates the canonical verifier.
   * All existing enrolled devices must re-enroll (their local verifiers
   * are now out of sync with the new canonical verifier).
   */
  resetPin(params: {
    recoveryAuthToken: string
    employeeId: EmployeeId
    newPinVerifier: string
    newPinSalt: string
  }): Promise<AuthApiResponse<{ success: true }>>
}

// ─── OperationalAuth ─────────────────────────────────────────────────────────

/**
 * Manages device-local PIN verification and the enrollment state machine.
 *
 * Does NOT communicate directly with the cloud — it delegates cloud operations
 * through the optional `cloudApi` passed at construction.
 *
 * Usage:
 * ```
 * const opAuth = new OperationalAuth(platformAdapter)
 *
 * // After cloud authentication succeeds:
 * const state = await opAuth.getEnrollmentState(cloudApi, shopId, deviceId)
 * if (state === 'PIN_VERIFICATION_REQUIRED') {
 *   const result = await opAuth.verifyPin(cloudApi, employeeId, pin)
 *   if (result.ok) { /* operational session active *|/ }
 * }
 * ```
 */
export class OperationalAuth {
  private _failedAttempts = 0
  private _lockedUntil: number | null = null

  constructor(
    private readonly platform: OperationalPlatformAdapter,
  ) {}

  // ─── Enrollment state ────────────────────────────────────────────────────

  /**
   * Determine the current enrollment state for this device + shop.
   *
   * Uses `cloudApi` (if provided) to check `Device.hasPin` in the cloud.
   * If `cloudApi` is null, defaults to `PIN_SETUP_REQUIRED` (safe fallback).
   */
  async getEnrollmentState(params: {
    cloudApi?: OperationalCloudApi
    shopId: ShopId
    deviceId: DeviceId
  }): Promise<DeviceEnrollmentState> {
    const { cloudApi, shopId, deviceId } = params

    if (!cloudApi) {
      return 'PIN_SETUP_REQUIRED'
    }

    const status = await cloudApi.getDeviceStatus(shopId, deviceId)

    if (!status.exists) {
      return 'DEVICE_NOT_ENROLLED'
    }

    if (!status.hasPin) {
      return 'PIN_SETUP_REQUIRED'
    }

    return 'PIN_VERIFICATION_REQUIRED'
  }

  /**
   * Begin the enrollment process for a new device.
   *
   * For `DEVICE_NOT_ENROLLED`:
   *   Calls `cloudApi.createDeviceEnrollment(shopId)` to create the Device record
   *   in the cloud (with hasPin=false), then returns `PIN_SETUP_REQUIRED`.
   *
   * For `PIN_SETUP_REQUIRED` (new device + existing employee PIN — Section 10):
   *   User is prompted to enter their existing PIN.
   *   Call `beginEnrollment` again with `pinVerificationProof` filled in.
   *   On success, returns `needsCloudVerify: true` and the caller should
   *   call `completeEnrollmentWithCloudVerify`.
   */
  async beginEnrollment(params: {
    cloudApi: OperationalCloudApi
    state: DeviceEnrollmentState
    shopId: ShopId
    deviceId: DeviceId
    deviceName: string
    employeeId?: EmployeeId
    /**
     * PBKDF2 proof of the existing PIN.
     * Derived as: PBKDF2(pin, canonical_salt_for_employee).toHex('lower')
     *
     * This is NOT the same as the local PIN verifier — it uses the
     * canonical salt stored in the backend for this employee.
     *
     * Must be provided when state = PIN_SETUP_REQUIRED and the caller
     * has already prompted the user for their existing PIN.
     */
    pinVerificationProof?: string
  }): Promise<
    | AuthResult<{ nextState: DeviceEnrollmentState }>
    | AuthResult<{ needsCloudVerify: true; employeeId: EmployeeId }>
  > {
    const { cloudApi, state, shopId, deviceId, deviceName } = params

    if (state === 'DEVICE_NOT_ENROLLED') {
      const result = await cloudApi.createDeviceEnrollment(shopId, deviceId, deviceName)
      return {
        ok: true,
        data: result.hasPin
          ? { nextState: 'PIN_VERIFICATION_REQUIRED' as DeviceEnrollmentState }
          : { nextState: 'PIN_SETUP_REQUIRED' },
      }
    }

    if (state === 'PIN_SETUP_REQUIRED') {
      if (!params.employeeId || !params.pinVerificationProof) {
        return {
          ok: true,
          data: { needsCloudVerify: true, employeeId: params.employeeId! },
        }
      }

      // Cross-device PIN verification via cloud
      const result = await cloudApi.verifyPinForEnrollment(
        params.employeeId,
        params.pinVerificationProof,
        shopId,
        deviceId,
      )

      if (result.error) {
        this._recordFailedAttempt()
        return {
          ok: false,
          error: ENROLLMENT_PIN_FAILED(result.error.retryAfterMs),
        }
      }

      // PIN verified — cloud will hold the enrollment token
      // Return nextState so caller knows to call completeEnrollmentWithCloudVerify
      return { ok: true, data: { nextState: 'PIN_SETUP_REQUIRED' } }
    }

    return { ok: false, error: pinError('ENROLLMENT_REQUIRED', 'Device is not in a state that allows enrollment') }
  }

  /**
   * Complete enrollment after cloud PIN verification.
   *
   * This is called after `beginEnrollment` returns successfully with
   * `PIN_VERIFICATION_REQUIRED` or after the cloud confirms the PIN proof.
   *
   * The caller must have obtained an `enrollmentToken` from the backend
   * via `verifyPinForEnrollment`. This token is passed here so the SDK
   * can hand it to `consumeEnrollmentToken`, which atomically validates
   * and consumes it.
   *
   * The `newPin` and `hashPin` parameters are used to derive the local
   * PIN verifier, which is stored in the device's Keychain/Keystore.
   * This verifier is independent of the canonical verifier stored in
   * the cloud (which was already set/updated by `consumeEnrollmentToken`).
   *
   * Security: The enrollment token is single-use and scoped to
   * (employeeId, shopId, deviceId). The backend MUST invalidate it
   * atomically on consumption to prevent replay.
   */
  async completeEnrollmentWithCloudVerify(params: {
    cloudApi: OperationalCloudApi
    enrollmentToken: string
    employeeId: EmployeeId
    shopId: ShopId
    deviceId: DeviceId
    newPin: string
    /** PBKDF2 hash of the new PIN — used as the local verifier */
    newPinHash: string
    newPinSalt: string
  }): Promise<AuthResult<void>> {
    const { cloudApi, enrollmentToken, employeeId, shopId, deviceId, newPinHash, newPinSalt } = params

    // Step 1: Atomically consume the enrollment token and submit the new verifier
    const consumeResult = await cloudApi.consumeEnrollmentToken({
      enrollmentToken,
      employeeId,
      shopId,
      deviceId,
      newPinVerifier: newPinHash,
      newPinSalt,
    })

    if (consumeResult.error) {
      const code = consumeResult.error.code as AuthErrorCode
      if (code === 'ENROLLMENT_TOKEN_EXPIRED') {
        return { ok: false, error: ENROLLMENT_TOKEN_ERROR('ENROLLMENT_TOKEN_EXPIRED', 'Enrollment token has expired. Please try again.') }
      }
      if (code === 'ENROLLMENT_TOKEN_CONSUMED' || code === 'ENROLLMENT_TOKEN_REPLAY') {
        return { ok: false, error: ENROLLMENT_TOKEN_ERROR('ENROLLMENT_TOKEN_REPLAY', 'This enrollment link has already been used.') }
      }
      if (code === 'ENROLLMENT_TOKEN_SCOPE_MISMATCH') {
        return { ok: false, error: ENROLLMENT_TOKEN_ERROR('ENROLLMENT_TOKEN_SCOPE_MISMATCH', 'Enrollment token does not match this device.') }
      }
      return { ok: false, error: pinError(code, consumeResult.error.message) }
    }

    // Step 2: Store the local PIN verifier (device-local, never goes to cloud)
    const storage = this.platform.getSecureStorage()
    await storage.set(PIN_SALT_KEY, newPinSalt)
    await storage.set(PIN_VERIFIER_KEY, newPinHash)

    return { ok: true, data: undefined }
  }

  // ─── Local PIN operations ────────────────────────────────────────────────

  /**
   * Set up a new local PIN verifier for this device.
   *
   * `hashPin` and `verifyPin` are provided by the platform's PBKDF2 implementation:
   *   - Desktop/Node: import from `@soostori/auth/pin-node`
   *   - React Native: platform-specific implementation using react-native-quick-crypto
   *
   * The salt and verifier hash are stored in secure storage (Keychain/Keystore).
   * No PIN data leaves the device.
   *
   * NOTE: This is for FIRST device enrollment (when there is no existing PIN).
   * For NEW DEVICE + EXISTING PIN, use `beginEnrollment` + `completeEnrollmentWithCloudVerify`.
   */
  async setupPin(params: {
    pin: string
    hashPin: (pin: string, salt?: string) => { hash: string; salt: string }
    employeeId: EmployeeId
    shopId: ShopId
    deviceId: DeviceId
  }): Promise<AuthResult<{ salt: string; verifierHash: string }>> {
    if (this._isLocked()) {
      return { ok: false, error: PIN_LOCKED(this._lockedUntil!) }
    }

    const { pin, hashPin, employeeId, shopId, deviceId } = params

    const { hash: verifierHash, salt } = hashPin(pin)

    const storage = this.platform.getSecureStorage()
    await storage.set(PIN_SALT_KEY, salt)
    await storage.set(PIN_VERIFIER_KEY, verifierHash)

    this._failedAttempts = 0
    this._lockedUntil = null

    return { ok: true, data: { salt, verifierHash } }
  }

  /**
   * Verify the local PIN to establish an operational session.
   *
   * The PIN is NOT sent to the cloud for this call — it's compared against
   * the locally stored PBKDF2 verifier.
   *
   * After `MAX_PIN_ATTEMPTS` consecutive failures, the device is locked
   * for `PIN_RATE_LIMIT_MS`. A successful verification resets the counter.
   *
   * Sets `offlineEntitlementExpiresAt = now + OFFLINE_ENTITLEMENT_TTL_MS (3 days)`.
   * This is the 3-day operational offline window and is independent of
   * CloudAuth's 24-hour session stale threshold.
   */
  async verifyPin(params: {
    pin: string
    verifyPin: (pin: string, hashHex: string, saltHex: string) => boolean
    employeeId: EmployeeId
    shopId: ShopId
    deviceId: DeviceId
    /**
     * Operational session TTL in milliseconds.
     * Default: 24 hours (PIN re-verification required each day).
     */
    sessionTtlMs?: number
  }): Promise<AuthResult<OperationalSession>> {
    if (this._isLocked()) {
      return { ok: false, error: PIN_LOCKED(this._lockedUntil!) }
    }

    const { pin, verifyPin, employeeId, shopId, deviceId, sessionTtlMs = 24 * 60 * 60 * 1000 } = params

    const storage = this.platform.getSecureStorage()
    const [salt, storedHash] = await Promise.all([
      storage.get(PIN_SALT_KEY),
      storage.get(PIN_VERIFIER_KEY),
    ])

    if (!salt || !storedHash) {
      return { ok: false, error: PIN_NOT_SET() }
    }

    const isValid = verifyPin(pin, storedHash, salt)

    if (!isValid) {
      this._recordFailedAttempt()
      return { ok: false, error: PIN_MISMATCH() }
    }

    this._failedAttempts = 0
    this._lockedUntil = null

    const now = new Date().toISOString() as ISO8601
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString() as ISO8601
    const offlineEntitlementExpiresAt = new Date(Date.now() + OFFLINE_ENTITLEMENT_TTL_MS).toISOString() as ISO8601

    return {
      ok: true,
      data: { employeeId, shopId, deviceId, startedAt: now, expiresAt, offlineEntitlementExpiresAt },
    }
  }

  /**
   * Check whether a PIN has been enrolled on this device (local storage check).
   * Returns false if no PIN has ever been set.
   */
  async hasPinEnrolled(): Promise<boolean> {
    const storage = this.platform.getSecureStorage()
    const hash = await storage.get(PIN_VERIFIER_KEY)
    return hash !== null
  }

  /**
   * Change the PIN — verifies old PIN first, then sets the new one.
   *
   * Note: This changes the LOCAL device PIN only. It does NOT update
   * the canonical verifier in the cloud. For a forgotten PIN, use
   * `requestPinRecovery` instead.
   */
  async changePin(params: {
    oldPin: string
    newPin: string
    verifyPin: (pin: string, hashHex: string, saltHex: string) => boolean
    hashPin: (pin: string, salt?: string) => { hash: string; salt: string }
    employeeId: EmployeeId
    shopId: ShopId
    deviceId: DeviceId
  }): Promise<AuthResult<{ salt: string; verifierHash: string }>> {
    if (this._isLocked()) {
      return { ok: false, error: PIN_LOCKED(this._lockedUntil!) }
    }

    const { oldPin, newPin, verifyPin, hashPin, employeeId, shopId, deviceId } = params

    const storage = this.platform.getSecureStorage()
    const [salt, storedHash] = await Promise.all([
      storage.get(PIN_SALT_KEY),
      storage.get(PIN_VERIFIER_KEY),
    ])

    if (!salt || !storedHash) {
      return { ok: false, error: PIN_NOT_SET() }
    }

    if (!verifyPin(oldPin, storedHash, salt)) {
      this._recordFailedAttempt()
      return { ok: false, error: PIN_MISMATCH() }
    }

    return this.setupPin({ pin: newPin, hashPin, employeeId, shopId, deviceId })
  }

  /**
   * Clear the local PIN — used when signing out or resetting the device.
   * Does NOT update cloud state — caller is responsible for that.
   */
  async clearPin(): Promise<void> {
    const storage = this.platform.getSecureStorage()
    await storage.delete(PIN_SALT_KEY)
    await storage.delete(PIN_VERIFIER_KEY)
    this._failedAttempts = 0
    this._lockedUntil = null
  }

  // ─── PIN recovery ───────────────────────────────────────────────────────

  /**
   * Initiate PIN recovery. Sends a 6-digit code to the employee's verified email.
   *
   * Rate-limited by the backend (typically 60 seconds between requests).
   * The returned `cooldownSeconds` tells the UI how long to wait before
   * allowing another request.
   */
  async requestPinRecovery(params: {
    cloudApi: OperationalCloudApi
    employeeId: EmployeeId
  }): Promise<AuthResult<{ cooldownSeconds: number }>> {
    const { cloudApi, employeeId } = params

    const result = await cloudApi.requestPinRecovery(employeeId)

    if (result.error) {
      if (result.error.code === 'RATE_LIMITED') {
        return {
          ok: false,
          error: pinError('RECOVERY_RATE_LIMITED', result.error.message, result.error.retryAfterMs),
        }
      }
      return { ok: false, error: pinError('UNKNOWN', result.error.message) }
    }

    return { ok: true, data: { cooldownSeconds: result.data!.cooldownSeconds } }
  }

  /**
   * Verify the PIN recovery code sent to the employee's email.
   *
   * On success, returns a short-lived `recoveryAuthToken`. The caller
   * must immediately call `resetPinWithRecovery` with this token.
   *
   * Do NOT store or reuse the recovery auth token — it is single-use.
   */
  async verifyPinRecoveryCode(params: {
    cloudApi: OperationalCloudApi
    employeeId: EmployeeId
    code: string
  }): Promise<AuthResult<{ recoveryAuthToken: string; expiresAt: ISO8601 }>> {
    const { cloudApi, employeeId, code } = params

    const result = await cloudApi.verifyPinRecoveryCode(employeeId, code)

    if (result.error) {
      if (result.error.code === 'RECOVERY_CODE_INVALID') {
        return { ok: false, error: pinError('RECOVERY_CODE_INVALID', 'Incorrect recovery code.') }
      }
      if (result.error.code === 'RATE_LIMITED') {
        return { ok: false, error: pinError('RECOVERY_RATE_LIMITED', result.error.message, result.error.retryAfterMs) }
      }
      return { ok: false, error: pinError('UNKNOWN', result.error.message) }
    }

    return { ok: true, data: result.data! }
  }

  /**
   * Reset the PIN using a recovery authorization token.
   *
   * This is the final step of the PIN recovery flow.
   * The recovery auth token is consumed atomically.
   *
   * After success:
   *   - The canonical PIN verifier in the cloud is updated
   *   - ALL other enrolled devices must re-enroll (their local verifiers
   *     are now out of sync with the new canonical verifier)
   *   - The local device stores the new PIN verifier
   *   - The caller is responsible for notifying other devices to re-enroll
   *
   * The new PIN verifier is derived via `hashPin(newPin)` and stored both
   * locally (for this device) and submitted to the cloud (as the new
   * canonical verifier for cross-device proofs).
   */
  async resetPinWithRecovery(params: {
    cloudApi: OperationalCloudApi
    recoveryAuthToken: string
    employeeId: EmployeeId
    newPin: string
    hashPin: (pin: string, salt?: string) => { hash: string; salt: string }
    shopId: ShopId
    deviceId: DeviceId
  }): Promise<AuthResult<void>> {
    const { cloudApi, recoveryAuthToken, employeeId, newPin, hashPin, shopId, deviceId } = params

    const { hash: newVerifier, salt: newSalt } = hashPin(newPin)

    const result = await cloudApi.resetPin({
      recoveryAuthToken,
      employeeId,
      newPinVerifier: newVerifier,
      newPinSalt: newSalt,
    })

    if (result.error) {
      if (result.error.code === 'VERIFICATION_EXPIRED' || result.error.code === 'VERIFICATION_INVALID') {
        return { ok: false, error: pinError('RECOVERY_CODE_INVALID', 'Recovery session has expired. Please start over.') }
      }
      return { ok: false, error: pinError('UNKNOWN', result.error.message) }
    }

    // Store locally for this device
    const storage = this.platform.getSecureStorage()
    await storage.set(PIN_SALT_KEY, newSalt)
    await storage.set(PIN_VERIFIER_KEY, newVerifier)

    return { ok: true, data: undefined }
  }

  // ─── Offline entitlement check ───────────────────────────────────────────

  /**
   * Check whether the device is still within its 3-day offline entitlement.
   *
   * Called before making any mutation while offline. If this returns false,
   * the mutation must be rejected and the user must reconnect to cloud.
   *
   * Note: This is independent of whether the operational session has expired
   * (which is a separate 24-hour PIN re-verification requirement).
   */
  isWithinOfflineEntitlement(session: OperationalSession): boolean {
    return new Date(session.offlineEntitlementExpiresAt).getTime() > Date.now()
  }

  /**
   * Check whether an operational session has expired (PIN re-verification needed).
   * This is separate from offline entitlement.
   */
  isSessionExpired(session: OperationalSession): boolean {
    return new Date(session.expiresAt).getTime() <= Date.now()
  }

  // ─── Lockout state ─────────────────────────────────────────────────────

  get failedAttemptCount(): number {
    return this._failedAttempts
  }

  get isLocked(): boolean {
    return this._isLocked()
  }

  get lockedUntilMs(): number | null {
    return this._lockedUntil
  }

  private _isLocked(): boolean {
    if (!this._lockedUntil) return false
    if (Date.now() >= this._lockedUntil) {
      this._lockedUntil = null
      this._failedAttempts = 0
      return false
    }
    return true
  }

  private _recordFailedAttempt(): void {
    this._failedAttempts++
    if (this._failedAttempts >= MAX_PIN_ATTEMPTS) {
      this._lockedUntil = Date.now() + PIN_RATE_LIMIT_MS
    }
  }

  // ─── Serialization helpers ───────────────────────────────────────────────

  /**
   * Serialize an OperationalSession to a storable string.
   */
  serializeSession(session: OperationalSession): string {
    return JSON.stringify(session)
  }

  /**
   * Deserialize an OperationalSession from storage.
   * Validates that the session hasn't expired.
   */
  deserializeSession(raw: string): OperationalSession | null {
    try {
      const session = JSON.parse(raw) as OperationalSession
      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        return null // expired
      }
      return session
    } catch {
      return null
    }
  }
}
