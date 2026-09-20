/**
 * @soostori/auth — Passwordless onboarding tests.
 *
 * Tests the `salesperson_onboarding` purpose and the `needsSetup` flow for
 * both `influencer_account_setup` and `salesperson_onboarding`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  CloudAuth,
  PlatformAuthAdapter,
  AuthApiClient,
  AuthApiResponse,
  StoredSession,
  PasswordlessPurpose,
} from '../src/cloud-auth.js'
import type { UserId, EmployeeId, ShopId, DeviceId, ISO8601 } from '@soostori/core'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockPlatform(): PlatformAuthAdapter {
  return {
    openOAuthBrowser: vi.fn().mockResolvedValue(undefined),
    getSecureStorage: () => ({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    }),
    getNetworkStatus: () => ({ isOnline: true }),
    randomString: (len: number) => 'test-' + 'x'.repeat(len),
  }
}

function makeSignInResult(overrides: Partial<{
  needsSetup: boolean
  setupToken: string
  userId: string
  email: string
}> = {}) {
  return {
    userId: 'user-1' as UserId,
    employeeId: 'emp-1' as EmployeeId,
    shopId: 'shop-1' as ShopId,
    deviceId: 'dev-1' as DeviceId,
    email: 'onboarding@example.com',
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: '2027-01-01T00:00:00Z' as ISO8601,
    isEmailVerified: true,
    session: {} as StoredSession,
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PasswordlessPurpose type', () => {
  it('includes all four canonical purposes', () => {
    const purposes: PasswordlessPurpose[] = [
      'salesperson_activation',
      'normal_passwordless_login',
      'influencer_account_setup',
      'salesperson_onboarding',
    ]
    expect(purposes).toHaveLength(4)
  })
})

describe('CloudAuth.requestPasswordlessChallenge', () => {
  it('accepts salesperson_onboarding as a valid purpose', async () => {
    const api = {
      requestPasswordlessChallenge: vi.fn().mockResolvedValue({
        data: { expiresAt: '2027-01-01T00:10:00Z', cooldownSeconds: 60 },
      }),
    } as unknown as AuthApiClient

    // Dynamic import so we can use the actual CloudAuth class
    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(_s: StoredSession) {}
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    const result = await sut.requestPasswordlessChallenge({
      email: 'test@example.com',
      purpose: 'salesperson_onboarding',
    })

    expect(result.ok).toBe(true)
    expect(api.requestPasswordlessChallenge).toHaveBeenCalledWith({
      email: 'test@example.com',
      purpose: 'salesperson_onboarding',
      codeLength: undefined,
      expiresInMinutes: undefined,
    })
  })
})

describe('CloudAuth.verifyPasswordlessChallenge — needsSetup flow', () => {
  it('returns needsSetup:true + setupToken for salesperson_onboarding', async () => {
    const api = {
      verifyPasswordlessChallenge: vi.fn().mockResolvedValue({
        data: makeSignInResult({ needsSetup: true, setupToken: 'setup-token-abc' }),
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(_s: StoredSession) {}
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    const result = await sut.verifyPasswordlessChallenge({
      email: 'onboarding@example.com',
      purpose: 'salesperson_onboarding',
      code: '123456',
    })

    expect(result.ok).toBe(true)
    expect(result.data.needsSetup).toBe(true)
    expect(result.data.setupToken).toBe('setup-token-abc')
    expect(result.data.session).toBeUndefined()
  })

  it('returns needsSetup:true + setupToken for influencer_account_setup', async () => {
    const api = {
      verifyPasswordlessChallenge: vi.fn().mockResolvedValue({
        data: makeSignInResult({ needsSetup: true, setupToken: 'influencer-token-xyz' }),
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(_s: StoredSession) {}
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    const result = await sut.verifyPasswordlessChallenge({
      email: 'influencer@example.com',
      purpose: 'influencer_account_setup',
      code: '654321',
    })

    expect(result.ok).toBe(true)
    expect(result.data.needsSetup).toBe(true)
    expect(result.data.setupToken).toBe('influencer-token-xyz')
    expect(result.data.session).toBeUndefined()
  })

  it('creates a session for normal_passwordless_login (no needsSetup)', async () => {
    let savedSession: StoredSession | null = null

    const api = {
      verifyPasswordlessChallenge: vi.fn().mockResolvedValue({
        // No needsSetup field — normal login creates a session directly
        data: makeSignInResult(),
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(s: StoredSession) { savedSession = s }
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    const result = await sut.verifyPasswordlessChallenge({
      email: 'login@example.com',
      purpose: 'normal_passwordless_login',
      code: '111111',
    })

    expect(result.ok).toBe(true)
    expect(result.data.needsSetup).toBeUndefined()
    expect(result.data.session).toBeDefined()
    expect(savedSession?.accessToken).toBe('at')
  })

  it('emits PASSWORDLESS_CHALLENGE_VERIFIED for needsSetup result', async () => {
    let emittedEvents: any[] = []

    const api = {
      verifyPasswordlessChallenge: vi.fn().mockResolvedValue({
        data: makeSignInResult({ needsSetup: true, setupToken: 'tok' }),
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(_s: StoredSession) {}
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    sut.on(e => emittedEvents.push(e))
    await sut.verifyPasswordlessChallenge({
      email: 'x@y.com',
      purpose: 'salesperson_onboarding',
      code: '000000',
    })

    expect(emittedEvents.some(e => e.type === 'PASSWORDLESS_CHALLENGE_VERIFIED')).toBe(true)
    expect(emittedEvents.some(e => e.type === 'SIGNED_IN')).toBe(false)
  })

  it('emits PASSWORDLESS_CHALLENGE_FAILED on bad code', async () => {
    let emittedEvents: any[] = []

    const api = {
      verifyPasswordlessChallenge: vi.fn().mockResolvedValue({
        error: { code: 'VERIFICATION_INVALID', message: 'Invalid code' },
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(_s: StoredSession) {}
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    sut.on(e => emittedEvents.push(e))
    const result = await sut.verifyPasswordlessChallenge({
      email: 'x@y.com',
      purpose: 'salesperson_onboarding',
      code: 'wrong',
    })

    expect(result.ok).toBe(false)
    expect(emittedEvents.some(e => e.type === 'PASSWORDLESS_CHALLENGE_FAILED')).toBe(true)
  })

  it('wrong purpose cannot verify the challenge', async () => {
    const api = {
      verifyPasswordlessChallenge: vi.fn().mockResolvedValue({
        error: { code: 'VERIFICATION_INVALID', message: 'Purpose mismatch' },
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(_s: StoredSession) {}
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    const result = await sut.verifyPasswordlessChallenge({
      email: 'x@y.com',
      purpose: 'salesperson_onboarding',
      code: '123456',
    })

    expect(result.ok).toBe(false)
  })
})

describe('CloudAuth.completePasswordSetup', () => {
  it('creates an authenticated session after password setup', async () => {
    let savedSession: StoredSession | null = null

    const api = {
      completePasswordSetup: vi.fn().mockResolvedValue({
        data: makeSignInResult({ needsSetup: false }),
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(s: StoredSession) { savedSession = s }
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    const result = await sut.completePasswordSetup({
      setupToken: 'setup-token-abc',
      password: 'SecureP@ssw0rd!',
    })

    expect(result.ok).toBe(true)
    expect(result.data.session).toBeDefined()
    expect(savedSession?.accessToken).toBe('at')
    expect(api.completePasswordSetup).toHaveBeenCalledWith({
      setupToken: 'setup-token-abc',
      password: 'SecureP@ssw0rd!',
    })
  })

  it('emits SIGNED_IN after successful setup', async () => {
    let emittedEvents: any[] = []

    const api = {
      completePasswordSetup: vi.fn().mockResolvedValue({
        data: makeSignInResult({ needsSetup: false }),
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(_s: StoredSession) {}
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    sut.on(e => emittedEvents.push(e))
    await sut.completePasswordSetup({
      setupToken: 'tok',
      password: 'NewP@ssword',
    })

    expect(emittedEvents.some(e => e.type === 'SIGNED_IN')).toBe(true)
  })

  it('does not touch activeAt — CloudAuth has no activeAt field', async () => {
    // activeAt is a SalespersonProfile field controlled by the Phase 2 activateSalesperson()
    // lifecycle. CloudAuth.completePasswordSetup does not set it.
    // This test documents that the auth service has no activeAt concern.
    const { CloudAuth } = await import('../src/cloud-auth.js')
    expect('activeAt' in new (class extends CloudAuth {
      protected override async _saveStoredSession(_s: StoredSession) {}
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    })(mockPlatform(), {} as AuthApiClient)).toBe(false)
  })

  it('returns error when setup token is invalid or expired', async () => {
    const api = {
      completePasswordSetup: vi.fn().mockResolvedValue({
        error: { code: 'SETUP_TOKEN_INVALID', message: 'Token is invalid or expired' },
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(_s: StoredSession) {}
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    const result = await sut.completePasswordSetup({
      setupToken: 'expired-token',
      password: 'P@ssword',
    })

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('SETUP_TOKEN_INVALID')
  })
})

describe('salesperson_onboarding flow — full integration', () => {
  it('complete flow: challenge → verify(needsSetup) → completePasswordSetup → session', async () => {
    const events: any[] = []
    let savedSession: StoredSession | null = null

    const api = {
      requestPasswordlessChallenge: vi.fn().mockResolvedValue({
        data: { expiresAt: '2027-01-01T00:10:00Z', cooldownSeconds: 60 },
      }),
      verifyPasswordlessChallenge: vi.fn().mockResolvedValue({
        data: makeSignInResult({ needsSetup: true, setupToken: 'onboarding-token-123' }),
      }),
      completePasswordSetup: vi.fn().mockResolvedValue({
        data: makeSignInResult({ needsSetup: false }),
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(s: StoredSession) { savedSession = s }
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    sut.on(e => events.push(e))

    // Step 1: request challenge
    const challenge = await sut.requestPasswordlessChallenge({
      email: 'new salesperson@example.com',
      purpose: 'salesperson_onboarding',
    })
    expect(challenge.ok).toBe(true)

    // Step 2: verify code → needsSetup
    const verify = await sut.verifyPasswordlessChallenge({
      email: 'new salesperson@example.com',
      purpose: 'salesperson_onboarding',
      code: '123456',
    })
    expect(verify.ok).toBe(true)
    expect(verify.data.needsSetup).toBe(true)
    expect(verify.data.setupToken).toBe('onboarding-token-123')

    // Step 3: complete setup → real session
    const complete = await sut.completePasswordSetup({
      setupToken: 'onboarding-token-123',
      password: 'SecureP@ssword!',
    })
    expect(complete.ok).toBe(true)
    expect(complete.data.session).toBeDefined()
    expect(savedSession?.email).toBe('onboarding@example.com')

    // Verify event order
    const verified = events.find(e => e.type === 'PASSWORDLESS_CHALLENGE_VERIFIED')
    const signedIn = events.find(e => e.type === 'SIGNED_IN')
    expect(verified).toBeDefined()
    expect(signedIn).toBeDefined()
    expect(events.indexOf(verified!) < events.indexOf(signedIn!)).toBe(true)
  })

  it('existing purposes remain unchanged after adding salesperson_onboarding', async () => {
    // Verify that 'salesperson_activation' still creates a session (no needsSetup)
    let savedSession: StoredSession | null = null

    const api = {
      verifyPasswordlessChallenge: vi.fn().mockResolvedValue({
        data: makeSignInResult({ needsSetup: false }),
      }),
    } as unknown as AuthApiClient

    const { CloudAuth } = await import('../src/cloud-auth.js')
    class TestableCloudAuth extends CloudAuth {
      protected override async _saveStoredSession(s: StoredSession) { savedSession = s }
      protected override async _loadStoredSession() { return null }
      protected override async _clearStoredSession() {}
    }

    const sut = new TestableCloudAuth(mockPlatform(), api)
    await sut.verifyPasswordlessChallenge({
      email: 'activation@example.com',
      purpose: 'salesperson_activation',
      code: '999999',
    })

    expect(savedSession).not.toBeNull()
    expect(savedSession!.accessToken).toBe('at')
  })
})
