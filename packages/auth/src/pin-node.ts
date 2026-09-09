/**
 * Local PIN hashing — Node.js `crypto` implementation.
 *
 * Desktop/Node consumers: import directly via `@soostori/auth/pin-node`
 * or via the workspace `@soostori/auth/pin` subpath when configured.
 *
 * PIN is a LOCAL credential only. It unlocks an already-authorized employee.
 * It NEVER becomes the cloud identity.
 */

import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto'
import { PIN_PBKDF2_ITERATIONS, EMPLOYEE_PIN_LENGTH } from '@soostori/core'

const KEY_LENGTH = 32
const DIGEST = 'sha256'
/**
 * Salt length: 32 bytes (256 bits) — generated via crypto.randomBytes.
 * This matches the canonical PBKDF2 spec in operational-auth.ts.
 */
const SALT_LENGTH = 32

export function hashPin(pin: string, saltHex?: string): { hash: string; salt: string } {
  if (pin.length !== EMPLOYEE_PIN_LENGTH) {
    throw new Error(`PIN must be ${EMPLOYEE_PIN_LENGTH} digits`)
  }
  const salt = saltHex ?? randomBytes(SALT_LENGTH).toString('hex')
  const hash = pbkdf2Sync(pin, salt, PIN_PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST).toString('hex')
  return { hash, salt }
}

export function verifyPin(pin: string, hashHex: string, saltHex: string): boolean {
  if (pin.length !== EMPLOYEE_PIN_LENGTH) return false
  const computed = pbkdf2Sync(pin, saltHex, PIN_PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST)
  const expected = Buffer.from(hashHex, 'hex')
  if (computed.length !== expected.length) return false
  return timingSafeEqual(computed, expected)
}
