/**
 * AES-256-GCM encryption for the LAN wire protocol.
 *
 * Key exchange is deferred - see KEY_EXCHANGE_NOTE below.
 *
 * On Desktop (Node.js): uses the built-in crypto module.
 * On Mobile: replace with react-native-quick-crypto using the same
 * AES-256-GCM interface (iv/ciphertext/tag layout is identical).
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const TAG_LENGTH = 16

/**
 * 256-bit pre-shared key. In production this must be established during
 * device authorization - e.g. derived from the shop pairing handshake
 * via HKDF, or provisioned securely when the device is first approved.
 *
 * KEY_EXCHANGE_NOTE:
 *   The key exchange / key provisioning problem is out of scope for this
 *   transport-layer encryption fix. A future iteration should:
 *   1. Use the existing REGISTER_PAIRING handshake to derive a shared secret
 *      (e.g. ECDH via libsodium_box or a simple Diffie-Hellman), OR
 *   2. Provision the key via the cloud backend when the device is approved
 *      (the devices/approve API already exists - it can include the key).
 *
 *   For now, pass the key via config / environment. 32 bytes, base64-encoded.
 */
export type LanKey = Buffer

/**
 * Encrypted payload envelope - replaces plaintext JSON on the wire.
 */
export interface EncryptedFrame {
  iv: string
  data: string
}

export function encrypt(plaintext: string, key: LanKey): EncryptedFrame {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  const chunks = []
  chunks.push(cipher.update(plaintext, "utf8"))
  chunks.push(cipher.final())
  const tag = cipher.getAuthTag()
  const ciphertext = Buffer.concat([...chunks, tag])
  return {
    iv: iv.toString("base64url"),
    data: ciphertext.toString("base64url"),
  }
}

export function decrypt(envelope: EncryptedFrame, key: LanKey): string {
  const iv = Buffer.from(envelope.iv, "base64url")
  const ciphertextWithTag = Buffer.from(envelope.data, "base64url")
  const tag = ciphertextWithTag.subarray(-TAG_LENGTH)
  const ciphertext = ciphertextWithTag.subarray(0, -TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(tag)
  const chunks = []
  chunks.push(decipher.update(ciphertext))
  chunks.push(decipher.final())
  return Buffer.concat(chunks).toString("utf8")
}