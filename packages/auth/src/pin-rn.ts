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
