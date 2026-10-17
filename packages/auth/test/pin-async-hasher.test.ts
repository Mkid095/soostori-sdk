/**
 * @soostori/auth — async `hashPin` regression.
 *
 * WHY THIS FILE EXISTS
 * setupPin() typed `hashPin` as returning `{ hash, salt }` SYNCHRONOUSLY and
 * then destructured the result directly:
 *
 *   const { hash: verifierHash, salt } = hashPin(pin)
 *
 * React Native cannot supply a synchronous hasher: PBKDF2 there is WebCrypto's
 * deriveBits, which is always Promise-based. So the mobile app passed an async
 * function, the destructure read `undefined` for both fields, and those
 * undefined values were written to secure storage:
 *
 *   setupPin       -> { ok: true }          ← reported success
 *   stored         -> pin_salt: undefined, pin_verifier: undefined
 *   hasPinEnrolled -> false
 *   verifyPin      -> PIN_NOT_SET "No PIN has been set on this device"
 *
 * A PIN could be "set" forever and never verified. Node/desktop used the
 * synchronous pin-node implementation, so the bug was invisible there and only
 * ever bit React Native.
 *
 * verifyPin already accepted `boolean | Promise<boolean>`; the hash side now
 * accepts a Promise too, and every call site awaits it.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { OperationalAuth, PIN_SALT_KEY, PIN_VERIFIER_KEY } from '../src/operational-auth.js'
import type { OperationalPlatformAdapter } from '../src/operational-auth.js'
import type { EmployeeId, ShopId, DeviceId } from '@soostori/core'
import { hashPin, verifyPin } from '../src/pin-node.js'

const EID = 'e1' as EmployeeId
const SID = 's1' as ShopId
const DID = 'd1' as DeviceId
const PIN = '1234'

/** In-memory stand-in for Keychain / Keystore, so we can read back the bytes. */
function makeStorage() {
  const store = new Map<string, string>()
  return {
    store,
    platform: {
      getSecureStorage: () => ({
        get: (k: string) => store.get(k) ?? null,
        set: (k: string, v: string) => { store.set(k, v) },
        delete: (k: string) => { store.delete(k) },
      }),
      randomString: (n: number) => 'r'.repeat(n),
    } as unknown as OperationalPlatformAdapter,
  }
}

/** A hashPin with the exact signature React Native has to use: async. */
async function asyncHashPin(pin: string, salt?: string) {
  return hashPin(pin, salt)
}

describe('setupPin with an async hasher (React Native)', () => {
  let harness: ReturnType<typeof makeStorage>

  beforeEach(() => {
    harness = makeStorage()
  })

  it('stores a real salt and verifier, not undefined', async () => {
    const op = new OperationalAuth(harness.platform)

    const result = await op.setupPin({
      pin: PIN,
      hashPin: asyncHashPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })

    expect(result.ok).toBe(true)
    const salt = harness.store.get(PIN_SALT_KEY)
    const verifier = harness.store.get(PIN_VERIFIER_KEY)
    expect(salt).toBeTruthy()
    expect(verifier).toBeTruthy()
    expect(salt).not.toBe('undefined')
    expect(verifier).not.toBe('undefined')
  })

  it('reports the device as having an enrolled PIN afterwards', async () => {
    const op = new OperationalAuth(harness.platform)
    await op.setupPin({ pin: PIN, hashPin: asyncHashPin, employeeId: EID, shopId: SID, deviceId: DID })

    // This is what the app's PIN gate asks. It answered false forever while the
    // async destructure bug was live, which routed every user to PIN setup.
    expect(await op.hasPinEnrolled()).toBe(true)
  })

  it('then verifies the PIN that was just set', async () => {
    const op = new OperationalAuth(harness.platform)
    await op.setupPin({ pin: PIN, hashPin: asyncHashPin, employeeId: EID, shopId: SID, deviceId: DID })

    const verified = await op.verifyPin({
      pin: PIN,
      verifyPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })

    // Was PIN_NOT_SET on every attempt.
    expect(verified.ok).toBe(true)
  })

  it('still rejects a wrong PIN', async () => {
    const op = new OperationalAuth(harness.platform)
    await op.setupPin({ pin: PIN, hashPin: asyncHashPin, employeeId: EID, shopId: SID, deviceId: DID })

    const wrong = await op.verifyPin({
      pin: '9999',
      verifyPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })
    expect(wrong.ok).toBe(false)
  })

  it('keeps working for a synchronous hasher', async () => {
    // Desktop/Node still passes the sync pin-node implementation. Widening the
    // type must not have broken it.
    const op = new OperationalAuth(harness.platform)
    await op.setupPin({
      pin: PIN,
      hashPin: (pin: string, salt?: string) => hashPin(pin, salt),
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })
    expect(await op.hasPinEnrolled()).toBe(true)
  })
})

describe('resetPinWithRecovery with an async hasher', () => {
  // The third and last site that derived a hash synchronously. It is reachable
  // from a support-driven PIN reset, and it writes BOTH the local verifier and
  // the value sent to the cloud — so an undefined here would have wiped the
  // device's verifier and told the cloud the new PIN proof was "undefined".
  it('stores a real verifier locally and sends a real one to the cloud', async () => {
    const harness = makeStorage()
    const op = new OperationalAuth(harness.platform)

    let sent: { newPinVerifier?: unknown; newPinSalt?: unknown } = {}
    const cloudApi = {
      resetPin: async (args: { newPinVerifier?: unknown; newPinSalt?: unknown }) => {
        sent = args
        return {} // no error => success
      },
    } as unknown as Parameters<OperationalAuth['resetPinWithRecovery']>[0]['cloudApi']

    const result = await op.resetPinWithRecovery({
      cloudApi,
      recoveryAuthToken: 'token-123',
      employeeId: EID,
      newPin: '4321',
      hashPin: asyncHashPin,
      shopId: SID,
      deviceId: DID,
    })

    expect(result.ok).toBe(true)
    expect(harness.store.get(PIN_VERIFIER_KEY)).toBeTruthy()
    expect(harness.store.get(PIN_SALT_KEY)).toBeTruthy()
    expect(sent.newPinVerifier).toBeTruthy()
    expect(sent.newPinSalt).toBeTruthy()
  })
})

describe('changePin with an async hasher', () => {
  // changePin delegates to setupPin, so this is the same code path reached
  // through a second public entry point — worth its own assertion because a
  // fix applied only to one caller would leave the other broken.
  it('stores a real verifier for the new PIN', async () => {
    const harness = makeStorage()
    const op = new OperationalAuth(harness.platform)

    await op.setupPin({ pin: PIN, hashPin: asyncHashPin, employeeId: EID, shopId: SID, deviceId: DID })
    const before = harness.store.get(PIN_VERIFIER_KEY)

    const changed = await op.changePin({
      oldPin: PIN,
      newPin: '5678',
      verifyPin,
      hashPin: asyncHashPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })

    expect(changed.ok).toBe(true)
    expect(harness.store.get(PIN_VERIFIER_KEY)).toBeTruthy()
    expect(harness.store.get(PIN_VERIFIER_KEY)).not.toBe(before)

    const withNew = await op.verifyPin({
      pin: '5678',
      verifyPin,
      employeeId: EID,
      shopId: SID,
      deviceId: DID,
    })
    expect(withNew.ok).toBe(true)
  })
})