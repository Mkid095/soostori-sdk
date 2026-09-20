/**
 * @soostori/auth — Cloud Authentication Module
 *
 * Platform-neutral auth using Google OAuth and email/password via InstantDB-backed
 * identity. Provides a unified API for:
 *   - Google Sign-In (OAuth 2.0 + PKCE)
 *   - Google ID Token (Mobile native flow)
 *   - Email/password registration + email verification
 *   - Password reset (tokenized link)
 *   - Session refresh (token rotation)
 *   - Device enrollment (new device + existing PIN)
 *
 * All auth state is stored in InstantDB's local SQLite store, making sessions
 * available offline once established. Server validation happens on every
 * network-available request.
 *
 * ## Platform integration contract
 *
 * Platform adapters MUST provide:
 *   - `openOAuthBrowser(url: string): Promise<void>` — opens system browser for OAuth
 *   - `getSecureStorage(): SecureStorage` — platform keychain/keystore wrapper
 *   - `getNetworkStatus(): NetworkStatus` — online/offline detection
 *   - `randomString(byteLength: number): string` — cryptographic RNG
 *
 * ## Security decisions
 *
 * - OAuth uses PKCE (S256 challenge) — no client secret needed in the app
 * - ID tokens are verified server-side; the SDK never parses JWTs directly
 * - Refresh tokens are stored in platform secure storage (Keychain/Keystore)
 * - Session tokens in InstantDB are encrypted at rest
 * - All tokens are revocable server-side
 * - Rate limiting is enforced server-side on email/password endpoints
 * - PIN is a LOCAL credential only — cloud stores only `hasPin: boolean` flag
 */

import { newId, asUserId, asEmployeeId, asDeviceId, asShopId } from '@soostori/core'
import type {
  UserId,
  EmployeeId,
  DeviceId,
  ShopId,
  ISO8601,
} from '@soostori/core'
import { authError, type AuthError, type AuthErrorCode } from './errors.js'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default session lifetime before forced refresh (7 days). */
export const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** How long a session can be stale (offline) before we require re-auth (24 hours). */
export const SESSION_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

// ─── Re-export shared error types ─────────────────────────────────────────────

export { authError, type AuthError, type AuthErrorCode }

// ─── Platform contract interfaces ─────────────────────────────────────────────

/** Platform-provided secure storage (Keychain / Android Keystore / Web crypto). */
export interface SecureStorage {
  get(key: string): string | null | Promise<string | null>
  set(key: string, value: string): void | Promise<void>
  delete(key: string): void | Promise<void>
}

/** Network status from the platform. */
export interface NetworkStatus {
  isOnline: boolean
  effectiveType?: string
}

/** The platform integration contract. */
export interface PlatformAuthAdapter {
  openOAuthBrowser(url: string): Promise<void>
  getSecureStorage(): SecureStorage
  getNetworkStatus(): NetworkStatus
  randomString(byteLength: number): string
  /** Set a cookie on the platform (used by PKCE to store code_verifier before browser opens). */
  setCookie(name: string, value: string, options?: { httpOnly?: boolean; secure?: boolean; sameSite?: 'Lax' | 'Strict' | 'None'; maxAge?: number; path?: string }): void | Promise<void>
}

// ─── Google OAuth types ─────────────────────────────────────────────────────────

export interface GoogleOAuthConfig {
  clientId: string
  redirectUri: string
  scopes?: string[]
  codeChallengeMethod?: 'S256'
}

export interface GoogleSignInResult {
  userId: UserId
  employeeId: EmployeeId
  shopId: ShopId
  deviceId: DeviceId
  email: string
  displayName?: string
  idToken: string
  accessToken: string
  refreshToken?: string
  isNewUser: boolean
  accountStatus?: 'provisioned' | 'active'
}

export interface GoogleSignInPartial {
  state: string
  code?: string
}

// ─── Email/password types ──────────────────────────────────────────────────────

export interface EmailRegistrationResult {
  userId: UserId
  email: string
  requiresEmailVerification: boolean
  verificationToken?: string
}

export interface EmailVerificationResult {
  userId: UserId
  email: string
  isEmailVerified: true
  session?: AuthSession
}

export interface PasswordResetRequestResult {
  email: string
  resetLinkSent: true
}

export interface PasswordResetCompleteResult {
  userId: UserId
  employeeId: EmployeeId
  shopId: ShopId
  deviceId: DeviceId
  email: string
  accessToken: string
  refreshToken: string
}

// ─── Session types ─────────────────────────────────────────────────────────────

/** A session token stored locally in InstantDB. */
export interface StoredSession {
  userId: string
  employeeId: string
  shopId: string
  deviceId: string
  email: string
  accessToken: string
  refreshToken: string
  createdAt: ISO8601
  expiresAt: ISO8601
  lastValidatedAt: ISO8601
}

