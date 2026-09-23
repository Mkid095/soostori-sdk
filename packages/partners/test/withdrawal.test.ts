/**
 * Withdrawal domain — unit tests.
 *
 * Run: pnpm vitest run packages/partners/test/withdrawal.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  applyWithdrawalTransition,
  buildWithdrawalIdempotencyKey,
  computeWithdrawalBalance,
  createWithdrawalRequest,
  IllegalWithdrawalTransitionError,
  WITHDRAWAL_REQUESTED,
  WITHDRAWAL_APPROVED,
  WITHDRAWAL_REJECTED,
  WITHDRAWAL_PROCESSING,
  WITHDRAWAL_PAID,
  WITHDRAWAL_CANCELLED,
  WITHDRAWAL_EVENTS,
} from '../src/withdrawal.js'
import type { WithdrawalRequest } from '../src/withdrawal.js'

// ── Test helpers ────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<WithdrawalRequest> = {}): WithdrawalRequest {
  return {
    id: 'wdr-1',
    recipientId: 'sp-1',
    recipientType: 'salesperson',
    amount: 1000 as any,
    availableBalanceAtRequest: 5000 as any,
    reservedAmount: 1000 as any,
    idempotencyKey: 'withdrawal:sp-1:salesperson:wdr-1',
    status: 'requested',
    requestedAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

// ── Withdrawal state machine ───────────────────────────────────────────────────

describe('WithdrawalRequest state machine', () => {

  // REQUESTED transitions
  it('REQUESTED → APPROVED is valid', () => {
    const r = makeRequest({ status: 'requested' })
    expect(() => applyWithdrawalTransition(r, 'approved', { processedBy: 'admin-1' })).not.toThrow()
  })

  it('REQUESTED → REJECTED is valid', () => {
    const r = makeRequest({ status: 'requested' })
    expect(() => applyWithdrawalTransition(r, 'rejected', {
      processedBy: 'admin-1',
      rejectionReason: 'Suspicious activity',
    })).not.toThrow()
  })

  it('REQUESTED → CANCELLED is valid', () => {
    const r = makeRequest({ status: 'requested' })
    expect(() => applyWithdrawalTransition(r, 'cancelled')).not.toThrow()
  })

  it('REQUESTED → PAID is INVALID (must go through APPROVED + PROCESSING)', () => {
    const r = makeRequest({ status: 'requested' })
    expect(() => applyWithdrawalTransition(r, 'paid')).toThrow(IllegalWithdrawalTransitionError)
  })

  it('REQUESTED → PROCESSING is INVALID', () => {
    const r = makeRequest({ status: 'requested' })
    expect(() => applyWithdrawalTransition(r, 'processing')).toThrow(IllegalWithdrawalTransitionError)
  })

  // APPROVED transitions
  it('APPROVED → PROCESSING is valid', () => {
    const r = makeRequest({ status: 'approved', approvedAt: '2026-09-01T00:00:00Z' })
    expect(() => applyWithdrawalTransition(r, 'processing', { processedBy: 'admin-1' })).not.toThrow()
  })

  it('APPROVED → REJECTED is valid', () => {
    const r = makeRequest({ status: 'approved', approvedAt: '2026-09-01T00:00:00Z' })
    expect(() => applyWithdrawalTransition(r, 'rejected', {
      processedBy: 'admin-1',
      rejectionReason: 'Wrong recipient',
    })).not.toThrow()
  })

  it('APPROVED → CANCELLED is valid', () => {
    const r = makeRequest({ status: 'approved' })
    expect(() => applyWithdrawalTransition(r, 'cancelled')).not.toThrow()
  })

  it('APPROVED → PAID is INVALID (must go through PROCESSING)', () => {
    const r = makeRequest({ status: 'approved' })
    expect(() => applyWithdrawalTransition(r, 'paid')).toThrow(IllegalWithdrawalTransitionError)
  })

  // PROCESSING transitions
  it('PROCESSING → PAID is valid', () => {
    const r = makeRequest({ status: 'processing', processingAt: '2026-09-01T00:00:00Z' })
    expect(() => applyWithdrawalTransition(r, 'paid', {
      processedBy: 'admin-1',
      paymentReference: 'TUMA-DISB-001',
    })).not.toThrow()
  })

  it('PROCESSING → CANCELLED is valid', () => {
    const r = makeRequest({ status: 'processing' })
    expect(() => applyWithdrawalTransition(r, 'cancelled')).not.toThrow()
  })

  // Terminal states — ALL transitions are invalid
  describe('terminal states — no further transitions allowed', () => {
    const terminalStates: Array<'paid' | 'rejected' | 'cancelled'> = ['paid', 'rejected', 'cancelled']
    terminalStates.forEach(term => {
      it(`PAID is terminal: cannot transition to ${term} → any`, () => {
        const r = makeRequest({ status: term, paidAt: '2026-09-01T00:00:00Z' })
        expect(() => applyWithdrawalTransition(r, 'approved')).toThrow(IllegalWithdrawalTransitionError)
        expect(() => applyWithdrawalTransition(r, 'processing')).toThrow(IllegalWithdrawalTransitionError)
        expect(() => applyWithdrawalTransition(r, 'paid')).toThrow(IllegalWithdrawalTransitionError)
        expect(() => applyWithdrawalTransition(r, 'rejected')).toThrow(IllegalWithdrawalTransitionError)
        expect(() => applyWithdrawalTransition(r, 'cancelled')).toThrow(IllegalWithdrawalTransitionError)
      })
    })
  })

  // Timestamp preservation
  it('transition to APPROVED sets approvedAt timestamp', () => {
    const r = makeRequest({ status: 'requested' })
    const next = applyWithdrawalTransition(r, 'approved', { processedBy: 'admin-1' })
    expect(next.approvedAt).toBeDefined()
    expect(next.status).toBe('approved')
    expect(next.processedBy).toBe('admin-1')
  })

  it('transition to PROCESSING sets processingAt timestamp', () => {
    const r = makeRequest({ status: 'approved' })
    const next = applyWithdrawalTransition(r, 'processing', { processedBy: 'admin-1' })
    expect(next.processingAt).toBeDefined()
    expect(next.status).toBe('processing')
  })

  it('transition to PAID sets paidAt and paymentReference', () => {
    const r = makeRequest({ status: 'processing' })
    const next = applyWithdrawalTransition(r, 'paid', {
      processedBy: 'admin-1',
      paymentReference: 'TUMA-DISB-001',
    })
    expect(next.paidAt).toBeDefined()
    expect(next.paymentReference).toBe('TUMA-DISB-001')
    expect(next.status).toBe('paid')
  })

  it('transition to REJECTED sets rejectionReason', () => {
    const r = makeRequest({ status: 'requested' })
    const next = applyWithdrawalTransition(r, 'rejected', {
      processedBy: 'admin-1',
      rejectionReason: 'Account restricted',
    })
    expect(next.rejectionReason).toBe('Account restricted')
    expect(next.status).toBe('rejected')
  })

  it('applyWithdrawalTransition returns a NEW request (immutable)', () => {
    const r = makeRequest({ status: 'requested' })
    const next = applyWithdrawalTransition(r, 'approved')
    expect(r.status).toBe('requested')  // original unchanged
    expect(next.status).toBe('approved')
    expect(r.updatedAt).not.toBe(next.updatedAt)
  })

  it('error has correct code and fields', () => {
    const r = makeRequest({ status: 'requested' })
    try {
      applyWithdrawalTransition(r, 'paid')
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(IllegalWithdrawalTransitionError)
      expect((e as IllegalWithdrawalTransitionError).code).toBe('WITHDRAWAL_ILLEGAL_TRANSITION')
      expect((e as IllegalWithdrawalTransitionError).currentStatus).toBe('requested')
      expect((e as IllegalWithdrawalTransitionError).attemptedStatus).toBe('paid')
    }
  })
})

describe('buildWithdrawalIdempotencyKey', () => {
  it('format is withdrawal:{recipientId}:{recipientType}:{requestId}', () => {
    const key = buildWithdrawalIdempotencyKey('sp-1', 'salesperson', 'wdr-abc')
    expect(key).toBe('withdrawal:sp-1:salesperson:wdr-abc')
  })

  it('works for influencer recipient type', () => {
    const key = buildWithdrawalIdempotencyKey('inf-99', 'influencer', 'wdr-xyz')
    expect(key).toBe('withdrawal:inf-99:influencer:wdr-xyz')
  })
})

describe('createWithdrawalRequest', () => {
  it('creates request in REQUESTED status with all required fields', () => {
    const req = createWithdrawalRequest({
      recipientId: 'sp-1',
      recipientType: 'salesperson',
      amount: 5000 as any,
      availableBalance: 10000 as any,
    })

    expect(req.status).toBe('requested')
    expect(req.id).toBeDefined()
    expect(req.idempotencyKey).toContain('withdrawal:sp-1:salesperson:')
    expect(req.amount).toBe(5000)
    expect(req.availableBalanceAtRequest).toBe(10000)
    expect(req.reservedAmount).toBe(5000)
    expect(req.requestedAt).toBeDefined()
  })

  it('generates a new id on each call (not deterministic)', () => {
    const req1 = createWithdrawalRequest({
      recipientId: 'sp-1', recipientType: 'salesperson',
      amount: 1000 as any, availableBalance: 5000 as any,
    })
    const req2 = createWithdrawalRequest({
      recipientId: 'sp-1', recipientType: 'salesperson',
      amount: 1000 as any, availableBalance: 5000 as any,
    })
    expect(req1.id).not.toBe(req2.id)
    expect(req1.idempotencyKey).not.toBe(req2.idempotencyKey)
  })
})

describe('computeWithdrawalBalance', () => {
  it('available = payable − requested when payable > requested', () => {
    // Earned: 10000, Paid: 0, Pending requests: 3000
    // payable = 10000, available = 10000 - 3000 = 7000
    const balance = computeWithdrawalBalance(
      [{ amount: 10000 as any }],  // payable earnings
      [],                           // paid earnings
      [{ amount: 3000 as any }],  // pending requests
    )
    expect(balance.earned).toBe(10000)
    expect(balance.payable).toBe(10000)
    expect(balance.requested).toBe(3000)
    expect(balance.paid).toBe(0)
    expect(balance.available).toBe(7000)
  })

  it('available = 0 when requested >= payable', () => {
    // Earned: 5000, Paid: 0, Pending requests: 5000
    // payable = 5000, available = 5000 - 5000 = 0
    const balance = computeWithdrawalBalance(
      [{ amount: 5000 as any }],
      [],
      [{ amount: 5000 as any }],
    )
    expect(balance.available).toBe(0)
  })

  it('available = 0 when requested > payable', () => {
    const balance = computeWithdrawalBalance(
      [{ amount: 5000 as any }],
      [],
      [{ amount: 7000 as any }],  // over-requested
    )
    expect(balance.available).toBe(0)
  })

  it('available cannot go negative', () => {
    const balance = computeWithdrawalBalance(
      [{ amount: 5000 as any }],
      [],
      [{ amount: 8000 as any }],  // over-requested
    )
    expect(balance.available).toBe(0)  // clamped, not negative
  })

  it('paid reduces payable', () => {
    // Earned: 10000, Paid: 4000 (already disbursed), Pending: 2000
    // payable = 10000 - 4000 = 6000, available = 6000 - 2000 = 4000
    const balance = computeWithdrawalBalance(
      [{ amount: 10000 as any }],   // all earnings
      [{ amount: 4000 as any }],    // already paid
      [{ amount: 2000 as any }],    // pending
    )
    expect(balance.payable).toBe(6000)
    expect(balance.available).toBe(4000)
  })

  it('multiple pending requests sum correctly', () => {
    const balance = computeWithdrawalBalance(
      [{ amount: 10000 as any }],
      [],
      [
        { amount: 2000 as any },
        { amount: 3000 as any },
      ],
    )
    expect(balance.requested).toBe(5000)
    expect(balance.available).toBe(5000)
  })

  it('zero earnings → zero available', () => {
    const balance = computeWithdrawalBalance([], [], [])
    expect(balance.earned).toBe(0)
    expect(balance.payable).toBe(0)
    expect(balance.requested).toBe(0)
    expect(balance.paid).toBe(0)
    expect(balance.available).toBe(0)
  })
})

describe('withdrawal events catalog', () => {
  it('all 6 canonical withdrawal events are present', () => {
    expect(WITHDRAWAL_EVENTS).toContain(WITHDRAWAL_REQUESTED)
    expect(WITHDRAWAL_EVENTS).toContain(WITHDRAWAL_APPROVED)
    expect(WITHDRAWAL_EVENTS).toContain(WITHDRAWAL_REJECTED)
    expect(WITHDRAWAL_EVENTS).toContain(WITHDRAWAL_PROCESSING)
    expect(WITHDRAWAL_EVENTS).toContain(WITHDRAWAL_PAID)
    expect(WITHDRAWAL_EVENTS).toContain(WITHDRAWAL_CANCELLED)
    expect(WITHDRAWAL_EVENTS).toHaveLength(6)
  })

  it('event names follow the withdrawal.* pattern', () => {
    WITHDRAWAL_EVENTS.forEach(e => {
      expect(e).toMatch(/^withdrawal\./)
    })
  })
})

describe('concurrent withdrawal scenario', () => {
  it('available balance is correctly reduced by each pending request', () => {
    // Scenario: available = 10000, Request A = 7000, Request B = 7000
    // Neither should see the other's reservation if they both check simultaneously
    const balance1 = computeWithdrawalBalance(
      [{ amount: 10000 as any }],
      [],
      [{ amount: 7000 as any }],  // Request A already pending
    )
    // Request B sees only 3000 available
    expect(balance1.available).toBe(3000)

    // If Request B also submits, it reduces further
    const balance2 = computeWithdrawalBalance(
      [{ amount: 10000 as any }],
      [],
      [
        { amount: 7000 as any },  // Request A
        { amount: 7000 as any },  // Request B
      ],
    )
    expect(balance2.available).toBe(0)  // exhausted
  })
})
