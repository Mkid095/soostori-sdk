/**
 * @soostori/auth — Default in-memory session storage tests.
 *
 * Verifies that `CloudAuth`'s default `_saveStoredSession`, `_loadStoredSession`,
 * and `_clearStoredSession` implementations work out-of-the-box without
 * requiring a platform adapter to subclass and override them.
 *
 * The default implementation stores the session in-memory only (process-local,
 * lost on restart). It is sufficient for:
 *   - Tests
 *   - Stateless serverless invocations
 *   - Platforms that layer their own persistence on top of the SDK
 *
 * For cross-restart persistence (typical production use), subclasses are
 * expected to override the three hooks to delegate to durable storage.
 * The "subclass can override" test below demonstrates the override path.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  CloudAuth,
  type AuthApiClient,
  type PlatformAuthAdapter,
  type StoredSession,
} from '../src/cloud-auth.js'

// ─── Test fixtures ───────────────────────────────────────────────────────────

function mockApi(): AuthApiClient {
  return {
    exchangeGoogleCode: vi.fn(),
    linkGoogleAccount: vi.fn(),
    signInWithIdToken: vi.fn(),
    registerEmail: vi.fn(),
    verifyEmail: vi.fn(),
    requestPasswordReset: vi.fn(),
    completePasswordReset: vi.fn(),
    signInEmail: vi.fn(),
    refreshSession: vi.fn(),
    revokeSession: vi.fn(),
    registerTrustedDevice: vi.fn(),
    listTrustedDevices: vi.fn(),
    removeTrustedDevice: vi.fn(),
    getDeviceStatus: vi.fn(),
    createDeviceEnrollment: vi.fn(),
    verifyPinForEnrollment: vi.fn(),
    consumeEnrollmentToken: vi.fn(),
    changePin: vi.fn(),
    requestPinRecovery: vi.fn(),
    verifyPinRecoveryCode: vi.fn(),
    resetPin: vi.fn(),
    listEnrolledDevices: vi.fn(),
    revokeDevice: vi.fn(),
    getSubscriptionStatus: vi.fn(),
    requestPasswordlessChallenge: vi.fn(),
    verifyPasswordlessChallenge: vi.fn(),
    completePasswordSetup: vi.fn(),
  } as unknown as AuthApiClient
}

function mockPlatform(): PlatformAuthAdapter {
  return {
    openOAuthBrowser: vi.fn(),
    getSecureStorage: () => ({
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    }),
    getNetworkStatus: () => ({ isOnline: true }),
    randomString: (n: number) => 'x'.repeat(n),
    setCookie: vi.fn(),
  }
}

function makeSession(overrides: Partial<StoredSession> = {}): StoredSession {
  const now = new Date().toISOString() as any
  return {
    userId: 'user-1',
    employeeId: 'emp-1',
    shopId: 'shop-1',
    deviceId: 'device-1',
    email: 'a@b.com',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    createdAt: now,
    expiresAt: now,
    lastValidatedAt: now,
    ...overrides,
  }
}

/**
 * Test helper: instantiate a `CloudAuth` with default storage hooks and
 * expose the protected storage methods for direct testing.
 */
function makeCloudAuthWithStorage() {
  const auth = new CloudAuth(mockPlatform(), mockApi())
  // Type-narrow the protected methods for direct testing.
  return auth as unknown as {
    _saveStoredSession: (s: StoredSession) => Promise<void>
    _loadStoredSession: () => Promise<StoredSession | null>
    _clearStoredSession: () => Promise<void>
  }
}

/**
 * Test helper: instantiate a `CloudAuth` subclass that records every
 * storage call into the provided spy arrays. Used to verify that
 * subclass overrides are actually invoked (i.e. not bypassed by the
 * default implementation).
 */
function makeCloudAuthWithOverride(spies: {
  saves: StoredSession[]
  loads: number
  clears: number
}) {
  class OverrideCloudAuth extends CloudAuth {
    protected async _saveStoredSession(session: StoredSession): Promise<void> {
      spies.saves.push(session)
    }
    protected async _loadStoredSession(): Promise<StoredSession | null> {
      spies.loads += 1
      return null
    }
    protected async _clearStoredSession(): Promise<void> {
      spies.clears += 1
    }
  }
  return new OverrideCloudAuth(mockPlatform(), mockApi())
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CloudAuth default session storage', () => {
  it('saves and loads a session using the default in-memory implementation', async () => {
    const auth = makeCloudAuthWithStorage()
    const session = makeSession({ userId: 'u-1' })

    expect(await auth._loadStoredSession()).toBeNull()

    await auth._saveStoredSession(session)

    const loaded = await auth._loadStoredSession()
    expect(loaded).toEqual(session)
  })

  it('overwrites the stored session when saved twice (same instance)', async () => {
    const auth = makeCloudAuthWithStorage()
    const first = makeSession({ userId: 'first', accessToken: 'at-1' })
    const second = makeSession({ userId: 'second', accessToken: 'at-2' })

    await auth._saveStoredSession(first)
    await auth._saveStoredSession(second)

    const loaded = await auth._loadStoredSession()
    expect(loaded?.userId).toBe('second')
    expect(loaded?.accessToken).toBe('at-2')
  })

  it('clears the stored session (and is a no-op when nothing is stored)', async () => {
    const auth = makeCloudAuthWithStorage()

    // No-op when nothing stored
    await auth._clearStoredSession()
    expect(await auth._loadStoredSession()).toBeNull()

    // Save → clear → load returns null
    await auth._saveStoredSession(makeSession())
    expect(await auth._loadStoredSession()).not.toBeNull()
    await auth._clearStoredSession()
    expect(await auth._loadStoredSession()).toBeNull()
  })

  it('isolates storage between two independent instances', async () => {
    const authA = makeCloudAuthWithStorage()
    const authB = makeCloudAuthWithStorage()

    const sessionA = makeSession({ userId: 'A' })
    await authA._saveStoredSession(sessionA)

    expect(await authA._loadStoredSession()).toEqual(sessionA)
    // B has its own store — must NOT see A's session
    expect(await authB._loadStoredSession()).toBeNull()

    // Clearing A must not affect B
    await authA._clearStoredSession()
    expect(await authA._loadStoredSession()).toBeNull()
    expect(await authB._loadStoredSession()).toBeNull()
  })

  it('allows a subclass to override the storage hooks and is actually invoked', async () => {
    const spies = { saves: [] as StoredSession[], loads: 0, clears: 0 }
    const auth = makeCloudAuthWithOverride(spies) as unknown as {
      _saveStoredSession: (s: StoredSession) => Promise<void>
      _loadStoredSession: () => Promise<StoredSession | null>
      _clearStoredSession: () => Promise<void>
    }

    const session = makeSession({ userId: 'override-1' })
    await auth._saveStoredSession(session)
    expect(spies.saves).toHaveLength(1)
    expect(spies.saves[0]).toEqual(session)

    await auth._loadStoredSession()
    expect(spies.loads).toBe(1)

    await auth._clearStoredSession()
    expect(spies.clears).toBe(1)
  })

  it('does not throw at runtime when the parent web app instantiates CloudAuth directly (regression for P0-5)', async () => {
    // Simulates the parent web app: `new CloudAuth(platform, api)` with
    // no subclassing. Sign-out calls _clearStoredSession which used to
    // throw "not overridden". With the default impl it must be a no-op.
    const auth = new CloudAuth(mockPlatform(), mockApi())

    // The protected method, previously throwing, is now safe to call.
    const safe = auth as unknown as { _clearStoredSession: () => Promise<void> }
    await expect(safe._clearStoredSession()).resolves.toBeUndefined()
  })
})