export interface SessionRefreshResult {
  session: AuthSession
  accessToken: string
  expiresAt: ISO8601
}

// ─── Auth backend API contract ────────────────────────────────────────────────

export interface AuthApiClient {
  // ── Cloud identity ──────────────────────────────────────────────────
  exchangeGoogleCode(code: string, codeVerifier: string, redirectUri: string): Promise<AuthApiResponse<GoogleSignInResult>>
  linkGoogleAccount(idToken: string, sessionAccessToken: string): Promise<AuthApiResponse<GoogleSignInResult>>
  signInWithIdToken(clientName: string, idToken: string): Promise<AuthApiResponse<GoogleSignInResult>>
  registerEmail(email: string, password: string, employeeName: string): Promise<AuthApiResponse<EmailRegistrationResult>>
  verifyEmail(token: string): Promise<AuthApiResponse<EmailVerificationResult>>
  requestPasswordReset(email: string): Promise<AuthApiResponse<PasswordResetRequestResult>>
  completePasswordReset(token: string, newPassword: string): Promise<AuthApiResponse<PasswordResetCompleteResult>>
  signInEmail(email: string, password: string): Promise<AuthApiResponse<SignInResult>>
  refreshSession(refreshToken: string): Promise<AuthApiResponse<SessionRefreshResult>>
  revokeSession(accessToken: string): Promise<AuthApiResponse<void>>
  registerTrustedDevice(deviceToken: string, deviceName: string, accessToken: string): Promise<AuthApiResponse<TrustedDeviceResult>>
  listTrustedDevices(accessToken: string): Promise<AuthApiResponse<TrustedDevice[]>>
  removeTrustedDevice(deviceId: string, accessToken: string): Promise<AuthApiResponse<void>>

  // ── Device enrollment (PIN) ──────────────────────────────────────────
  /**
   * Get current device enrollment status for a shop.
   * Used by OperationalAuth.getEnrollmentState() to determine enrollment state.
   */
  getDeviceStatus(shopId: string, deviceId: string): Promise<AuthApiResponse<{
    exists: boolean
    hasPin: boolean
  }>>

  /**
   * Register a new device for this shop (creates device record in FIDScript).
   * Returns created device with initial hasPin=false.
   */
  createDeviceEnrollment(shopId: string, deviceId: string, deviceName: string): Promise<AuthApiResponse<{
    deviceId: string
    hasPin: boolean
  }>>

  /**
   * Verify a PIN for cross-device enrollment.
   *
   * Device B (new device) derives proof = PBKDF2(pin, canonical_salt_from_backend).
   * Backend compares proof against canonical verifier for this employee.
   * On match: issues short-lived, single-use enrollment token (5 min TTL).
   *
   * Rate-limited by backend.
   */
  verifyPinForEnrollment(
    employeeId: string,
    /** PBKDF2 output (hex, lowercase) of the PIN using the employee's canonical salt */
    pinProof: string,
    shopId: string,
    deviceId: string,
  ): Promise<AuthApiResponse<{ enrollmentToken: string; expiresAt: ISO8601 }>>

  /**
   * Consume enrollment token — atomic validation + invalidation.
   *
   * Backend validates: exists + not expired + not consumed + correct scope.
   * On success: stores newPinVerifier as canonical verifier for employee,
   * sets Device.hasPin=true in FIDScript, marks token consumed.
   */
  consumeEnrollmentToken(params: {
    enrollmentToken: string
    employeeId: string
    shopId: string
    deviceId: string
    newPinVerifier: string
    newPinSalt: string
  }): Promise<AuthApiResponse<{ success: true }>>

  /**
   * Change PIN when already authenticated with existing PIN (local verify first).
   * Backend verifies oldPinProof against canonical verifier, then updates to new.
   * Issues re-enrollment requirement for all other enrolled devices.
   */
  changePin(params: {
    employeeId: string
    shopId: string
    deviceId: string
    oldPinProof: string
    newPinVerifier: string
    newPinSalt: string
  }): Promise<AuthApiResponse<{ success: true }>>

  // ── PIN recovery ──────────────────────────────────────────────────────
  /**
   * Initiate PIN recovery. Sends 6-digit code to employee's email.
   * Rate-limited by backend (cooldownSeconds returned).
   */
  requestPinRecovery(employeeId: string): Promise<AuthApiResponse<{ cooldownSeconds: number }>>

  /**
   * Verify the recovery code. Returns short-lived recovery auth token (JWT).
   */
  verifyPinRecoveryCode(
    employeeId: string,
    code: string,
  ): Promise<AuthApiResponse<{ recoveryAuthToken: string; expiresAt: ISO8601 }>>

