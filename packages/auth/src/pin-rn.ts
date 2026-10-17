/**
 * PIN hashing — React Native / browser stub.
 *
 * This file is the react-native entry point for @soostori/auth.
 * It throws immediately to prevent silent misuse of a no-op hash.
 *
 * PIN operations are NOT part of the cross-platform @soostori/auth contract.
 * Platform implementations must provide their own PBKDF2-compatible hashing.
 *
 * For Node.js / Desktop: use `@soostori/auth/pin-node`
 *   import { hashPin, verifyPin } from '@soostori/auth/pin-node'
 *
 * For React Native: use a PBKDF2-compatible crypto library
 * (e.g. react-native-quick-crypto) and implement hashPin/verifyPin locally.
 *
 * IMPORTANT: Do NOT replace this with a JavaScript-only hash such as a
 * plain SHA-256. PINs require PBKDF2 with adequate iterations to resist
 * brute-force attacks against local credential theft.
 */

/**
 * Everything except the PIN functions is re-exported from the package entry.
 *
 * This file is what the "react-native" export condition resolves to, so it IS
 * the package as far as a phone is concerned. It previously exported only the
 * two PIN stubs, which meant every other named import from '@soostori/auth'
 * was undefined on device — most visibly `hasPermission`/`checkPermission`
 * from permissions.ts, used by the mobile RBAC bridge. A missing named export
 * is a hard load failure in a release bundle and a silent undefined in dev.
 *
 * The two local PIN declarations below shadow index's, which is the point:
 * they throw loudly rather than silently returning a wrong hash.
 */
export * from './index.js'

export function hashPin(_pin: string, _saltHex?: string): { hash: string; salt: string } {
  throw new Error(
    '@soostori/auth: PIN operations require a platform-specific implementation.\n' +
    'On Desktop/Node, import from "@soostori/auth/pin-node".\n' +
    'For React Native, implement hashPin/verifyPin using react-native-quick-crypto\n' +
    'or a PBKDF2-compatible library.\n' +
    'See: https://docs.soostori.com/sdk/auth/pin',
  )
}

export function verifyPin(_pin: string, _hashHex: string, _saltHex: string): boolean {
  throw new Error(
    '@soostori/auth: PIN operations require a platform-specific implementation.\n' +
    'On Desktop/Node, import from "@soostori/auth/pin-node".\n' +
    'For React Native, implement hashPin/verifyPin using react-native-quick-crypto\n' +
    'or a PBKDF2-compatible library.\n' +
    'See: https://docs.soostori.com/sdk/auth/pin',
  )
}
