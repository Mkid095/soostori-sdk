/**
 * Tuma callback HMAC verification.
 *
 * Tuma signs webhook payloads using HMAC-SHA256. The signature is transmitted
 * in the `X-Tuma-Signature` request header as a hex-encoded string.
 *
 * Security requirements:
 *   - Timing-safe comparison (prevents timing attacks)
 *   - Reject missing signatures when required
 *   - Reject invalid signatures
 *   - No secrets in log output
 */

import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Environment/config key for the Tuma webhook signing secret.
 * Set TUMA_WEBHOOK_SECRET in your environment.
 */
export const TUMA_WEBHOOK_SECRET_ENV = 'TUMA_WEBHOOK_SECRET'

/**
 * Header name Tuma uses to transmit the HMAC signature.
 */
export const TUMA_SIGNATURE_HEADER = 'x-tuma-signature'

/**
 * Error thrown when callback signature verification fails.
 */
export class TumaSignatureError extends Error {
  readonly code = 'TUMA_SIGNATURE_INVALID'
  constructor(reason: string) {
    super(`Tuma callback signature verification failed: ${reason}`)
    this.name = 'TumaSignatureError'
  }
}

/**
 * Verify a Tuma webhook callback HMAC signature.
 *
 * @param rawBody   - Raw request body as a string (exactly as received, before JSON.parse)
 * @param signature - Value of the X-Tuma-Signature header (hex-encoded HMAC-SHA256)
 * @param secret    - The shared signing secret (from TUMA_WEBHOOK_SECRET env var)
 * @returns true if signature is valid
 * @throws TumaSignatureError if signature is missing (when required) or invalid
 */
export function verifyTumaSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret) {
    throw new TumaSignatureError('Webhook secret is not configured')
  }

  if (!signature) {
    throw new TumaSignatureError('Signature header is missing')
  }

  if (!rawBody || rawBody.trim() === '') {
    throw new TumaSignatureError('Callback body is empty or malformed')
  }

  const expected = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')

  // timing-safe comparison prevents timing attacks
  const sigBuf = Buffer.from(signature.toLowerCase(), 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')

  if (sigBuf.length !== expectedBuf.length) {
    throw new TumaSignatureError('Signature is invalid (length mismatch)')
  }

  if (!timingSafeEqual(sigBuf, expectedBuf)) {
    throw new TumaSignatureError('Signature is invalid')
  }

  return true
}

/**
 * Extract the signature from request headers.
 * Header lookup is case-insensitive.
 */
export function getSignatureFromHeaders(headers: Record<string, string | undefined | string[]>, headerName = TUMA_SIGNATURE_HEADER): string | undefined {
  const key = Object.keys(headers).find(k => k.toLowerCase() === headerName.toLowerCase())
  if (!key) return undefined
  const val = headers[key]
  if (Array.isArray(val)) return val[0] ?? undefined
  if (typeof val === 'string' && val.trim() === '') return undefined
  return val
}
