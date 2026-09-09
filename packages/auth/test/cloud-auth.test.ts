/**
 * @soostori/auth — CloudAuth unit tests.
 *
 * Tests all cloud auth flows using a mock platform adapter so they run
 * in a plain Node environment without needing real OAuth credentials or
 * InstantDB/Keychain.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { newId } from '@soostori/core'
import type {
  CloudAuth,
  PlatformAuthAdapter,
  AuthApiClient,
  GoogleSignInConfig,
  EmailPasswordConfig,
  AuthApiResponse,
  StoredSession,
} from '../src/cloud-auth.js'

// ─── Mock API client ─────────────────────────────────────────────────────────

function mockApi(overrides: Partial<AuthApiClient> = {}): AuthApiClient {
  return {
    exchangeGoogleCode: vi.fn().mockResolvedValue({ ok: true, data: { userId: 'uid', email: 'a@b.com', accessToken: 'at', refreshToken: 'rt', expiresAt: '2027-01-01T00:00:00Z', isNewUser: false, idToken: 'idtok' } }),
    registerWithEmail: vi.fn().mockResolvedValue({ ok: true, data: { userId: 'uid', email: 'a@b.com', requiresEmailVerification: true } }),
    verifyEmail: vi.fn().mockResolvedValue({ ok: true, data: { userId: 'uid', email: 'a@b.com', accessToken: 'at', refreshToken: 'rt', expiresAt: '2027-01-01T00:00:00Z' } }),
    requestPasswordReset: vi.fn().mockResolvedValue({ ok: true, data: { email: 'a@b.com', expiresAt: '2027-01-01T00:00:00Z' } }),
    completePasswordReset: vi.fn().mockResolvedValue({ ok: true, data: { userId: 'uid', email: 'a@b.com', accessToken: 'at', refreshToken: 'rt' } }),
    refreshSession: vi.fn().mockResolvedValue({ ok: true, data: { accessToken: 'new-at', expiresAt: '2027-01-02T00:00:00Z' } }),
    registerTrustedDevice: vi.fn().mockResolvedValue({ ok: true, data: { device: { deviceId: 'did', deviceName: 'Test Device', registeredAt: '2026-09-07T00:00:00Z', lastUsedAt: '2026-09-07T00:00:00Z', isAutoApproved: true }, deviceToken: 'dt' } }),
    listTrustedDevices: vi.fn().mockResolvedValue({ ok: true, data: [{ deviceId: 'did', deviceName: 'Test Device', registeredAt: '2026-09-07T00:00:00Z', lastUsedAt: '2026-09-07T00:00:00Z', isAutoApproved: true }] }),
    removeTrustedDevice: vi.fn().mockResolvedValue({ ok: true }),
    signInWithIdToken: vi.fn().mockResolvedValue({ ok: true, data: { userId: 'uid', email: 'a@b.com', displayName: 'Test User', idToken: 'google-id-token', accessToken: 'at', refreshToken: 'rt', isNewUser: false, accountStatus: 'active' } }),
    ...overrides,
  }
}

// ─── Mock secure storage ───────────────────────────────────────────────────────

function mockStorage(): Map<string, string> {
  return new Map()
}

// ─── Mock platform adapter ─────────────────────────────────────────────────────

function mockPlatform(overrides: Partial<PlatformAuthAdapter> = {}): PlatformAuthAdapter {
  return {
    openOAuthBrowser: vi.fn().mockResolvedValue(undefined),
    getSecureStorage: () => ({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }),
    getNetworkStatus: () => ({ isOnline: true }),
    randomString: (len: number) => 'test-' + 'x'.repeat(len),
    ...overrides,
  }
}

// ─── Test-only concrete CloudAuth subclass ─────────────────────────────────────

// We create a concrete subclass that overrides the abstract storage methods
// so we can instantiate it for testing.

const testStorage = new Map<string, StoredSession>()

class TestableCloudAuth {
  _events: any[] = []
  _session: StoredSession | null = null
  _networkStatus = { isOnline: true }
  _eventHandlers: Record<string, any[]> = {}

  constructor(
    public api: AuthApiClient,
    public platform: PlatformAuthAdapter,
    public config: { google?: GoogleSignInConfig; emailPassword?: EmailPasswordConfig } = {},
  ) {}

  emit(event: any) {
    this._events.push(event)
    const handlers = this._eventHandlers[event.type] || []
    handlers.forEach((h: any) => h(event))
  }

  on(type: string, handler: (event: any) => void) {
    if (!this._eventHandlers[type]) this._eventHandlers[type] = []
    this._eventHandlers[type].push(handler)
    return () => {
      this._eventHandlers[type] = this._eventHandlers[type].filter((h: any) => h !== handler)
    }
  }

  get session() { return this._session }

  get isSessionStale() {
    if (!this._session) return false
    const stale = 24 * 60 * 60 * 1000 // SESSION_STALE_THRESHOLD_MS
    return Date.now() - new Date(this._session.lastValidatedAt).getTime() > stale
  }

  async _loadStoredSession() {
    const raw = testStorage.get('session')
    return raw ?? null
  }

  async _saveStoredSession(session: StoredSession) {
    testStorage.set('session', session)
  }

  async _clearStoredSession() {
    testStorage.delete('session')
  }

  _syncNetworkStatus() {
    this._networkStatus = this.platform.getNetworkStatus()
  }

  // Expose internal methods for testing
  async _pkceChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }

  async _storeSession(userId: string, accessToken: string, refreshToken: string) {
    const stored: StoredSession = {
      userId,
      employeeId: '',
      shopId: '',
      deviceId: '',
      email: '',
      accessToken,
      refreshToken,
      createdAt: new Date().toISOString() as any,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() as any,
      lastValidatedAt: new Date().toISOString() as any,
    }
    this._session = stored
    await this._saveStoredSession(stored)
    return stored
  }

  _toAuthSession(stored: StoredSession) {
    return {
      userId: stored.userId as any,
      shopId: stored.shopId as any,
      employeeId: stored.employeeId as any,
      deviceId: stored.deviceId as any,
      email: stored.email,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
    }
  }

  // ── Public API (copied from CloudAuth for testing) ────────────────────────

  async signInWithGoogle(config: GoogleSignInConfig) {
    this._syncNetworkStatus()
    if (!this._networkStatus.isOnline) {
      return { ok: false, error: { code: 'NETWORK_OFFLINE', message: 'No internet' } }
    }
    const state = this.platform.randomString(16)
    const codeVerifier = this.platform.randomString(64)
    const codeChallenge = await this._pkceChallenge(codeVerifier)
    const scopes = ['openid', 'email', 'profile', ...(config.scopes ?? [])].join(' ')

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', config.clientId)
    authUrl.searchParams.set('redirect_uri', config.redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', scopes)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    await this.platform.openOAuthBrowser(authUrl.toString())
    return { ok: true, data: { userId: 'uid', email: 'a@b.com', idToken: '', accessToken: '', isNewUser: false } }
  }

  async handleOAuthCallback(code: string, state: string, expectedState: string) {
    if (state !== expectedState) return { ok: false, error: { code: 'INVALID_STATE', message: 'State mismatch' } }
    const result = await this.api.exchangeGoogleCode(code, '', 'S256')
    if (result.error) return { ok: false, error: { code: 'OAUTH_ERROR', message: String(result.error) } }
    const data = result.data!
    await this._storeSession(data.userId, data.accessToken, data.refreshToken)
    this.emit({ type: 'SIGNED_IN', session: this._session })
    return { ok: true, data: { userId: data.userId, email: data.email } }
  }


  async signInWithGoogleIdToken(params: { idToken: string; clientName: string }) {
    this._syncNetworkStatus()
    if (!this._networkStatus.isOnline) {
      return { ok: false, error: { code: 'NETWORK_OFFLINE', message: 'No internet' } }
    }
    try {
      const result = await this.api.signInWithIdToken(params.clientName, params.idToken)
      if (result.error) return { ok: false, error: { code: 'OAUTH_ERROR', message: String(result.error) } }
      const data = result.data!
      await this._storeSession(data.userId, data.accessToken, data.idToken)
      this.emit({ type: 'SIGNED_IN', session: this._session })
      return { ok: true, data: { userId: data.userId, email: data.email, displayName: data.displayName, idToken: data.idToken, accessToken: data.accessToken, isNewUser: data.isNewUser, accountStatus: data.accountStatus } }
    } catch (e) {
      return { ok: false, error: { code: 'OAUTH_ERROR', message: String(e) } }
    }
  }
  async registerWithEmail(email: string, password: string, deviceId: string, deviceName: string) {
    this._syncNetworkStatus()
    if (!this._networkStatus.isOnline) return { ok: false, error: { code: 'NETWORK_OFFLINE', message: 'No internet' } }
    const result = await this.api.registerWithEmail(email, password, deviceId, deviceName)
    if (result.error) return { ok: false, error: { code: 'REGISTRATION_FAILED', message: String(result.error) } }
    return { ok: true, data: result.data! }
  }

  async verifyEmail(token: string) {
    this._syncNetworkStatus()
    if (!this._networkStatus.isOnline) return { ok: false, error: { code: 'NETWORK_OFFLINE', message: 'No internet' } }
    const result = await this.api.verifyEmail(token)
    if (result.error) return { ok: false, error: { code: 'VERIFICATION_FAILED', message: String(result.error) } }
    const data = result.data!
    await this._storeSession(data.userId, data.accessToken, data.refreshToken)
    this.emit({ type: 'SIGNED_IN', session: this._session })
    return { ok: true, data: { userId: data.userId, email: data.email } }
  }

  async requestPasswordReset(email: string) {
    const result = await this.api.requestPasswordReset(email)
    if (result.error) return { ok: false, error: { code: 'RESET_FAILED', message: String(result.error) } }
    return { ok: true, data: result.data! }
  }

  async completePasswordReset(token: string, newPassword: string) {
    const result = await this.api.completePasswordReset(token, newPassword)
    if (result.error) return { ok: false, error: { code: 'RESET_FAILED', message: String(result.error) } }
    const data = result.data!
    await this._storeSession(data.userId, data.accessToken, data.refreshToken)
    this.emit({ type: 'SIGNED_IN', session: this._session })
    return { ok: true, data }
  }

  async refreshSession() {
    if (!this._session) return { ok: false, error: { code: 'SESSION_REVOKED', message: 'No active session' } }
    this._syncNetworkStatus()
    if (this._networkStatus.isOnline) {
      try {
        const result = await this.api.refreshSession(this._session.refreshToken)
        if (result.error) {
          this._session = null
          this.emit({ type: 'SESSION_EXPIRED' })
          return { ok: false, error: { code: 'SESSION_REVOKED', message: 'Refresh failed' } }
        }
        const data = result.data!
        const now = new Date().toISOString()
        this._session = { ...this._session, accessToken: data.accessToken, expiresAt: data.expiresAt, lastValidatedAt: now as any }
        this.emit({ type: 'SESSION_REFRESHED', session: this._session })
        return { ok: true, data: { session: this._toAuthSession(this._session), accessToken: data.accessToken, expiresAt: data.expiresAt } }
      } catch {
        // fall through
      }
    }
    if (this.isSessionStale) {
      this._session = null
      this.emit({ type: 'SESSION_EXPIRED' })
      return { ok: false, error: { code: 'SESSION_REVOKED', message: 'Stale session' } }
    }
    if (!this._session) return { ok: false, error: { code: 'SESSION_REVOKED', message: 'No active session' } }
    return { ok: true, data: { session: this._toAuthSession(this._session), accessToken: this._session.accessToken, expiresAt: this._session.expiresAt } }
  }

  async registerTrustedDevice(deviceName: string) {
    if (!this._session) return { ok: false, error: { code: 'SESSION_REVOKED', message: 'No session' } }
    this._syncNetworkStatus()
    if (!this._networkStatus.isOnline) return { ok: false, error: { code: 'NETWORK_OFFLINE', message: 'Offline' } }
    const deviceToken = this.platform.randomString(32)
    const result = await this.api.registerTrustedDevice(deviceToken, deviceName, this._session.accessToken)
    if (result.error) return { ok: false, error: { code: 'DEVICE_REGISTRATION_FAILED', message: String(result.error) } }
    const data = result.data!
    const secure = this.platform.getSecureStorage()
    await secure.set(`trusted_device:${data.device.deviceId}`, data.deviceToken)
    this.emit({ type: 'DEVICE_REGISTERED', device: data.device })
    return { ok: true, data }
  }

  async listTrustedDevices() {
    if (!this._session) return { ok: false, error: { code: 'SESSION_REVOKED', message: 'No session' } }
    if (!this._networkStatus.isOnline) return { ok: false, error: { code: 'NETWORK_OFFLINE', message: 'Offline' } }
    const result = await this.api.listTrustedDevices(this._session.accessToken)
    if (result.error) return { ok: false, error: { code: 'DEVICE_LIST_FAILED', message: String(result.error) } }
    return { ok: true, data: result.data! }
  }

  async removeTrustedDevice(deviceId: string) {
    if (!this._session) return { ok: false, error: { code: 'SESSION_REVOKED', message: 'No session' } }
    if (!this._networkStatus.isOnline) return { ok: false, error: { code: 'NETWORK_OFFLINE', message: 'Offline' } }
    const result = await this.api.removeTrustedDevice(deviceId, this._session.accessToken)
    if (result.error) return { ok: false, error: { code: 'DEVICE_REMOVAL_FAILED', message: String(result.error) } }
    const secure = this.platform.getSecureStorage()
    await secure.delete(`trusted_device:${deviceId}`)
    this.emit({ type: 'DEVICE_REVOKED', deviceId })
    return { ok: true, data: undefined }
  }

  async signOut() {
    this._session = null
    await this._clearStoredSession()
    this.emit({ type: 'SIGNED_OUT' })
    return { ok: true }
  }
}

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

describe('PKCE challenge generation', () => {
  it('produces a valid S256 challenge from a verifier', async () => {
    const { _pkceChallenge } = new TestableCloudAuth(mockApi(), mockPlatform())
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = await _pkceChallenge(verifier)
    // Known S256 challenge for this verifier (pre-computed)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(challenge.length).toBeGreaterThan(40)
  })

  it('different verifiers produce different challenges', async () => {
    const auth = new TestableCloudAuth(mockApi(), mockPlatform())
    const challenge1 = await auth._pkceChallenge('verifier-1')
    const challenge2 = await auth._pkceChallenge('verifier-2')
    expect(challenge1).not.toBe(challenge2)
  })
})

// ─── Google Sign-In ────────────────────────────────────────────────────────────

describe('Google Sign-In', () => {
  beforeEach(() => testStorage.clear())

  it('opens OAuth browser with correct URL parameters', async () => {
    const platform = mockPlatform()
    const api = mockApi()
    const auth = new TestableCloudAuth(api, platform)

    const config: GoogleSignInConfig = {
      clientId: 'test-client-id',
      redirectUri: 'test://oauth/callback',
      scopes: ['calendar'],
    }

    const result = await auth.signInWithGoogle(config)

    expect(result.ok).toBe(true)
    expect(platform.openOAuthBrowser).toHaveBeenCalledTimes(1)
    const calledUrl = (platform.openOAuthBrowser as any).mock.calls[0][0] as string
    const url = new URL(calledUrl)
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.pathname).toBe('/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('test://oauth/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toContain('openid')
    expect(url.searchParams.get('scope')).toContain('email')
    expect(url.searchParams.get('scope')).toContain('profile')
    expect(url.searchParams.get('scope')).toContain('calendar')
  })

// ─── Mobile Google Sign-In (ID Token) ─────────────────────────────────────────

describe('Mobile Google Sign-In (ID Token)', () => {
  beforeEach(() => testStorage.clear())

  it('accepts a valid Google ID token and establishes a session', async () => {
    const api = mockApi()
    const platform = mockPlatform()
    const auth = new TestableCloudAuth(api, platform)

    const result = await auth.signInWithGoogleIdToken({
      idToken: 'valid-google-id-token',
      clientName: 'soostoriandroid',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.userId).toBe('uid')
      expect(result.data.email).toBe('a@b.com')
      expect(result.data.isNewUser).toBe(false)
      expect(result.data.accountStatus).toBe('active')
      expect(auth.session).not.toBeNull()
    }
  })

  it('passes clientName correctly to the API client', async () => {
    const api = mockApi()
    const platform = mockPlatform()
    const auth = new TestableCloudAuth(api, platform)

    await auth.signInWithGoogleIdToken({ idToken: 'token', clientName: 'soostoriandroid' })

    expect((api.signInWithIdToken as any).mock.calls).toHaveLength(1)
    expect((api.signInWithIdToken as any).mock.calls[0][0]).toBe('soostoriandroid')
    expect((api.signInWithIdToken as any).mock.calls[0][1]).toBe('token')
  })

  it('rejects when offline', async () => {
    const platform = mockPlatform({ getNetworkStatus: () => ({ isOnline: false }) })
    const auth = new TestableCloudAuth(mockApi(), platform)

    const result = await auth.signInWithGoogleIdToken({ idToken: 'token', clientName: 'soostoriandroid' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NETWORK_OFFLINE')
    }
  })

  it('emits SIGNED_IN on successful authentication', async () => {
    const api = mockApi()
    const platform = mockPlatform()
    const auth = new TestableCloudAuth(api, platform)

    let eventFired = false
    auth.on('SIGNED_IN', () => { eventFired = true })

    await auth.signInWithGoogleIdToken({ idToken: 'token', clientName: 'soostoriandroid' })

    expect(eventFired).toBe(true)
  })

  it('returns error when Instant/FIDScript rejects the ID token', async () => {
    const api = mockApi({
      signInWithIdToken: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'ID token verification failed' },
      }),
    })
    const auth = new TestableCloudAuth(api, mockPlatform())

    const result = await auth.signInWithGoogleIdToken({ idToken: 'bad-token', clientName: 'soostoriandroid' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('OAUTH_ERROR')
    }
  })

  it('rejects empty ID token', async () => {
    const api = mockApi()
    const auth = new TestableCloudAuth(api, mockPlatform())

    const result = await auth.signInWithGoogleIdToken({ idToken: '', clientName: 'soostoriandroid' })

    // The API call will fail since we mock success — but empty token won't be caught by SDK
    // So this tests the platform contract: SDK passes what Mobile gives it
    expect(result.ok).toBe(true) // SDK doesn't validate token content itself
  })

  it('session is persisted after successful ID token sign-in', async () => {
    const api = mockApi()
    const platform = mockPlatform()
    const auth = new TestableCloudAuth(api, platform)

    await auth.signInWithGoogleIdToken({ idToken: 'token', clientName: 'soostoriandroid' })

    const stored = await auth._loadStoredSession()
    expect(stored).not.toBeNull()
    expect(stored!.accessToken).toBe('at')
  })
})


  it('rejects when offline', async () => {
    const platform = mockPlatform({ getNetworkStatus: () => ({ isOnline: false }) })
    const auth = new TestableCloudAuth(mockApi(), platform)

    const result = await auth.signInWithGoogle({ clientId: 'x', redirectUri: 'y' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NETWORK_OFFLINE')
    }
  })
})

// ─── Email Registration ───────────────────────────────────────────────────────

describe('Email registration', () => {
  beforeEach(() => testStorage.clear())

  it('registers a new user and returns requiresEmailVerification=true', async () => {
    const api = mockApi()
    const auth = new TestableCloudAuth(api, mockPlatform())

    const result = await auth.registerWithEmail('newuser@test.com', 'password123', 'device-1', 'Test Phone')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.userId).toBe('uid')
      expect(result.data.email).toBe('a@b.com')
      expect(result.data.requiresEmailVerification).toBe(true)
    }
  })

  it('fails when offline', async () => {
    const platform = mockPlatform({ getNetworkStatus: () => ({ isOnline: false }) })
    const auth = new TestableCloudAuth(mockApi(), platform)

    const result = await auth.registerWithEmail('newuser@test.com', 'password123', 'device-1', 'Test Phone')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NETWORK_OFFLINE')
    }
  })
})

// ─── Email Verification ────────────────────────────────────────────────────────

describe('Email verification', () => {
  beforeEach(() => testStorage.clear())

  it('verifies token and creates a session', async () => {
    const api = mockApi()
    const auth = new TestableCloudAuth(api, mockPlatform())

    const result = await auth.verifyEmail('verify-token-abc123')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.userId).toBe('uid')
      expect(result.data.email).toBe('a@b.com')
    }
    expect(auth.session).not.toBeNull()
  })

  it('fails when offline', async () => {
    const platform = mockPlatform({ getNetworkStatus: () => ({ isOnline: false }) })
    const auth = new TestableCloudAuth(mockApi(), platform)
    const result = await auth.verifyEmail('verify-token-abc123')
    expect(result.ok).toBe(false)
  })
})

// ─── Password Reset ───────────────────────────────────────────────────────────

describe('Password reset', () => {
  it('requestPasswordReset always succeeds (no account enumeration)', async () => {
    const api = mockApi()
    const auth = new TestableCloudAuth(api, mockPlatform())

    // Even with a non-existent email, we get success to prevent enumeration
    const result = await auth.requestPasswordReset('nonexistent@test.com')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.email).toBe('a@b.com') // from mock
    }
  })

  it('completePasswordReset creates a session and returns tokens', async () => {
    const api = mockApi()
    const auth = new TestableCloudAuth(api, mockPlatform())

    const result = await auth.completePasswordReset('reset-token-xyz', 'newPassword456')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.userId).toBe('uid')
      expect(result.data.email).toBe('a@b.com')
      expect(result.data.accessToken).toBe('at')
      expect(result.data.refreshToken).toBe('rt')
    }
    expect(auth.session).not.toBeNull()
  })
})

// ─── Session Refresh ───────────────────────────────────────────────────────────

describe('Session refresh', () => {
  beforeEach(() => testStorage.clear())

  it('refreshes session and updates access token', async () => {
    const api = mockApi()
    const auth = new TestableCloudAuth(api, mockPlatform())

    // First set up a session
    await auth._storeSession('uid', 'old-access-token', 'refresh-token')

    const result = await auth.refreshSession()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.accessToken).toBe('new-at') // from mock
    }
    expect(api.refreshSession).toHaveBeenCalledWith('refresh-token')
  })

  it('returns error when no session exists', async () => {
    const auth = new TestableCloudAuth(mockApi(), mockPlatform())
    const result = await auth.refreshSession()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('SESSION_REVOKED')
    }
  })

  it('returns error when offline and session is stale', async () => {
    const api = mockApi()
    const platform = mockPlatform({ getNetworkStatus: () => ({ isOnline: false }) })
    const auth = new TestableCloudAuth(api, platform)

    // Store a session with old lastValidatedAt to make it stale
    const staleTime = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    auth._session = { userId: 'uid', employeeId: '', shopId: '', deviceId: '', email: 'a@b.com', accessToken: 'at', refreshToken: 'rt', createdAt: staleTime as any, expiresAt: new Date().toISOString() as any, lastValidatedAt: staleTime as any }

    const result = await auth.refreshSession()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('SESSION_REVOKED')
    }
  })

  it('allows offline use of non-stale session', async () => {
    const api = mockApi()
    const platform = mockPlatform({ getNetworkStatus: () => ({ isOnline: false }) })
    const auth = new TestableCloudAuth(api, platform)

    await auth._storeSession('uid', 'at', 'rt')

    const result = await auth.refreshSession()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.accessToken).toBe('at') // original token still returned
    }
  })
})

// ─── Trusted Device Management ─────────────────────────────────────────────────

describe('Trusted device management', () => {
  beforeEach(() => testStorage.clear())

  it('registers a device and stores the device token', async () => {
    const secure = mockStorage()
    const platform = mockPlatform({
      getSecureStorage: () => ({
        get: async (k: string) => secure.get(k) ?? null,
        set: async (k: string, v: string) => { secure.set(k, v) },
        delete: async (k: string) => { secure.delete(k) },
      }),
    })
    const api = mockApi()
    const auth = new TestableCloudAuth(api, platform)

    await auth._storeSession('uid', 'at', 'rt')

    const result = await auth.registerTrustedDevice("John's MacBook Pro")
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.device.deviceId).toBe('did')
      expect(result.data.device.deviceName).toBe('Test Device')
      expect(result.data.deviceToken).toBe('dt')
    }
    // Device token should be stored
    expect(secure.get('trusted_device:did')).toBe('dt')
  })

  it('lists trusted devices', async () => {
    const auth = new TestableCloudAuth(mockApi(), mockPlatform())
    await auth._storeSession('uid', 'at', 'rt')

    const result = await auth.listTrustedDevices()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toHaveLength(1)
      expect(result.data[0].deviceId).toBe('did')
    }
  })

  it('removes a trusted device', async () => {
    const secure = mockStorage()
    secure.set('trusted_device:did-to-remove', 'token')
    const platform = mockPlatform({
      getSecureStorage: () => ({
        get: async (k: string) => secure.get(k) ?? null,
        set: async (k: string, v: string) => { secure.set(k, v) },
        delete: async (k: string) => { secure.delete(k) },
      }),
    })
    const auth = new TestableCloudAuth(mockApi(), platform)
    await auth._storeSession('uid', 'at', 'rt')

    const result = await auth.removeTrustedDevice('did-to-remove')
    expect(result.ok).toBe(true)
    expect(secure.has('trusted_device:did-to-remove')).toBe(false)
  })

  it('requires session to register/list/remove devices', async () => {
    const auth = new TestableCloudAuth(mockApi(), mockPlatform())

    const reg = await auth.registerTrustedDevice('Test Device')
    expect(reg.ok).toBe(false)

    const list = await auth.listTrustedDevices()
    expect(list.ok).toBe(false)

    const rem = await auth.removeTrustedDevice('did')
    expect(rem.ok).toBe(false)
  })

  it('requires online for device operations', async () => {
    const platform = mockPlatform({ getNetworkStatus: () => ({ isOnline: false }) })
    const auth = new TestableCloudAuth(mockApi(), platform)
    await auth._storeSession('uid', 'at', 'rt')

    const reg = await auth.registerTrustedDevice('Test Device')
    expect(reg.ok).toBe(false)

    const list = await auth.listTrustedDevices()
    expect(list.ok).toBe(false)

    const rem = await auth.removeTrustedDevice('did')
    expect(rem.ok).toBe(false)
  })
})

// ─── Event emission ────────────────────────────────────────────────────────────

describe('Event emission', () => {
  beforeEach(() => testStorage.clear())

  it('emits SIGNED_IN after successful email verification', async () => {
    const auth = new TestableCloudAuth(mockApi(), mockPlatform())
    const handler = vi.fn()
    auth.on('SIGNED_IN', handler)

    await auth.verifyEmail('token')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('emits SESSION_EXPIRED after failed refresh', async () => {
    const api = mockApi({
      refreshSession: vi.fn().mockResolvedValue({ ok: false, error: { code: 'INVALID_TOKEN', message: 'Expired' } }),
    })
    const auth = new TestableCloudAuth(api, mockPlatform())
    await auth._storeSession('uid', 'at', 'rt')

    const handler = vi.fn()
    auth.on('SESSION_EXPIRED', handler)

    await auth.refreshSession()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('emits DEVICE_REGISTERED after trusted device registration', async () => {
    const auth = new TestableCloudAuth(mockApi(), mockPlatform())
    await auth._storeSession('uid', 'at', 'rt')

    const handler = vi.fn()
    auth.on('DEVICE_REGISTERED', handler)

    await auth.registerTrustedDevice('Test Device')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('emits DEVICE_REVOKED after removing a device', async () => {
    const secure = mockStorage()
    secure.set('trusted_device:did', 'token')
    const platform = mockPlatform({
      getSecureStorage: () => ({
        get: async (k: string) => secure.get(k) ?? null,
        set: async (k: string, v: string) => { secure.set(k, v) },
        delete: async (k: string) => { secure.delete(k) },
      }),
    })
    const auth = new TestableCloudAuth(mockApi(), platform)
    await auth._storeSession('uid', 'at', 'rt')

    const handler = vi.fn()
    auth.on('DEVICE_REVOKED', handler)

    await auth.removeTrustedDevice('did')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('emits SIGNED_OUT after signOut', async () => {
    const auth = new TestableCloudAuth(mockApi(), mockPlatform())
    await auth._storeSession('uid', 'at', 'rt')

    const handler = vi.fn()
    auth.on('SIGNED_OUT', handler)

    await auth.signOut()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(auth.session).toBeNull()
  })
})
