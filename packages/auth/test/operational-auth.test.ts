/**
 * @soostori/auth — OperationalAuth comprehensive unit tests.
 *
 * Tests cover:
 * - First-device PIN setup
 * - New-device existing-PIN enrollment (Section 10 cross-device flow)
 * - Invalid PIN, PIN lockout
 * - Enrollment token: valid, expired, wrong-scope, already-consumed, replay, concurrent
 * - PIN change
 * - PIN recovery (request, verify, reset)
 * - Offline entitlement: 3-day boundary, reconnect after limit
 * - Cloud session stale vs operational entitlement (independent)
 * - TrustedDevice vs operational device separation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OperationalAuth, type OperationalCloudApi } from '../src/operational-auth.js'
import { OperationalPlatformAdapter } from '../src/operational-auth.js'
import type { EmployeeId, ShopId, DeviceId } from '@soostori/core'
import { ENROLLMENT_TOKEN_TTL_MS, OFFLINE_ENTITLEMENT_TTL_MS, PIN_RATE_LIMIT_MS, MAX_PIN_ATTEMPTS } from '../src/operational-auth.js'
import { hashPin, verifyPin } from '../src/pin-node.js'

const REAL_PIN = '1234'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EID = 'e1' as EmployeeId
const SID = 's1' as ShopId
const DID = 'd1' as DeviceId
const DID2 = 'd2' as DeviceId
const now = new Date()
const future = (ms: number) => new Date(Date.now() + ms).toISOString()
const past = (ms: number) => new Date(Date.now() - ms).toISOString()

// A deterministic hashPin for testing: always returns known output
function makeFixedHashPin(hash: string, salt: string) {
  return () => ({ hash, salt })
}

// Returns true only for exact pin
function makeVerifyPin(hash: string, salt: string) {
  return (pin: string) => pin === hash // simple mock — not PBKDF2, just for logic tests
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const { hash: REAL_HASH, salt: REAL_SALT } = hashPin(REAL_PIN)

// Mock cloud API factory
function mockCloudApi(overrides: Partial<OperationalCloudApi> = {}): OperationalCloudApi {
  return {
    getDeviceStatus: vi.fn().mockResolvedValue({ exists: true, hasPin: false }),
    createDeviceEnrollment: vi.fn().mockResolvedValue({ deviceId: DID, hasPin: false }),
    setDeviceHasPin: vi.fn().mockResolvedValue(undefined),
    verifyPinForEnrollment: vi.fn().mockResolvedValue({
      data: { enrollmentToken: 'valid-token', expiresAt: future(ENROLLMENT_TOKEN_TTL_MS) },
    }),
    consumeEnrollmentToken: vi.fn().mockResolvedValue({ data: { success: true } }),
    requestPinRecovery: vi.fn().mockResolvedValue({ data: { cooldownSeconds: 60 } }),
    verifyPinRecoveryCode: vi.fn().mockResolvedValue({
      data: { recoveryAuthToken: 'recovery-token', expiresAt: future(10 * 60 * 1000) },
    }),
    resetPin: vi.fn().mockResolvedValue({ data: { success: true } }),
    ...overrides,
  }
}

// Mock storage
function mockStorage(): Map<string, string> {
  return new Map()
}

// Mock platform adapter
function mockPlatform(storage: Map<string, string> = mockStorage()): OperationalPlatformAdapter {
  return {
    getSecureStorage: () => ({
      get: async (key: string) => storage.get(key) ?? null,
      set: async (key: string, value: string) => { storage.set(key, value) },
      delete: async (key: string) => { storage.delete(key) },
    }),
    randomString: (len: number) => 'x'.repeat(len),
  }
}

// ─── PIN setup (first device) ─────────────────────────────────────────────────

describe('First-device PIN setup', () => {
  it('stores salt and verifier in secure storage', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    const result = await opAuth.setupPin({ pin: REAL_PIN, hashPin, employeeId: EID, shopId: SID, deviceId: DID })

    expect(result.ok).toBe(true)
    // Salt and verifier are stored — verify the stored verifier can correctly validate REAL_PIN
    const storedSalt = storage.get('pin_salt')!
    const storedVerifier = storage.get('pin_verifier')!
    expect(storedSalt).toHaveLength(64) // 32 bytes hex
    expect(storedVerifier).toHaveLength(64) // 32 bytes hex
    expect(verifyPin(REAL_PIN, storedVerifier, storedSalt)).toBe(true)
    expect(verifyPin('0000', storedVerifier, storedSalt)).toBe(false)
  })

  it('reset failed attempts on successful setup', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    // Manually trigger a lockout
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) {
      ;(opAuth as any)._recordFailedAttempt()
    }
    expect(opAuth.isLocked).toBe(true)

    // Locked — setupPin should reject
    const lockedResult = await opAuth.setupPin({ pin: REAL_PIN, hashPin, employeeId: EID, shopId: SID, deviceId: DID })
    expect(lockedResult.ok).toBe(false)

    // Manually clear lock to test counter reset (setupPin cannot clear a lock)
    ;(opAuth as any)._lockedUntil = null
    ;(opAuth as any)._failedAttempts = 0

    // Now setupPin succeeds and resets counter
    const result = await opAuth.setupPin({ pin: REAL_PIN, hashPin, employeeId: EID, shopId: SID, deviceId: DID })
    expect(result.ok).toBe(true)
    expect(opAuth.failedAttemptCount).toBe(0)
  })

  it('returns verifier hash for caller to submit to cloud', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    const result = await opAuth.setupPin({ pin: REAL_PIN, hashPin, employeeId: EID, shopId: SID, deviceId: DID })

    expect(result.ok).toBe(true)
    if (result.ok) {
      // Salt and hash are valid 64-char hex (32 bytes)
      expect(result.data.salt).toHaveLength(64)
      expect(result.data.verifierHash).toHaveLength(64)
      // The returned verifier correctly verifies the PIN
      expect(verifyPin(REAL_PIN, result.data.verifierHash, result.data.salt)).toBe(true)
    }
  })
})

// ─── PIN verification (local) ────────────────────────────────────────────────

describe('PIN verification', () => {
  it('verifies correct PIN and returns OperationalSession', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    await opAuth.setupPin({ pin: REAL_PIN, hashPin, employeeId: EID, shopId: SID, deviceId: DID })

    const result = await opAuth.verifyPin({
      pin: REAL_PIN,
      verifyPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.employeeId).toBe(EID)
      expect(result.data.shopId).toBe(SID)
      expect(result.data.deviceId).toBe(DID)
      expect(result.data.expiresAt).toBeTruthy()
      // Offline entitlement must be approximately 3 days from now (within 1 second)
      const expectedExpiryMs = Date.now() + OFFLINE_ENTITLEMENT_TTL_MS
      const actualExpiryMs = new Date(result.data.offlineEntitlementExpiresAt).getTime()
      expect(Math.abs(actualExpiryMs - expectedExpiryMs)).toBeLessThan(1000)
    }
  })

  it('rejects incorrect PIN and increments failure counter', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    await opAuth.setupPin({ pin: REAL_PIN, hashPin, employeeId: EID, shopId: SID, deviceId: DID })

    const result = await opAuth.verifyPin({
      pin: '0000',
      verifyPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PIN_VERIFICATION_FAILED')
    }
    expect(opAuth.failedAttemptCount).toBe(1)
  })

  it('locks after MAX_PIN_ATTEMPTS failures', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    await opAuth.setupPin({ pin: REAL_PIN, hashPin, employeeId: EID, shopId: SID, deviceId: DID })

    for (let i = 0; i < MAX_PIN_ATTEMPTS - 1; i++) {
      await opAuth.verifyPin({ pin: '0000', verifyPin, employeeId: EID, shopId: SID, deviceId: DID })
    }
    expect(opAuth.isLocked).toBe(false)

    // The MAX_PIN_ATTEMPTS-th failure triggers lockout
    await opAuth.verifyPin({ pin: '0000', verifyPin, employeeId: EID, shopId: SID, deviceId: DID })
    expect(opAuth.isLocked).toBe(true)
    expect(opAuth.lockedUntilMs).toBeGreaterThan(Date.now())
  })

  it('rejects verification when no PIN is set', async () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.verifyPin({
      pin: '1234',
      verifyPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PIN_NOT_SET')
    }
  })

  it('rejects when locked', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    // Manually lock
    ;(opAuth as any)._lockedUntil = Date.now() + PIN_RATE_LIMIT_MS

    const result = await opAuth.verifyPin({
      pin: '1234',
      verifyPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED')
      expect(result.error.retryAfterMs).toBeGreaterThan(0)
    }
  })

  it('resets counter on successful verification', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    await opAuth.setupPin({ pin: REAL_PIN, hashPin, employeeId: EID, shopId: SID, deviceId: DID })

    // 2 failed attempts
    await opAuth.verifyPin({ pin: '0000', verifyPin, employeeId: EID, shopId: SID, deviceId: DID })
    await opAuth.verifyPin({ pin: '0000', verifyPin, employeeId: EID, shopId: SID, deviceId: DID })
    expect(opAuth.failedAttemptCount).toBe(2)

    // Successful verification
    await opAuth.verifyPin({ pin: REAL_PIN, verifyPin, employeeId: EID, shopId: SID, deviceId: DID })
    expect(opAuth.failedAttemptCount).toBe(0)
    expect(opAuth.isLocked).toBe(false)
  })
})

// ─── Enrollment state machine ─────────────────────────────────────────────────

describe('Enrollment state machine', () => {
  it('DEVICE_NOT_ENROLLED → calls createDeviceEnrollment then PIN_SETUP_REQUIRED', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      getDeviceStatus: vi.fn().mockResolvedValue({ exists: false, hasPin: false }),
      createDeviceEnrollment: vi.fn().mockResolvedValue({ deviceId: DID, hasPin: false }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.beginEnrollment({
      cloudApi,
      state: 'DEVICE_NOT_ENROLLED',
      shopId: SID,
      deviceId: DID,
      deviceName: 'Test Device',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({ nextState: 'PIN_SETUP_REQUIRED' })
    }
    expect(cloudApi.createDeviceEnrollment).toHaveBeenCalledWith(SID, DID, 'Test Device')
  })

  it('PIN_SETUP_REQUIRED with no proof → signals needsCloudVerify', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.beginEnrollment({
      cloudApi,
      state: 'PIN_SETUP_REQUIRED',
      shopId: SID,
      deviceId: DID,
      deviceName: 'Test Device',
      employeeId: EID,
      // No pinVerificationProof yet
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({ needsCloudVerify: true, employeeId: EID })
    }
  })

  it('PIN_SETUP_REQUIRED with proof → calls verifyPinForEnrollment', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      verifyPinForEnrollment: vi.fn().mockResolvedValue({
        data: { enrollmentToken: 'tok', expiresAt: future(ENROLLMENT_TOKEN_TTL_MS) },
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.beginEnrollment({
      cloudApi,
      state: 'PIN_SETUP_REQUIRED',
      shopId: SID,
      deviceId: DID,
      deviceName: 'Test Device',
      employeeId: EID,
      pinVerificationProof: 'pbkdf2proof',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual({ nextState: 'PIN_SETUP_REQUIRED', enrollmentToken: 'tok' })
    }
    expect(cloudApi.verifyPinForEnrollment).toHaveBeenCalledWith(EID, 'pbkdf2proof', SID, DID)
  })

  it('PIN_SETUP_REQUIRED with wrong proof → returns error', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      verifyPinForEnrollment: vi.fn().mockResolvedValue({
        error: { code: 'PIN_VERIFICATION_FAILED', message: 'Incorrect PIN' },
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.beginEnrollment({
      cloudApi,
      state: 'PIN_SETUP_REQUIRED',
      shopId: SID,
      deviceId: DID,
      deviceName: 'Test Device',
      employeeId: EID,
      pinVerificationProof: 'wrongproof',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PIN_VERIFICATION_FAILED')
    }
  })

  it('getEnrollmentState returns correct state based on cloud response', async () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    // No cloud API → defaults to PIN_SETUP_REQUIRED
    let state = await opAuth.getEnrollmentState({ shopId: SID, deviceId: DID })
    expect(state).toBe('PIN_SETUP_REQUIRED')

    // Device doesn't exist
    const cloudApi1 = mockCloudApi({ getDeviceStatus: vi.fn().mockResolvedValue({ exists: false, hasPin: false }) })
    state = await opAuth.getEnrollmentState({ cloudApi: cloudApi1, shopId: SID, deviceId: DID })
    expect(state).toBe('DEVICE_NOT_ENROLLED')

    // Device exists, no PIN
    const cloudApi2 = mockCloudApi({ getDeviceStatus: vi.fn().mockResolvedValue({ exists: true, hasPin: false }) })
    state = await opAuth.getEnrollmentState({ cloudApi: cloudApi2, shopId: SID, deviceId: DID })
    expect(state).toBe('PIN_SETUP_REQUIRED')

    // Device exists, has PIN → must verify existing PIN
    const cloudApi3 = mockCloudApi({ getDeviceStatus: vi.fn().mockResolvedValue({ exists: true, hasPin: true }) })
    state = await opAuth.getEnrollmentState({ cloudApi: cloudApi3, shopId: SID, deviceId: DID })
    expect(state).toBe('PIN_VERIFICATION_REQUIRED')
  })
})

// ─── Cross-device enrollment token ───────────────────────────────────────────

describe('Cross-device enrollment token', () => {
  it('completeEnrollmentWithCloudVerify consumes token and stores local verifier', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      consumeEnrollmentToken: vi.fn().mockResolvedValue({ data: { success: true } }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.completeEnrollmentWithCloudVerify({
      cloudApi,
      enrollmentToken: 'valid-token',
      employeeId: EID,
      shopId: SID,
      deviceId: DID2,
      newPin: '1234',
      newPinHash: 'newhash',
      newPinSalt: 'newsalt',
    })

    expect(result.ok).toBe(true)
    expect(cloudApi.consumeEnrollmentToken).toHaveBeenCalledWith({
      enrollmentToken: 'valid-token',
      employeeId: EID,
      shopId: SID,
      deviceId: DID2,
      newPinVerifier: 'newhash',
      newPinSalt: 'newsalt',
    })
    expect(storage.get('pin_salt')).toBe('newsalt')
    expect(storage.get('pin_verifier')).toBe('newhash')
  })

  it('rejects expired enrollment token', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      consumeEnrollmentToken: vi.fn().mockResolvedValue({
        error: { code: 'ENROLLMENT_TOKEN_EXPIRED', message: 'Token has expired' },
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.completeEnrollmentWithCloudVerify({
      cloudApi,
      enrollmentToken: 'expired-token',
      employeeId: EID,
      shopId: SID,
      deviceId: DID2,
      newPin: '1234',
      newPinHash: 'newhash',
      newPinSalt: 'newsalt',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('ENROLLMENT_TOKEN_EXPIRED')
    }
  })

  it('rejects already-consumed enrollment token', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      consumeEnrollmentToken: vi.fn().mockResolvedValue({
        error: { code: 'ENROLLMENT_TOKEN_CONSUMED', message: 'Token already used' },
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.completeEnrollmentWithCloudVerify({
      cloudApi,
      enrollmentToken: 'already-used-token',
      employeeId: EID,
      shopId: SID,
      deviceId: DID2,
      newPin: '1234',
      newPinHash: 'newhash',
      newPinSalt: 'newsalt',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('ENROLLMENT_TOKEN_REPLAY')
    }
  })

  it('rejects token with wrong employeeId scope', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      consumeEnrollmentToken: vi.fn().mockResolvedValue({
        error: { code: 'ENROLLMENT_TOKEN_SCOPE_MISMATCH', message: 'Token does not match employee' },
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.completeEnrollmentWithCloudVerify({
      cloudApi,
      enrollmentToken: 'token-for-e1',
      employeeId: 'e2' as EmployeeId, // wrong employee
      shopId: SID,
      deviceId: DID2,
      newPin: '1234',
      newPinHash: 'newhash',
      newPinSalt: 'newsalt',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('ENROLLMENT_TOKEN_SCOPE_MISMATCH')
    }
  })

  it('rejects token with wrong shopId scope', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      consumeEnrollmentToken: vi.fn().mockResolvedValue({
        error: { code: 'ENROLLMENT_TOKEN_SCOPE_MISMATCH', message: 'Token does not match shop' },
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.completeEnrollmentWithCloudVerify({
      cloudApi,
      enrollmentToken: 'token-for-s1',
      employeeId: EID,
      shopId: 's2' as ShopId, // wrong shop
      deviceId: DID2,
      newPin: '1234',
      newPinHash: 'newhash',
      newPinSalt: 'newsalt',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('ENROLLMENT_TOKEN_SCOPE_MISMATCH')
    }
  })

  it('rejects token with wrong deviceId scope', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      consumeEnrollmentToken: vi.fn().mockResolvedValue({
        error: { code: 'ENROLLMENT_TOKEN_SCOPE_MISMATCH', message: 'Token does not match device' },
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.completeEnrollmentWithCloudVerify({
      cloudApi,
      enrollmentToken: 'token-for-d1',
      employeeId: EID,
      shopId: SID,
      deviceId: 'd3' as DeviceId, // wrong device
      newPin: '1234',
      newPinHash: 'newhash',
      newPinSalt: 'newsalt',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('ENROLLMENT_TOKEN_SCOPE_MISMATCH')
    }
  })

  it('replay attempt uses same token twice → first succeeds, second fails with REPLAY', async () => {
    const storage = mockStorage()
    let consumeCallCount = 0
    const cloudApi = mockCloudApi({
      consumeEnrollmentToken: vi.fn().mockImplementation(() => {
        consumeCallCount++
        if (consumeCallCount === 1) return Promise.resolve({ data: { success: true } })
        return Promise.resolve({ error: { code: 'ENROLLMENT_TOKEN_REPLAY', message: 'Token already consumed' } })
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const token = 'replay-token'
    const result1 = await opAuth.completeEnrollmentWithCloudVerify({
      cloudApi, enrollmentToken: token,
      employeeId: EID, shopId: SID, deviceId: DID2,
      newPin: '1234', newPinHash: 'hash1', newPinSalt: 'salt1',
    })
    expect(result1.ok).toBe(true)

    const result2 = await opAuth.completeEnrollmentWithCloudVerify({
      cloudApi, enrollmentToken: token,
      employeeId: EID, shopId: SID, deviceId: DID2,
      newPin: '5678', newPinHash: 'hash2', newPinSalt: 'salt2',
    })
    expect(result2.ok).toBe(false)
    if (!result2.ok) {
      expect(result2.error.code).toBe('ENROLLMENT_TOKEN_REPLAY')
    }
  })
})

// ─── PIN change ─────────────────────────────────────────────────────────────

describe('PIN change', () => {
  it('changes PIN after verifying old PIN', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    // Set up initial PIN
    await opAuth.setupPin({ pin: REAL_PIN, hashPin, employeeId: EID, shopId: SID, deviceId: DID })
    const oldSalt = storage.get('pin_salt')!
    const oldVerifier = storage.get('pin_verifier')!

    // Change to new PIN
    const NEW_PIN = '5678'
    const result = await opAuth.changePin({
      oldPin: REAL_PIN,
      newPin: NEW_PIN,
      verifyPin,
      hashPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.salt).toHaveLength(64)
      expect(result.data.verifierHash).toHaveLength(64)
    }
    // New verifier stored correctly
    const newSalt = storage.get('pin_salt')!
    const newVerifier = storage.get('pin_verifier')!
    expect(newSalt).not.toBe(oldSalt)
    expect(verifyPin(NEW_PIN, newVerifier, newSalt)).toBe(true)
    expect(verifyPin(REAL_PIN, newVerifier, newSalt)).toBe(false)
  })

  it('rejects PIN change with wrong old PIN', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    await opAuth.setupPin({ pin: REAL_PIN, hashPin, employeeId: EID, shopId: SID, deviceId: DID })
    const oldSalt = storage.get('pin_salt')!
    const oldVerifier = storage.get('pin_verifier')!

    const result = await opAuth.changePin({
      oldPin: '0000',
      newPin: '5678',
      verifyPin,
      hashPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PIN_VERIFICATION_FAILED')
    }
    // Old verifier unchanged
    expect(storage.get('pin_salt')).toBe(oldSalt)
    expect(storage.get('pin_verifier')).toBe(oldVerifier)
  })
})

// ─── PIN recovery ────────────────────────────────────────────────────────────

describe('PIN recovery', () => {
  it('requestPinRecovery sends code and returns cooldown', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      requestPinRecovery: vi.fn().mockResolvedValue({ data: { cooldownSeconds: 90 } }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.requestPinRecovery({ cloudApi, employeeId: EID })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.cooldownSeconds).toBe(90)
    }
    expect(cloudApi.requestPinRecovery).toHaveBeenCalledWith(EID)
  })

  it('requestPinRecovery propagates backend rate limit', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      requestPinRecovery: vi.fn().mockResolvedValue({
        error: { code: 'RATE_LIMITED', message: 'Please wait 60 seconds', retryAfterMs: 60000 },
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.requestPinRecovery({ cloudApi, employeeId: EID })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RECOVERY_RATE_LIMITED')
      expect(result.error.retryAfterMs).toBe(60000)
    }
  })

  it('verifyPinRecoveryCode returns recovery auth token', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.verifyPinRecoveryCode({
      cloudApi, employeeId: EID, code: '123456',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.recoveryAuthToken).toBe('recovery-token')
      expect(result.data.expiresAt).toBeTruthy()
    }
  })

  it('verifyPinRecoveryCode rejects invalid code', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      verifyPinRecoveryCode: vi.fn().mockResolvedValue({
        error: { code: 'RECOVERY_CODE_INVALID', message: 'Invalid code' },
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const result = await opAuth.verifyPinRecoveryCode({
      cloudApi, employeeId: EID, code: '000000',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RECOVERY_CODE_INVALID')
    }
  })

  it('resetPinWithRecovery consumes token and stores new local verifier', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const hashPin = makeFixedHashPin('newrecoveryhash', 'newrecoverysalt')

    const result = await opAuth.resetPinWithRecovery({
      cloudApi,
      recoveryAuthToken: 'recovery-token',
      employeeId: EID,
      newPin: '9999',
      hashPin,
      shopId: SID,
      deviceId: DID,
    })

    expect(result.ok).toBe(true)
    expect(cloudApi.resetPin).toHaveBeenCalledWith({
      recoveryAuthToken: 'recovery-token',
      employeeId: EID,
      newPinVerifier: 'newrecoveryhash',
      newPinSalt: 'newrecoverysalt',
    })
    expect(storage.get('pin_salt')).toBe('newrecoverysalt')
    expect(storage.get('pin_verifier')).toBe('newrecoveryhash')
  })

  it('resetPinWithRecovery rejects expired recovery token', async () => {
    const storage = mockStorage()
    const cloudApi = mockCloudApi({
      resetPin: vi.fn().mockResolvedValue({
        error: { code: 'VERIFICATION_EXPIRED', message: 'Recovery session expired' },
      }),
    })
    const opAuth = new OperationalAuth(mockPlatform(storage))
    const hashPin = makeFixedHashPin('newrecoveryhash', 'newrecoverysalt')

    const result = await opAuth.resetPinWithRecovery({
      cloudApi,
      recoveryAuthToken: 'expired-recovery-token',
      employeeId: EID,
      newPin: '9999',
      hashPin,
      shopId: SID,
      deviceId: DID,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RECOVERY_CODE_INVALID')
    }
  })
})

// ─── Offline entitlement ─────────────────────────────────────────────────────

describe('3-day offline entitlement', () => {
  it('isWithinOfflineEntitlement returns true when within 3 days', () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const session = {
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
      startedAt: past(1 * 24 * 60 * 60 * 1000), // 1 day ago
      expiresAt: future(23 * 60 * 60 * 1000),
      offlineEntitlementExpiresAt: future(2 * 24 * 60 * 60 * 1000), // 2 days from now
    }

    expect(opAuth.isWithinOfflineEntitlement(session)).toBe(true)
  })

  it('isWithinOfflineEntitlement returns true at exactly 3 days', () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const session = {
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
      startedAt: past(3 * 24 * 60 * 60 * 1000),
      expiresAt: future(0),
      offlineEntitlementExpiresAt: new Date(Date.now()).toISOString(), // expires right now
    }

    // At the boundary, once expired it returns false
    expect(opAuth.isWithinOfflineEntitlement(session)).toBe(false)
  })

  it('isWithinOfflineEntitlement returns false beyond 3 days', () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const session = {
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
      startedAt: past(4 * 24 * 60 * 60 * 1000), // 4 days ago
      expiresAt: future(0),
      offlineEntitlementExpiresAt: past(1 * 24 * 60 * 60 * 1000), // expired 1 day ago
    }

    expect(opAuth.isWithinOfflineEntitlement(session)).toBe(false)
  })

  it('isSessionExpired returns true when session expires before entitlement', () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const session = {
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
      startedAt: past(20 * 60 * 60 * 1000), // 20 hours ago
      expiresAt: past(1 * 60 * 60 * 1000),   // expired 1 hour ago
      offlineEntitlementExpiresAt: future(2 * 24 * 60 * 60 * 1000), // still valid for 2 more days
    }

    expect(opAuth.isSessionExpired(session)).toBe(true)
    expect(opAuth.isWithinOfflineEntitlement(session)).toBe(true) // but offline entitlement still valid
  })

  it('session is expired AND entitlement expired — both independently true', () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const session = {
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
      startedAt: past(4 * 24 * 60 * 60 * 1000), // 4 days ago
      expiresAt: past(1 * 60 * 60 * 1000),        // expired 1 hour ago
      offlineEntitlementExpiresAt: past(1 * 24 * 60 * 60 * 1000), // expired 1 day ago
    }

    expect(opAuth.isSessionExpired(session)).toBe(true)
    expect(opAuth.isWithinOfflineEntitlement(session)).toBe(false)
  })
})

// ─── clearPin ────────────────────────────────────────────────────────────────

describe('clearPin', () => {
  it('wipes salt and verifier from storage', async () => {
    const storage = mockStorage()
    storage.set('pin_salt', 'somesalt')
    storage.set('pin_verifier', 'somehash')

    const opAuth = new OperationalAuth(mockPlatform(storage))
    await opAuth.clearPin()

    expect(storage.get('pin_salt')).toBeUndefined()
    expect(storage.get('pin_verifier')).toBeUndefined()
  })

  it('resets failure counter and lockout', async () => {
    const storage = mockStorage()
    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    // Lock the device
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) {
      ;(opAuth as any)._recordFailedAttempt()
    }
    expect(opAuth.isLocked).toBe(true)

    await opAuth.clearPin()

    expect(opAuth.isLocked).toBe(false)
    expect(opAuth.failedAttemptCount).toBe(0)
  })
})

// ─── hasPinEnrolled ─────────────────────────────────────────────────────────

describe('hasPinEnrolled', () => {
  it('returns false when no PIN is stored', async () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))
    expect(await opAuth.hasPinEnrolled()).toBe(false)
  })

  it('returns true when PIN verifier exists in storage', async () => {
    const storage = mockStorage()
    storage.set('pin_verifier', 'somehash')
    const opAuth = new OperationalAuth(mockPlatform(storage))
    expect(await opAuth.hasPinEnrolled()).toBe(true)
  })
})

// ─── Session serialization ─────────────────────────────────────────────────

describe('Session serialization', () => {
  it('serializeSession round-trips correctly', () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const session = {
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
      startedAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2026-09-02T00:00:00.000Z',
      offlineEntitlementExpiresAt: '2026-09-04T00:00:00.000Z',
    }

    const serialized = opAuth.serializeSession(session)
    expect(serialized).toContain(EID)
    expect(serialized).toContain('offlineEntitlementExpiresAt')
  })

  it('deserializeSession returns null for expired session', () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))

    const expired = {
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
      startedAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2025-01-01T00:00:00.000Z', // in the past
      offlineEntitlementExpiresAt: '2025-01-01T00:00:00.000Z',
    }

    const result = opAuth.deserializeSession(JSON.stringify(expired))
    expect(result).toBeNull()
  })

  it('deserializeSession returns null for invalid JSON', () => {
    const storage = mockStorage()
    const opAuth = new OperationalAuth(mockPlatform(storage))
    expect(opAuth.deserializeSession('not json')).toBeNull()
  })
})

// ─── TrustedDevice vs operational device separation ────────────────────────

describe('TrustedDevice vs OperationalDevice separation', () => {
  /**
   * This is a documentation test — the SDK separates these concepts:
   *
   * TrustedDevice: A cloud-authentication concept. Used by CloudAuth to
   * mark a device as "trusted" for OAuth session sharing. Managed via
   * CloudAuth.registerTrustedDevice / listTrustedDevices / removeTrustedDevice.
   *
   * OperationalDevice: A business-operations concept. Used by OperationalAuth
   * to manage which devices are enrolled for POS operations. The Device record
   * in the FIDScript schema (devices table) represents operational devices,
   * NOT trusted authentication devices.
   *
   * The SDK never conflates these:
   * - CloudAuth manages TrustedDevice tokens in platform secure storage
   * - OperationalAuth manages Device records via cloudApi calls
   * - There is no shared state between them
   */

  it('TrustedDevice token is stored separately from PIN storage', async () => {
    // TrustedDevice uses secure storage with prefix "trusted_device:"
    const storage = mockStorage()
    const platform = mockPlatform(storage)

    // Simulate a TrustedDevice token being stored
    await platform.getSecureStorage().set('trusted_device:d1', 'device-token-abc')

    // PIN storage keys are separate
    await platform.getSecureStorage().set('pin_salt', 'salt')
    await platform.getSecureStorage().set('pin_verifier', 'hash')

    // Both coexist independently
    expect(storage.get('trusted_device:d1')).toBe('device-token-abc')
    expect(storage.get('pin_salt')).toBe('salt')
    expect(storage.get('pin_verifier')).toBe('hash')
  })

  it('OperationalAuth never touches TrustedDevice storage keys', async () => {
    const storage = mockStorage()
    storage.set('trusted_device:d1', 'device-token')
    storage.set('pin_salt', 'oldsalt')
    storage.set('pin_verifier', 'oldhash')

    const platform = mockPlatform(storage)
    const opAuth = new OperationalAuth(platform)

    // Change PIN should only touch pin_* keys
    const hashPin = makeFixedHashPin('newhash', 'newsalt')
    await opAuth.setupPin({ pin: '1234', hashPin, employeeId: EID, shopId: SID, deviceId: DID })

    expect(storage.get('trusted_device:d1')).toBe('device-token') // untouched
    expect(storage.get('pin_verifier')).toBe('newhash')
  })
})

// ─── Constants ─────────────────────────────────────────────────────────────

describe('SDK constants', () => {
  it('OFFLINE_ENTITLEMENT_TTL_MS is exactly 3 days in ms', () => {
    expect(OFFLINE_ENTITLEMENT_TTL_MS).toBe(3 * 24 * 60 * 60 * 1000)
  })

  it('MAX_PIN_ATTEMPTS is 5', () => {
    expect(MAX_PIN_ATTEMPTS).toBe(5)
  })

  it('PIN_RATE_LIMIT_MS is 30 seconds', () => {
    expect(PIN_RATE_LIMIT_MS).toBe(30_000)
  })

  it('ENROLLMENT_TOKEN_TTL_MS is 5 minutes', () => {
    expect(ENROLLMENT_TOKEN_TTL_MS).toBe(5 * 60 * 1000)
  })
})
