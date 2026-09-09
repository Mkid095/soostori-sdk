/**
 * PIN hashing — platform stub.
 *
 * This file is a no-op shim for React Native / browser environments.
 * It exists to prevent Metro from failing when it resolves this module.
 *
 * PIN operations are NOT part of the @soostori/auth cross-platform contract.
 * Platform implementations must provide their own PBKDF2-compatible hashing.
 *
 * For Node.js / Desktop: use `@soostori/auth/pin-node`
 *   import { hashPin, verifyPin } from '@soostori/auth/pin-node'
 *
 * IMPORTANT: PIN security semantics are NOT implemented here.
 * Do NOT replace this stub with a JavaScript-only hash — that would weaken
 * PIN security. The platform must provide a PBKDF2-compatible implementation.
 */

export function hashPin(_pin: string, _saltHex?: string): { hash: string; salt: string } {
  throw new Error(
    '@soostori/auth: PIN operations require a platform-specific implementation.\n' +
    'On Desktop/Node, install the SDK and import from "@soostori/auth/pin-node".\n' +
    'For React Native, use a PBKDF2-compatible crypto library such as\n' +
    'react-native-quick-crypto and implement hashPin/verifyPin locally.',
  )
}

export function verifyPin(_pin: string, _hashHex: string, _saltHex: string): boolean {
  throw new Error(
    '@soostori/auth: PIN operations require a platform-specific implementation.\n' +
    'On Desktop/Node, install the SDK and import from "@soostori/auth/pin-node".\n' +
    'For React Native, use a PBKDF2-compatible crypto library such as\n' +
    'react-native-quick-crypto and implement hashPin/verifyPin locally.',
  )
}
