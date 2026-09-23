/**
 * HMAC signature verification tests for Tuma callbacks.
 *
 * Run: pnpm vitest run packages/tuma/test/hmac.test.ts
 *
 * Covers:
 * - valid signature → accepted
 * - invalid signature → rejected with TumaSignatureError
 * - missing signature → rejected with TumaSignatureError
 * - malformed payload → rejected
 * - equivalent valid payload → different signature
 * - timing-safe comparison (implicit via crypto)
 * - missing webhook secret → rejected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'
import {
  verifyTumaSignature,
  getSignatureFromHeaders,
  TumaSignatureError,
  TUMA_SIGNATURE_HEADER,
  TUMA_WEBHOOK_SECRET_ENV,
} from '../src/verify.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

const VALID_BODY = JSON.stringify({
  status: 'completed',
  result_code: 0,
  result_desc: 'The request was successful.',
  merchant_request_id: 'MERCH-001',
  checkout_request_id: 'CHECK-001',
  mpesa_receipt_number: 'MPXX123456789',
  amount: 500,
  timestamp: '2026-02-23 14:27:46',
})

const VALID_SECRET = 'test-webhook-secret-abc123'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('verifyTumaSignature', () => {

  it('accepts a valid HMAC-SHA256 hex signature', () => {
    const sig = makeHmac(VALID_BODY, VALID_SECRET)
    expect(verifyTumaSignature(VALID_BODY, sig, VALID_SECRET)).toBe(true)
  })

  it('rejects an invalid signature', () => {
    const wrongSig = makeHmac(VALID_BODY, 'wrong-secret')
    expect(() => verifyTumaSignature(VALID_BODY, wrongSig, VALID_SECRET))
      .toThrow(TumaSignatureError)
    expect(() => verifyTumaSignature(VALID_BODY, wrongSig, VALID_SECRET))
      .toThrow(/invalid/i)
  })

  it('rejects a missing signature (empty string)', () => {
    expect(() => verifyTumaSignature(VALID_BODY, '', VALID_SECRET))
      .toThrow(TumaSignatureError)
    expect(() => verifyTumaSignature(VALID_BODY, '', VALID_SECRET))
      .toThrow(/missing/i)
  })

  it('rejects a missing signature (undefined)', () => {
    expect(() => verifyTumaSignature(VALID_BODY, undefined as unknown as string, VALID_SECRET))
      .toThrow(TumaSignatureError)
    expect(() => verifyTumaSignature(VALID_BODY, undefined as unknown as string, VALID_SECRET))
      .toThrow(/missing/i)
  })

  it('rejects when webhook secret is not configured', () => {
    expect(() => verifyTumaSignature(VALID_BODY, 'any-sig', ''))
      .toThrow(TumaSignatureError)
    expect(() => verifyTumaSignature(VALID_BODY, 'any-sig', ''))
      .toThrow(/not configured/i)
  })

  it('rejects a malformed payload (empty string)', () => {
    const sig = makeHmac('', VALID_SECRET)
    expect(() => verifyTumaSignature('', sig, VALID_SECRET))
      .toThrow(TumaSignatureError)
    expect(() => verifyTumaSignature('', sig, VALID_SECRET))
      .toThrow(/empty|malformed/i)
  })

  it('rejects an equivalent valid payload with a different body', () => {
    // Same structure, different amount → different signature
    const differentBody = JSON.stringify({
      status: 'completed',
      result_code: 0,
      result_desc: 'The request was successful.',
      merchant_request_id: 'MERCH-001',
      checkout_request_id: 'CHECK-001',
      mpesa_receipt_number: 'MPXX123456789',
      amount: 999,   // <-- different
      timestamp: '2026-02-23 14:27:46',
    })
    // Signature computed for original body
    const sig = makeHmac(VALID_BODY, VALID_SECRET)
    // Must reject because body doesn't match signature
    expect(() => verifyTumaSignature(differentBody, sig, VALID_SECRET))
      .toThrow(TumaSignatureError)
  })

  it('rejects a signature with wrong length (hex padding attack)', () => {
    // A signature with the wrong length should fail timing-safe comparison
    const shortSig = 'a'.repeat(63) // 63 chars = 252 bits (wrong length for SHA256 = 64 hex chars = 256 bits)
    expect(() => verifyTumaSignature(VALID_BODY, shortSig, VALID_SECRET))
      .toThrow(TumaSignatureError)
    expect(() => verifyTumaSignature(VALID_BODY, shortSig, VALID_SECRET))
      .toThrow(/length mismatch/i)
  })

  it('rejects a completely fabricated signature', () => {
    const fakeSig = '0'.repeat(64) // 64 hex chars but wrong value
    expect(() => verifyTumaSignature(VALID_BODY, fakeSig, VALID_SECRET))
      .toThrow(TumaSignatureError)
    expect(() => verifyTumaSignature(VALID_BODY, fakeSig, VALID_SECRET))
      .toThrow(/invalid/i)
  })

  it('is case-insensitive for hex signature', () => {
    const sig = makeHmac(VALID_BODY, VALID_SECRET).toUpperCase()
    expect(verifyTumaSignature(VALID_BODY, sig, VALID_SECRET)).toBe(true)
  })

  it('throws TumaSignatureError with a descriptive message (no secrets in message)', () => {
    const wrongSig = makeHmac(VALID_BODY, 'wrong-secret')
    try {
      verifyTumaSignature(VALID_BODY, wrongSig, VALID_SECRET)
    } catch (e) {
      expect(e).toBeInstanceOf(TumaSignatureError)
      expect((e as TumaSignatureError).code).toBe('TUMA_SIGNATURE_INVALID')
      // Message must not contain the actual secret
      expect((e as Error).message).not.toContain(VALID_SECRET)
      expect((e as Error).message).not.toContain('wrong-secret')
    }
  })

  it('accepts the canonical example body used in provider tests', () => {
    // This is the SUCCESS_STK_BODY from provider.test.ts
    const body = JSON.stringify({
      status: 'completed',
      result_code: 0,
      result_desc: 'The request was successful.',
      merchant_request_id: 'MERCH-001',
      checkout_request_id: 'CHECK-001',
      mpesa_receipt_number: 'MPXX123456789',
      amount: 500,
      timestamp: '2026-02-23 14:27:46',
    })
    const sig = makeHmac(body, VALID_SECRET)
    expect(verifyTumaSignature(body, sig, VALID_SECRET)).toBe(true)
  })
})

describe('getSignatureFromHeaders', () => {

  it('returns the signature from the correct header (case-insensitive key)', () => {
    const headers = { [TUMA_SIGNATURE_HEADER]: 'abc123' }
    expect(getSignatureFromHeaders(headers)).toBe('abc123')
  })

  it('is case-insensitive for header name', () => {
    const headers = { 'X-TUMA-SIGNATURE': 'sig-xyz' }
    expect(getSignatureFromHeaders(headers)).toBe('sig-xyz')
  })

  it('returns undefined when header is absent', () => {
    const headers = { 'content-type': 'application/json' }
    expect(getSignatureFromHeaders(headers)).toBeUndefined()
  })

  it('returns undefined when header value is empty string', () => {
    const headers = { [TUMA_SIGNATURE_HEADER]: '' }
    expect(getSignatureFromHeaders(headers)).toBeUndefined()
  })

  it('handles array header values (takes first)', () => {
    const headers = { [TUMA_SIGNATURE_HEADER]: ['sig-first', 'sig-second'] }
    expect(getSignatureFromHeaders(headers)).toBe('sig-first')
  })

  it('uses custom header name when provided', () => {
    const headers = { 'x-custom-sig': 'my-sig' }
    expect(getSignatureFromHeaders(headers, 'x-custom-sig')).toBe('my-sig')
  })
})

describe('TumaSignatureError', () => {
  it('has correct code and name', () => {
    const err = new TumaSignatureError('test reason')
    expect(err.code).toBe('TUMA_SIGNATURE_INVALID')
    expect(err.name).toBe('TumaSignatureError')
    expect(err.message).toContain('test reason')
  })
})