  /**
   * Reset PIN using recovery auth token.
   * Backend atomically: validates token + updates canonical verifier + invalidates token.
   */
  resetPin(params: {
    recoveryAuthToken: string
    employeeId: string
    newPinVerifier: string
    newPinSalt: string
  }): Promise<AuthApiResponse<{ success: true }>>

  // ── Device management ────────────────────────────────────────────────
  /**
   * List all devices enrolled for an employee in a shop.
   * Used for showing "your devices" and for revocation UI.
   */
  listEnrolledDevices(employeeId: string, shopId: string): Promise<AuthApiResponse<Array<{
    deviceId: string
    deviceName: string
    deviceType: string
    hasPin: boolean
    lastSeenAt: string | null
    authorizedAt: string | null
  }>>>

  /**
   * Revoke a device's PIN session — forces re-enrollment.
   * Backend: marks device.hasPin=false in FIDScript.
   */
  revokeDevice(employeeId: string, deviceId: string): Promise<AuthApiResponse<{ success: true }>>

  // ── Subscriptions ────────────────────────────────────────────────────
  /**
   * Get subscription status for a shop — used to gate device enrollment.
   * Returns current subscription + plan info including deviceLimit.
   */
  getSubscriptionStatus(shopId: string): Promise<AuthApiResponse<{
    status: 'active' | 'past_due' | 'expired' | 'cancelled' | 'trialing'
    planKey: string
    deviceLimit: number
    currentPeriodEnd: string
    currentDeviceCount: number
  }>>

  // ── Passwordless challenge ───────────────────────────────────────────────
  /**
   * Request a passwordless authentication challenge.
   * The application layer sends the code via its own communication channel
   * (Email, WhatsApp, SMS, etc.) — the SDK has no communication dependencies.
   */
  requestPasswordlessChallenge(params: {
    email: string
    purpose: PasswordlessPurpose
    /** Code length in digits. Default: 6 */
    codeLength?: number
    /** Challenge TTL in minutes. Default: 10 */
    expiresInMinutes?: number
  }): Promise<AuthApiResponse<PasswordlessChallengeResult>>

  /**
   * Verify a passwordless challenge code.
   * On success: consumes the code and returns an authenticated session.
   * On failure: increments attempt counter; after MAX attempts the challenge is invalidated.
   */
  verifyPasswordlessChallenge(params: {
    email: string
    purpose: PasswordlessPurpose
    code: string
  }): Promise<AuthApiResponse<SignInResult>>

  /**
   * Complete the account setup flow — exchange a setup token (from `verifyPasswordlessChallenge`
   * with `needsSetup: true`) for a permanent password and an authenticated session.
   *
   * The backend validates the setup token, stores the password hash, and returns a session.
   * The token is consumed atomically — reuse is impossible.
   */
  completePasswordSetup(params: {
    setupToken: string
    password: string
  }): Promise<AuthApiResponse<SignInResult>>
}

export interface AuthApiResponse<T> {
  data?: T
  error?: {
    code: string
    message: string
    retryAfterMs?: number
  }
}

export interface SignInResult {
  userId: UserId
  employeeId: EmployeeId
  shopId: ShopId
  deviceId: DeviceId
  email: string
  accessToken: string
  refreshToken: string
  expiresAt: ISO8601
  isEmailVerified: boolean
  session: AuthSession
  /**
   * True when a passwordless challenge was verified for an account-setup purpose
   * (`influencer_account_setup` or `salesperson_onboarding`) but the permanent
   * password has not yet been created. In this case `session` is absent and
   * `setupToken` is returned instead. The caller should collect the permanent
   * password and call `completePasswordSetup`.
   */
  needsSetup?: true
  /**
   * Present when `needsSetup` is true. A short-lived token bound to the verified
   * identity. Pass to `completePasswordSetup` to exchange it for a real session.
   */
  setupToken?: string
}

// ─── Auth result type ──────────────────────────────────────────────────────────

/** Unified auth operation result. */
export type AuthResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: AuthError }

// ─── Trusted device types ──────────────────────────────────────────────────────

export interface TrustedDevice {
  deviceId: DeviceId
  deviceName: string
  registeredAt: ISO8601
  lastUsedAt: ISO8601
  isAutoApproved: boolean
}

export interface TrustedDeviceResult {
  device: TrustedDevice
  deviceToken: string
}

// ─── Passwordless challenge types ─────────────────────────────────────────────

/**
 * Purpose binding for passwordless challenges.
 * A credential issued for one purpose cannot be used for another.
 */
export type PasswordlessPurpose =
  | 'salesperson_activation'
  | 'normal_passwordless_login'
  | 'influencer_account_setup'
  | 'salesperson_onboarding'

