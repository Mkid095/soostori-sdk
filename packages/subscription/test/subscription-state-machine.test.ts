/**
 * Subscription state machine tests (P0-2a — 2026-10-05).
 *
 * Locks in the user-specified 5-state vocabulary:
 *   ACTIVE | SETUP_GRACE | EXPIRED | RENEWAL_GRACE | DEACTIVATED
 *
 * Run: pnpm vitest run packages/subscription/test/subscription-state-machine.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeSubscriptionState,
  enforceSubscription,
  enforceSubscriptionStatus,
  SubscriptionExpiredError,
  SubscriptionDeactivatedError,
} from '../src/index.js'
import {
  SETUP_GRACE_DAYS,
  SETUP_GRACE_DAYS_DEFAULT,
  SUBSCRIPTION_PERIOD_DAYS,
  RENEWAL_GRACE_DAYS,
  RENEWAL_GRACE_DAYS_DEFAULT,
} from '@soostori/core'

const DAY_MS = 24 * 60 * 60 * 1000

// ── Constants (P0-2a user spec) ───────────────────────────────────────────────

describe('subscription lifecycle constants', () => {
  it('SETUP_GRACE_DAYS = 14 (first-month setup grace)', () => {
    expect(SETUP_GRACE_DAYS).toBe(14)
    expect(SETUP_GRACE_DAYS_DEFAULT).toBe(14)
  })

  it('SUBSCRIPTION_PERIOD_DAYS = 30 (fixed 30-day period, not calendar arithmetic)', () => {
    expect(SUBSCRIPTION_PERIOD_DAYS).toBe(30)
  })

  it('RENEWAL_GRACE_DAYS = 3 (post-expiry renewal grace)', () => {
    expect(RENEWAL_GRACE_DAYS).toBe(3)
    expect(RENEWAL_GRACE_DAYS_DEFAULT).toBe(3)
  })
})

// ── computeSubscriptionState — 5-state derivation ────────────────────────────

describe('computeSubscriptionState', () => {
  const periodEnd = new Date('2026-11-04T00:00:00Z').getTime()
  const now = new Date('2026-10-05T00:00:00Z').getTime()

  it('returns SETUP_GRACE when now < setupGraceEndsAt and setupGraceEndsAt is set', () => {
    // now is 2026-10-05, periodEnd is 2026-11-04 (30 days later), setupGraceEndsAt is 7 days from now
    const state = computeSubscriptionState({
      currentPeriodEnd: new Date(periodEnd).toISOString(),
      setupGraceEndsAt: new Date(now + 7 * DAY_MS).toISOString(),
      now: new Date(now),
    })
    expect(state).toBe('SETUP_GRACE')
  })

  it('returns ACTIVE when setupGraceEndsAt < now < currentPeriodEnd', () => {
    // now is 2026-10-05, setupGraceEndsAt already passed 1 day ago, periodEnd is 30 days from now
    const state = computeSubscriptionState({
      currentPeriodEnd: new Date(periodEnd).toISOString(),
      setupGraceEndsAt: new Date(now - 1 * DAY_MS).toISOString(),
      now: new Date(now),
    })
    expect(state).toBe('ACTIVE')
  })

  it('returns ACTIVE when setupGraceEndsAt is null and now < currentPeriodEnd', () => {
    // Renewal cycle — no setup grace. Active as long as period is in force.
    const state = computeSubscriptionState({
      currentPeriodEnd: new Date(periodEnd).toISOString(),
      setupGraceEndsAt: null,
      now: new Date(now),
    })
    expect(state).toBe('ACTIVE')
  })

  it('returns RENEWAL_GRACE when currentPeriodEnd < now < currentPeriodEnd + RENEWAL_GRACE_DAYS', () => {
    // 1 day past periodEnd, well within 3-day renewal grace
    const state = computeSubscriptionState({
      currentPeriodEnd: new Date(periodEnd).toISOString(),
      setupGraceEndsAt: null,
      now: new Date(periodEnd + 1 * DAY_MS),
    })
    expect(state).toBe('RENEWAL_GRACE')
  })

  it('returns RENEWAL_GRACE at the boundary: now = currentPeriodEnd + RENEWAL_GRACE_DAYS - 1ms', () => {
    // 1ms before the grace window closes
    const state = computeSubscriptionState({
      currentPeriodEnd: new Date(periodEnd).toISOString(),
      setupGraceEndsAt: null,
      now: new Date(periodEnd + 3 * DAY_MS - 1),
    })
    expect(state).toBe('RENEWAL_GRACE')
  })

  it('returns DEACTIVATED when now > currentPeriodEnd + RENEWAL_GRACE_DAYS', () => {
    // 4 days past periodEnd — past the 3-day renewal grace
    const state = computeSubscriptionState({
      currentPeriodEnd: new Date(periodEnd).toISOString(),
      setupGraceEndsAt: null,
      now: new Date(periodEnd + 4 * DAY_MS),
    })
    expect(state).toBe('DEACTIVATED')
  })

  it('returns DEACTIVATED at the boundary: now = currentPeriodEnd + RENEWAL_GRACE_DAYS + 1ms', () => {
    // 1ms past the grace window
    const state = computeSubscriptionState({
      currentPeriodEnd: new Date(periodEnd).toISOString(),
      setupGraceEndsAt: null,
      now: new Date(periodEnd + 3 * DAY_MS + 1),
    })
    expect(state).toBe('DEACTIVATED')
  })

  it('SETUP_GRACE is ignored on renewals (setupGraceEndsAt === null is treated as no grace)', () => {
    // Renewal with setupGraceEndsAt null and current period in force → ACTIVE, not SETUP_GRACE
    const state = computeSubscriptionState({
      currentPeriodEnd: new Date(periodEnd).toISOString(),
      setupGraceEndsAt: null,
      now: new Date(now),
    })
    expect(state).toBe('ACTIVE')
  })

  it('is idempotent — calling twice with same input returns same status', () => {
    const input = {
      currentPeriodEnd: new Date(periodEnd).toISOString(),
      setupGraceEndsAt: null,
      now: new Date(now),
    }
    const a = computeSubscriptionState(input)
    const b = computeSubscriptionState(input)
    expect(a).toBe(b)
  })

  it('uses Date.now() when `now` is omitted', () => {
    // 1 day in the future, no setup grace
    const state = computeSubscriptionState({
      currentPeriodEnd: new Date(Date.now() + 1 * DAY_MS).toISOString(),
      setupGraceEndsAt: null,
    })
    expect(state).toBe('ACTIVE')
  })
})

// ── enforceSubscription — 5-state enforcement ────────────────────────────────

describe('enforceSubscription (state-driven)', () => {
  // Helper to build a SubscriptionState directly for these tests (skipping
  // the cached-entitlement derivation path tested in subscription.test.ts).
  const now = new Date('2026-10-05T00:00:00Z').getTime()
  const periodEnd = new Date('2026-11-04T00:00:00Z').getTime()

  function stateFor(status: 'ACTIVE' | 'SETUP_GRACE' | 'EXPIRED' | 'RENEWAL_GRACE' | 'DEACTIVATED') {
    return {
      valid: status === 'ACTIVE' || status === 'SETUP_GRACE' || status === 'RENEWAL_GRACE',
      expired: status === 'EXPIRED' || status === 'DEACTIVATED',
      inGracePeriod: status === 'RENEWAL_GRACE',
      graceDaysRemaining: status === 'RENEWAL_GRACE' ? 2 : 0,
      daysUntilExpiry: status === 'ACTIVE' ? 30 : null,
      plan: 'pro',
      source: 'cache' as const,
      checkedAt: new Date(now).toISOString(),
      status,
    }
  }

  it('allows mutations in SETUP_GRACE', () => {
    expect(() => enforceSubscription(stateFor('SETUP_GRACE'))).not.toThrow()
  })

  it('allows mutations in ACTIVE', () => {
    expect(() => enforceSubscription(stateFor('ACTIVE'))).not.toThrow()
  })

  it('allows mutations in RENEWAL_GRACE (warning, not block)', () => {
    expect(() => enforceSubscription(stateFor('RENEWAL_GRACE'))).not.toThrow()
  })

  it('blocks mutations in EXPIRED', () => {
    expect(() => enforceSubscription(stateFor('EXPIRED'))).toThrow(SubscriptionExpiredError)
  })

  it('blocks mutations in DEACTIVATED', () => {
    expect(() => enforceSubscription(stateFor('DEACTIVATED'))).toThrow(SubscriptionDeactivatedError)
  })
})

// ── enforceSubscriptionStatus — direct status enforcement ────────────────────

describe('enforceSubscriptionStatus (pure)', () => {
  it('allows ACTIVE', () => {
    expect(() => enforceSubscriptionStatus('ACTIVE')).not.toThrow()
  })

  it('allows SETUP_GRACE', () => {
    expect(() => enforceSubscriptionStatus('SETUP_GRACE')).not.toThrow()
  })

  it('allows RENEWAL_GRACE', () => {
    expect(() => enforceSubscriptionStatus('RENEWAL_GRACE')).not.toThrow()
  })

  it('blocks EXPIRED with SubscriptionExpiredError', () => {
    expect(() => enforceSubscriptionStatus('EXPIRED')).toThrow(SubscriptionExpiredError)
  })

  it('blocks DEACTIVATED with SubscriptionDeactivatedError', () => {
    expect(() => enforceSubscriptionStatus('DEACTIVATED')).toThrow(SubscriptionDeactivatedError)
  })
})
