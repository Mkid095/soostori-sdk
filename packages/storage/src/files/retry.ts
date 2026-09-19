/**
 * Retry classification + exponential backoff for file uploads.
 *
 * Pure functions — no I/O, no state. Easy to unit-test.
 */

import type { UploadAttemptOutcome } from '@soostori/contracts'

export interface RetryDecision {
  /** Whether to retry the attempt. */
  readonly retry: boolean
  /** Backoff in ms before the next attempt (capped). */
  readonly delayMs: number
  /** Final disposition if not retrying. */
  readonly finalState: 'retrying' | 'dead_letter'
}

const MAX_BACKOFF_MS = 5 * 60 * 1000 // 5 minutes
const BASE_BACKOFF_MS = 1000

/** Exponential backoff with cap. 2^attempt seconds. */
export function exponentialBackoff(attempt: number): number {
  const exp = Math.pow(2, Math.max(0, attempt))
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * exp)
}

/** Convert an `UploadAttemptOutcome` into a retry decision. */
export function decideRetry(outcome: UploadAttemptOutcome, attempt: number): RetryDecision {
  if (outcome.kind === 'success') {
    return { retry: false, delayMs: 0, finalState: 'retrying' }
  }
  if (outcome.kind === 'fatal') {
    return { retry: false, delayMs: 0, finalState: 'dead_letter' }
  }
  // outcome.kind === 'retry'
  return {
    retry: true,
    delayMs: exponentialBackoff(attempt),
    finalState: 'retrying',
  }
}

export const RETRY_CONFIG = {
  maxBackoffMs: MAX_BACKOFF_MS,
  baseBackoffMs: BASE_BACKOFF_MS,
  /** Maximum retry attempts before dead-letter. */
  maxAttempts: 6,
} as const