/**
 * Result returned after a passwordless challenge is successfully created.
 * The application layer sends the code via its own communication channel.
 */
export interface PasswordlessChallengeResult {
  /** When the challenge expires (ISO8601). */
  expiresAt: ISO8601
  /** Minimum seconds before another challenge can be requested for the same email+purpose. */
  cooldownSeconds: number
}

// ─── AuthSession (re-exported) ────────────────────────────────────────────────

export interface AuthSession {
  userId: UserId
  shopId?: ShopId
  employeeId?: EmployeeId
  deviceId?: DeviceId
  email: string
  createdAt: ISO8601
  expiresAt: ISO8601
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type AuthEvent =
  | { type: 'SIGNED_IN'; session: StoredSession }
  | { type: 'SIGNED_OUT' }
  | { type: 'SESSION_REFRESHED'; session: StoredSession }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'EMAIL_VERIFIED'; userId: UserId; email: string }
  | { type: 'DEVICE_REGISTERED'; device: TrustedDevice }
  | { type: 'DEVICE_REVOKED'; deviceId: DeviceId }
  | { type: 'PASSWORDLESS_CHALLENGE_ISSUED'; email: string; purpose: PasswordlessPurpose }
  | { type: 'PASSWORDLESS_CHALLENGE_VERIFIED'; email: string; purpose: PasswordlessPurpose }
  | { type: 'PASSWORDLESS_CHALLENGE_FAILED'; email: string; purpose: PasswordlessPurpose; attemptsRemaining: number }
  | { type: 'ERROR'; error: AuthError }

export type AuthEventListener = (event: AuthEvent) => void

// ─── CloudAuth ────────────────────────────────────────────────────────────────

/**
 * CloudAuth — the central SDK auth controller.
 *
 * Handles the "who are you?" layer (cloud identity) via Google OAuth,
 * email/password, and session management.
 *
 * Device enrollment and local PIN ("can this device operate?") is handled
 * by `OperationalAuth` — see operational-auth.ts.
 */
export class CloudAuth {
  private listeners = new Set<AuthEventListener>()
  private _session: StoredSession | null = null
  private _networkStatus: NetworkStatus = { isOnline: true }

  constructor(
    private readonly platform: PlatformAuthAdapter,
    private readonly api: AuthApiClient,
  ) {}

  // ─── Event handling ────────────────────────────────────────────────────────

  on(listener: AuthEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: AuthEvent): void {
    this.listeners.forEach(l => {
      try { l(event) } catch { /* swallow listener errors */ }
    })
  }

  // ─── Session accessors ────────────────────────────────────────────────────

  get session(): StoredSession | null { return this._session }

  get isSessionStale(): boolean {
    if (!this._session) return true
    const staleCutoff = Date.now() - SESSION_STALE_THRESHOLD_MS
    return new Date(this._session.lastValidatedAt).getTime() < staleCutoff
  }

  get hasValidSession(): boolean {
    if (!this._session) return false
    if (new Date(this._session.expiresAt).getTime() <= Date.now()) return false
    if (this.isSessionStale) return false
    return true
  }

  // ─── Google OAuth ─────────────────────────────────────────────────────────

  /**
   * Begin Google Sign-In using PKCE + system browser.
   *
   * Opens the browser (or in-app webview) to Google's OAuth consent screen.
   * After the user approves, the redirect is handled by the platform's
   * OAuth callback URL handler, which calls `handleOAuthCallback()`.
   *
   * Returns a partial result — call `handleOAuthCallback` after the redirect.
   */
  async signInWithGoogle(config: GoogleOAuthConfig): Promise<AuthResult<GoogleSignInPartial>> {
    try {
      const state = this.platform.randomString(16)
      const codeVerifier = this.platform.randomString(64)
      const codeChallenge = await this._pkceChallenge(codeVerifier)
      const scopes = ['openid', 'email', 'profile', ...(config.scopes ?? [])].join(' ')

      // Store PKCE code_verifier in an HttpOnly cookie so the callback route can
      // read it after Google redirects back. Cookie is short-lived (10 min) and
      // cleared by the callback handler after exchange.
      await this.platform.setCookie('oauth_code_verifier', codeVerifier, {
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: 600,
        path: '/',
      })

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.searchParams.set('client_id', config.clientId)
      authUrl.searchParams.set('redirect_uri', config.redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', scopes)
      authUrl.searchParams.set('state', state)
      authUrl.searchParams.set('code_challenge', codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')

      await this.platform.openOAuthBrowser(authUrl.toString())

      return { ok: true, data: { state } }
    } catch (e) {
      return { ok: false, error: authError('OAUTH_ERROR', String(e)) }
    }
  }

  /**
   * Complete the OAuth callback — exchange authorization code for tokens.
   * Call this after the OAuth redirect is received by the platform.
   *
   * `codeVerifier` — the random string generated at sign-in start.
   * `redirectUri` — must match the value used in `signInWithGoogle`.
   */
  async handleOAuthCallback(
    partial: GoogleSignInPartial,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<AuthResult<GoogleSignInResult>> {
    if (!partial.code) {
      return { ok: false, error: authError('OAUTH_ERROR', 'Missing authorization code in OAuth callback') }
    }

    const apiResult = await this.api.exchangeGoogleCode(partial.code, codeVerifier, redirectUri)
    if (apiResult.error) return { ok: false, error: this._mapApiError(apiResult.error) }
    const data = apiResult.data!

    const session = await this._storeSession({
      userId: data.userId,
      employeeId: data.employeeId,
      shopId: data.shopId,
      deviceId: data.deviceId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      email: data.email,
    })

    this.emit({ type: 'SIGNED_IN', session })
    return {
      ok: true,
      data: {
        userId: data.userId,
        employeeId: data.employeeId,
        shopId: data.shopId,
        deviceId: data.deviceId,
        email: data.email,
        displayName: data.displayName,
        idToken: data.idToken,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        isNewUser: data.isNewUser,
        accountStatus: data.accountStatus,
      },
    }
  }

  /**
   * Sign in with a Google ID token (Mobile flow).
   *
   * Mobile platforms use `GoogleSignin.signIn()` to obtain an ID token,
   * then pass it here along with the configured FIDScript `clientName`.
   *
   * On success, emits `SIGNED_IN`.
   */
  async signInWithGoogleIdToken(params: { idToken: string; clientName: string }): Promise<AuthResult<GoogleSignInResult>> {
    try {
      const result = await this.api.signInWithIdToken(params.clientName, params.idToken)
      if (result.error) return { ok: false, error: this._mapApiError(result.error) }
      const data = result.data!

      const session = await this._storeSession({
        userId: data.userId,
        employeeId: data.employeeId,
        shopId: data.shopId,
        deviceId: data.deviceId,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        email: data.email,
      })

      this.emit({ type: 'SIGNED_IN', session })
      return {
        ok: true,
        data: {
          userId: data.userId,
          employeeId: data.employeeId,
          shopId: data.shopId,
          deviceId: data.deviceId,
          email: data.email,
          displayName: data.displayName,
          idToken: data.idToken,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isNewUser: data.isNewUser,
          accountStatus: data.accountStatus,
        },
      }
    } catch (e) {
      return { ok: false, error: authError('OAUTH_ERROR', String(e)) }
    }
  }

  // ─── Email/password ───────────────────────────────────────────────────────

  async signInWithEmail(email: string, password: string): Promise<AuthResult<SignInResult>> {
    const result = await this.api.signInEmail(email, password)
    if (result.error) return { ok: false, error: this._mapApiError(result.error) }
    if (!result.data) return { ok: false, error: authError('UNKNOWN', 'signInWithEmail returned no data', undefined) }
    const data = result.data

    const session = await this._storeSession({
      userId: data.userId,
      employeeId: data.employeeId,
      shopId: data.shopId,
      deviceId: data.deviceId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      email: data.email,
    })

    this.emit({ type: 'SIGNED_IN', session })
    return { ok: true, data: { ...data, session: this._toAuthSession(session) } }
  }

  async registerWithEmail(
    email: string,
    password: string,
    employeeName: string,
    sendVerificationEmail = true,
  ): Promise<AuthResult<EmailRegistrationResult>> {
    const result = await this.api.registerEmail(email, password, employeeName)
    if (result.error) return { ok: false, error: this._mapApiError(result.error) }
    return { ok: true, data: result.data! }
  }

  async verifyEmailAddress(token: string): Promise<AuthResult<EmailVerificationResult>> {
    const result = await this.api.verifyEmail(token)
    if (result.error) return { ok: false, error: this._mapApiError(result.error) }
    const data = result.data!
    this.emit({ type: 'EMAIL_VERIFIED', userId: data.userId, email: data.email })
    return { ok: true, data }
  }

  async resetPassword(email: string): Promise<AuthResult<PasswordResetRequestResult>> {
    await this.api.requestPasswordReset(email)
    return { ok: true, data: { email, resetLinkSent: true } }
  }

  async completePasswordReset(token: string, newPassword: string): Promise<AuthResult<PasswordResetCompleteResult>> {
    const result = await this.api.completePasswordReset(token, newPassword)
    if (result.error) return { ok: false, error: this._mapApiError(result.error) }
    const data = result.data!

    const session = await this._storeSession({
      userId: data.userId,
      employeeId: data.employeeId,
      shopId: data.shopId,
      deviceId: data.deviceId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      email: data.email,
    })

    this.emit({ type: 'SIGNED_IN', session })
    return { ok: true, data }
  }

  // ─── Session management ──────────────────────────────────────────────────

  /**
   * Refresh the current session using the stored refresh token.
   *
   * Called automatically when the access token expires.
   * Emits `SESSION_REFRESHED` on success, `SESSION_EXPIRED` if the refresh token is invalid.
   */
  async refreshSession(): Promise<AuthResult<SessionRefreshResult>> {
    if (!this._session) {
      return { ok: false, error: authError('SESSION_REVOKED', 'No active session to refresh') }
    }

    this._syncNetworkStatus()
    if (this._networkStatus.isOnline) {
      try {
        const result = await this.api.refreshSession(this._session.refreshToken)
        if (result.error) {
          this._session = null
          this.emit({ type: 'SESSION_EXPIRED' })
          return { ok: false, error: this._mapApiError(result.error) }
        }
        const data = result.data!
        const now = new Date().toISOString() as ISO8601
        const updated: StoredSession = {
          ...this._session,
          accessToken: data.accessToken,
          expiresAt: data.expiresAt,
          lastValidatedAt: now,
        }
        await this._saveStoredSession(updated)
        this._session = updated
        this.emit({ type: 'SESSION_REFRESHED', session: this._session })
        return { ok: true, data: { session: this._toAuthSession(this._session), accessToken: data.accessToken, expiresAt: data.expiresAt } }
      } catch {
        // Network error — fall through to offline path
      }
    }

    // Offline: check if local session is still valid
    if (this.isSessionStale) {
      this._session = null
      this.emit({ type: 'SESSION_EXPIRED' })
      return { ok: false, error: authError('SESSION_REVOKED', 'Session is stale and cannot be refreshed offline') }
    }

    // At this point _session is guaranteed non-null (early return above if it were null)
    const session = this._session as StoredSession
    return {
      ok: true,
      data: { session: this._toAuthSession(session), accessToken: session.accessToken, expiresAt: session.expiresAt },
    }
  }

  /**
   * Restore a session from local InstantDB storage.
   *
   * Call this on app startup before attempting any authenticated operation.
   * Returns the restored session or null if none exists.
   */
  async restoreSession(): Promise<StoredSession | null> {
    const stored = await this._loadStoredSession()
    if (!stored) return null
    this._session = stored

    if (this._networkStatus.isOnline) {
      const refreshResult = await this.refreshSession()
      if (!refreshResult.ok) return null
    }

    return this._session
  }

  /**
   * Sign out — clears the local session and revokes the server token if online.
   *
   * Emits `SIGNED_OUT`.
   */
  async signOut(): Promise<void> {
    if (this._session && this._networkStatus.isOnline) {
      try { await this.api.revokeSession(this._session.accessToken) } catch { /* best effort */ }
    }
    this._session = null
    await this._clearStoredSession()
    this.emit({ type: 'SIGNED_OUT' })
  }

  // ─── Passwordless challenge ───────────────────────────────────────────────

  /**
   * Request a passwordless authentication challenge.
   *
   * The application layer sends the code via its own communication channel
   * (Email, WhatsApp, SMS, etc.) — the SDK has no communication dependencies.
   *
   * Emits `PASSWORDLESS_CHALLENGE_ISSUED`.
   *
   * @param email - The email address to send the challenge to.
   * @param purpose - The purpose of the challenge. A credential issued for one
   *   purpose (e.g. `salesperson_activation`) cannot be used for another purpose
   *   (e.g. `normal_passwordless_login`).
   * @param codeLength - Number of digits in the code. Default: 6.
   * @param expiresInMinutes - How long the challenge is valid. Default: 10 minutes.
   */
  async requestPasswordlessChallenge(params: {
    email: string
    purpose: PasswordlessPurpose
    codeLength?: number
    expiresInMinutes?: number
  }): Promise<AuthResult<PasswordlessChallengeResult>> {
    try {
      const result = await this.api.requestPasswordlessChallenge({
        email: params.email,
        purpose: params.purpose,
        codeLength: params.codeLength,
        expiresInMinutes: params.expiresInMinutes,
      })

      if (result.error) return { ok: false, error: this._mapApiError(result.error) }

      this.emit({ type: 'PASSWORDLESS_CHALLENGE_ISSUED', email: params.email, purpose: params.purpose })
      return { ok: true, data: result.data! }
    } catch (e) {
      return { ok: false, error: authError('UNKNOWN', String(e)) }
    }
  }

  /**
   * Verify a passwordless challenge code.
   *
   * On success: consumes the code and returns an authenticated session.
   * The session is stored locally and `SIGNED_IN` is emitted.
   *
   * On failure: returns an error. The challenge attempt counter is incremented
   * server-side. After `MAX_ATTEMPTS` failures the challenge is invalidated
   * and a new one must be requested.
   *
   * Emits `PASSWORDLESS_CHALLENGE_VERIFIED` or `PASSWORDLESS_CHALLENGE_FAILED`.
   */
  async verifyPasswordlessChallenge(params: {
    email: string
    purpose: PasswordlessPurpose
    code: string
  }): Promise<AuthResult<SignInResult>> {
    try {
      const result = await this.api.verifyPasswordlessChallenge({
        email: params.email,
        purpose: params.purpose,
        code: params.code,
      })

      if (result.error) {
        const mappedError = this._mapApiError(result.error)
        const remaining =
          mappedError.code === 'CHALLENGE_MAX_ATTEMPTS'
            ? 0
            : (result.error as { attemptsRemaining?: number }).attemptsRemaining ?? undefined
        this.emit({
          type: 'PASSWORDLESS_CHALLENGE_FAILED',
          email: params.email,
          purpose: params.purpose,
          attemptsRemaining: remaining ?? 0,
        })
        return { ok: false, error: mappedError }
      }

      const data = result.data!

      // Account-setup purposes (influencer_account_setup, salesperson_onboarding) return
      // needsSetup: true + setupToken instead of a full session. The caller must call
      // completePasswordSetup to create the permanent password and real session.
      if (data.needsSetup) {
        this.emit({ type: 'PASSWORDLESS_CHALLENGE_VERIFIED', email: params.email, purpose: params.purpose })
        return {
          ok: true,
          data: {
            userId: data.userId,
            employeeId: data.employeeId,
            shopId: data.shopId,
            deviceId: data.deviceId,
            email: data.email,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: data.expiresAt,
            isEmailVerified: data.isEmailVerified,
            session: undefined as unknown as AuthSession,
            needsSetup: true,
            setupToken: data.setupToken,
          },
        }
      }

      const session = await this._storeSession({
        userId: data.userId,
        employeeId: data.employeeId,
        shopId: data.shopId,
        deviceId: data.deviceId,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        email: data.email,
      })

      this.emit({ type: 'PASSWORDLESS_CHALLENGE_VERIFIED', email: params.email, purpose: params.purpose })
      this.emit({ type: 'SIGNED_IN', session })
      return { ok: true, data: { ...data, session: this._toAuthSession(session) } }
    } catch (e) {
      return { ok: false, error: authError('UNKNOWN', String(e)) }
    }
  }

  // ─── Account setup ─────────────────────────────────────────────────────

  /**
   * Complete account setup — exchange a `setupToken` (from `verifyPasswordlessChallenge`
   * with `needsSetup: true`) for a permanent password and an authenticated session.
   *
   * The backend validates the token, stores the password hash, and returns a real session.
   * The token is consumed atomically — reuse returns an error.
   *
   * Emits `SIGNED_IN` on success.
   */
  async completePasswordSetup(params: {
    setupToken: string
    password: string
  }): Promise<AuthResult<SignInResult>> {
    try {
      const result = await this.api.completePasswordSetup({
        setupToken: params.setupToken,
        password: params.password,
      })

      if (result.error) {
        return { ok: false, error: this._mapApiError(result.error) }
      }

      const data = result.data!

      const session = await this._storeSession({
        userId: data.userId,
        employeeId: data.employeeId,
        shopId: data.shopId,
        deviceId: data.deviceId,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        email: data.email,
      })

      this.emit({ type: 'SIGNED_IN', session })
      return { ok: true, data: { ...data, session: this._toAuthSession(session) } }
    } catch (e) {
      return { ok: false, error: authError('UNKNOWN', String(e)) }
    }
  }

  // ─── Trusted device management ──────────────────────────────────────────

  async registerTrustedDevice(deviceName: string): Promise<AuthResult<TrustedDeviceResult>> {
    if (!this._session) {
      return { ok: false, error: authError('SESSION_REVOKED', 'Must be signed in to register a trusted device') }
    }

    const deviceToken = this.platform.randomString(32)
    const result = await this.api.registerTrustedDevice(deviceToken, deviceName, this._session.accessToken)
    if (result.error) return { ok: false, error: this._mapApiError(result.error) }
    const data = result.data!

    const secure = this.platform.getSecureStorage()
    await secure.set(`trusted_device:${data.device.deviceId}`, data.deviceToken)

    this.emit({ type: 'DEVICE_REGISTERED', device: data.device })
    return { ok: true, data }
  }

  async listTrustedDevices(): Promise<AuthResult<TrustedDevice[]>> {
    if (!this._session) {
      return { ok: false, error: authError('SESSION_REVOKED', 'Must be signed in to list trusted devices') }
    }
    const result = await this.api.listTrustedDevices(this._session.accessToken)
    if (result.error) return { ok: false, error: this._mapApiError(result.error) }
    return { ok: true, data: result.data! }
  }

  async removeTrustedDevice(deviceId: DeviceId): Promise<AuthResult<void>> {
    if (!this._session) {
      return { ok: false, error: authError('SESSION_REVOKED', 'Must be signed in to remove a trusted device') }
    }
    const result = await this.api.removeTrustedDevice(String(deviceId), this._session.accessToken)
    if (result.error) return { ok: false, error: this._mapApiError(result.error) }

    const secure = this.platform.getSecureStorage()
    await secure.delete(`trusted_device:${deviceId}`)

    this.emit({ type: 'DEVICE_REVOKED', deviceId })
    return { ok: true, data: undefined }
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private _syncNetworkStatus(): void {
    this._networkStatus = this.platform.getNetworkStatus()
  }

  private async _storeSession(params: {
    userId: UserId | string
    employeeId: EmployeeId | string
    shopId: ShopId | string
    deviceId: DeviceId | string
    accessToken: string
    refreshToken?: string
    email: string
  }): Promise<StoredSession> {
    const now = new Date().toISOString() as ISO8601
    const expiresAt = new Date(Date.now() + DEFAULT_SESSION_TTL_MS).toISOString() as ISO8601
    const stored: StoredSession = {
      userId: String(params.userId),
      employeeId: String(params.employeeId),
      shopId: String(params.shopId),
      deviceId: String(params.deviceId),
      email: params.email,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken ?? '',
      createdAt: now,
      expiresAt,
      lastValidatedAt: now,
    }
    await this._saveStoredSession(stored)
    this._session = stored
    return stored
  }

  private _toAuthSession(stored: StoredSession): AuthSession {
    return {
      userId: asUserId(stored.userId),
      shopId: stored.shopId ? asShopId(stored.shopId) : undefined,
      employeeId: stored.employeeId ? asEmployeeId(stored.employeeId) : undefined,
      deviceId: stored.deviceId ? asDeviceId(stored.deviceId) : undefined,
      email: stored.email,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
    }
  }

  private _mapApiError(apiError: NonNullable<AuthApiResponse<unknown>['error']>): AuthError {
    const code = apiError.code as AuthErrorCode
    const KNOWN_CODES: AuthErrorCode[] = [
      'INVALID_CREDENTIALS', 'EMAIL_NOT_VERIFIED', 'EMAIL_ALREADY_EXISTS',
      'USER_NOT_FOUND', 'WEAK_PASSWORD', 'VERIFICATION_EXPIRED', 'VERIFICATION_INVALID',
      'RESET_EXPIRED', 'RESET_INVALID', 'SESSION_REVOKED', 'RATE_LIMITED',
      'CLOUD_SESSION_STALE', 'OFFLINE_ENTITLEMENT_EXPIRED',
      'ENROLLMENT_TOKEN_EXPIRED', 'ENROLLMENT_TOKEN_CONSUMED', 'ENROLLMENT_TOKEN_REPLAY',
      'ENROLLMENT_TOKEN_SCOPE_MISMATCH',
      'PIN_RECOVERY_REQUIRED', 'RECOVERY_CODE_INVALID', 'RECOVERY_RATE_LIMITED',
      'INVALID_CHALLENGE_CODE', 'CHALLENGE_EXPIRED', 'CHALLENGE_NOT_FOUND',
      'CHALLENGE_INVALID_PURPOSE', 'CHALLENGE_MAX_ATTEMPTS', 'CHALLENGE_COOLDOWN',
      'SETUP_TOKEN_INVALID',
      'UNKNOWN',
    ]
    return authError(KNOWN_CODES.includes(code) ? code : 'UNKNOWN', apiError.message, apiError.retryAfterMs)
  }

  private async _pkceChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }

  // ─── Platform storage hooks (override in platform adapter) ─────────────

  protected async _saveStoredSession(_session: StoredSession): Promise<void> {
    throw new Error('CloudAuth: _saveStoredSession not overridden — platform adapter must implement this')
  }

  protected async _loadStoredSession(): Promise<StoredSession | null> {
    throw new Error('CloudAuth: _loadStoredSession not overridden — platform adapter must implement this')
  }

  protected async _clearStoredSession(): Promise<void> {
    throw new Error('CloudAuth: _clearStoredSession not overridden — platform adapter must implement this')
  }
}
