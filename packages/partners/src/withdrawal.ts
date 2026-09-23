/**
 * Withdrawal domain — partner payout requests.
 *
 * Design principles:
 *   - Immutable once PAID, REJECTED, or CANCELLED.
 *   - State transitions are validated by the state machine — invalid
 *     transitions throw IllegalWithdrawalTransitionError.
 *   - Idempotency key = {recipientId}:{recipientType}:{WithdrawalRequest.id}
 *     prevents duplicate submission at the repository layer.
 *   - Available balance is enforced at the domain level — callers MUST
 *     check available balance before creating a request.
 *
 * State machine:
 *
 *   REQUESTED ──┬── APPROVED ──┬── PROCESSING ──┬── PAID
 *               │             │                 │
 *               ├── REJECTED   ├── CANCELLED     └── CANCELLED
 *               │
 *               └── CANCELLED
 *
 * Invalid transitions (all throw IllegalWithdrawalTransitionError):
 *   PAID → any state
 *   REJECTED → any state
 *   CANCELLED → any state
 *   REQUESTED → PAID (must go through APPROVED → PROCESSING first)
 *
 * Canonical event names (exported for NotificationEngine rules):
 *   withdrawal.requested
 *   withdrawal.approved
 *   withdrawal.rejected
 *   withdrawal.processing
 *   withdrawal.paid
 *   withdrawal.cancelled
 */

import type {
  SalespersonProfileId, InfluencerProfileId, ISO8601, Money,
} from '@soostori/core'
import { newId } from '@soostori/core'

// ── Withdrawal status ─────────────────────────────────────────────────────────

export type WithdrawalStatus =
  | 'requested'
  | 'approved'
  | 'processing'
  | 'paid'
  | 'rejected'
  | 'cancelled'

// ── Recipient types ─────────────────────────────────────────────────────────────

export type WithdrawalRecipientType = 'salesperson' | 'influencer'

// ── WithdrawalRequest ─────────────────────────────────────────────────────────

export interface WithdrawalRequest {
  readonly id: string
  /** Who is receiving the payout. */
  readonly recipientId: string          // SalespersonProfileId | InfluencerProfileId
  readonly recipientType: WithdrawalRecipientType
  /** How much is being requested. */
  readonly amount: Money
  /** Balance available at time of request creation. */
  readonly availableBalanceAtRequest: Money
  /** Balance reserved by this request (equals amount until paid/cancelled). */
  readonly reservedAmount: Money
  /** Immutable once set — never changes for this request. */
  readonly idempotencyKey: string
  readonly status: WithdrawalStatus
  readonly rejectionReason?: string
  /** Who approved / processed / cancelled — employee userId. */
  readonly processedBy?: string
  /** Tuma disbursement reference. */
  readonly paymentReference?: string
  readonly requestedAt: ISO8601
  readonly approvedAt?: ISO8601
  readonly processingAt?: ISO8601
  readonly paidAt?: ISO8601
  readonly updatedAt: ISO8601
}

// ── Balance snapshot ───────────────────────────────────────────────────────────

export interface WithdrawalBalance {
  /** Total earnings ever recorded for this recipient. */
  earned: Money
  /** Sum of all PAYABLE earnings (accrued − requested − paid). */
  payable: Money
  /** Sum of all REQUESTED + APPROVED + PROCESSING amounts (reserved, not yet paid). */
  requested: Money
  /** Sum of all PAID amounts. */
  paid: Money
  /** payable − requested — what can still be requested. */
  available: Money
}

// ── State machine ─────────────────────────────────────────────────────────────

export class IllegalWithdrawalTransitionError extends Error {
  readonly code = 'WITHDRAWAL_ILLEGAL_TRANSITION'
  constructor(
    public readonly currentStatus: WithdrawalStatus,
    public readonly attemptedStatus: WithdrawalStatus,
    public readonly requestId: string,
  ) {
    super(
      `WithdrawalRequest ${requestId}: cannot transition from '${currentStatus}' to '${attemptedStatus}'`,
    )
    this.name = 'IllegalWithdrawalTransitionError'
  }
}

// Valid transitions: target status → set of allowed source statuses
const VALID_TRANSITIONS: Record<WithdrawalStatus, Set<WithdrawalStatus>> = {
  requested:      new Set(),
  approved:       new Set(['requested']),
  processing:     new Set(['approved']),
  paid:           new Set(['processing']),
  rejected:       new Set(['requested', 'approved']),
  cancelled:      new Set(['requested', 'approved', 'processing']),
}

/**
 * Validate and apply a status transition to a WithdrawalRequest.
 * Returns a NEW WithdrawalRequest (immutable update).
 * Throws IllegalWithdrawalTransitionError on invalid transition.
 */
export function applyWithdrawalTransition(
  request: WithdrawalRequest,
  nextStatus: WithdrawalStatus,
  options?: {
    processedBy?: string
    rejectionReason?: string
    paymentReference?: string
  },
): WithdrawalRequest {
  const allowed = VALID_TRANSITIONS[nextStatus]
  if (!allowed.has(request.status)) {
    throw new IllegalWithdrawalTransitionError(request.status, nextStatus, request.id)
  }

  const now = new Date().toISOString() as ISO8601

  // Terminal states — reject any transition FROM terminal states
  if (['paid', 'rejected', 'cancelled'].includes(request.status)) {
    throw new IllegalWithdrawalTransitionError(request.status, nextStatus, request.id)
  }

  const updates: Partial<WithdrawalRequest> = { status: nextStatus, updatedAt: now }

  if (nextStatus === 'approved')    updates.approvedAt    = now
  if (nextStatus === 'processing')   updates.processingAt   = now
  if (nextStatus === 'paid')        updates.paidAt          = now
  if (nextStatus === 'rejected')    updates.rejectionReason = options?.rejectionReason
  if (nextStatus === 'rejected' || nextStatus === 'approved') {
    updates.processedBy = options?.processedBy
  }
  if (nextStatus === 'processing') {
    updates.processedBy = options?.processedBy
  }
  if (nextStatus === 'paid') {
    updates.paymentReference = options?.paymentReference
    updates.processedBy = options?.processedBy
  }

  return { ...request, ...updates }
}

// ── Idempotency key ───────────────────────────────────────────────────────────

/**
 * Build the canonical idempotency key for a withdrawal request.
 *
 * Format: withdrawal:{recipientId}:{recipientType}:{requestId}
 *
 * The repository MUST enforce uniqueness on this key to prevent duplicate
 * withdrawal requests from double-submission.
 */
export function buildWithdrawalIdempotencyKey(
  recipientId: string,
  recipientType: WithdrawalRecipientType,
  requestId: string,
): string {
  return `withdrawal:${recipientId}:${recipientType}:${requestId}`
}

// ── Balance computation ────────────────────────────────────────────────────────

/**
 * Compute a recipient's withdrawal balance snapshot.
 *
 * @param payableEarnings  - earnings with status = 'payable'
 * @param paidEarnings     - earnings with status = 'paid'
 * @param pendingRequests   - withdrawal requests in requested/approved/processing status
 */
export function computeWithdrawalBalance(
  payableEarnings: { amount: Money }[],
  paidEarnings: { amount: Money }[],
  pendingRequests: { amount: Money }[],
): WithdrawalBalance {
  const earned = payableEarnings.reduce((s, e) => s + (e.amount as number), 0) as Money
  const paid  = paidEarnings.reduce((s, e) => s + (e.amount as number), 0) as Money
  const requested = pendingRequests.reduce((s, r) => s + (r.amount as number), 0) as Money
  const payable = (earned - paid) as Money
  const available = Math.max(0, (payable as number) - (requested as number)) as Money

  return { earned, payable, requested, paid, available }
}

// ── Canonical withdrawal events ────────────────────────────────────────────────

export const WITHDRAWAL_REQUESTED   = 'withdrawal.requested'
export const WITHDRAWAL_APPROVED   = 'withdrawal.approved'
export const WITHDRAWAL_REJECTED   = 'withdrawal.rejected'
export const WITHDRAWAL_PROCESSING = 'withdrawal.processing'
export const WITHDRAWAL_PAID       = 'withdrawal.paid'
export const WITHDRAWAL_CANCELLED  = 'withdrawal.cancelled'

export const WITHDRAWAL_EVENTS = [
  WITHDRAWAL_REQUESTED,
  WITHDRAWAL_APPROVED,
  WITHDRAWAL_REJECTED,
  WITHDRAWAL_PROCESSING,
  WITHDRAWAL_PAID,
  WITHDRAWAL_CANCELLED,
] as const

export type WithdrawalEventName = typeof WITHDRAWAL_EVENTS[number]

// ── WithdrawalRequest factory ─────────────────────────────────────────────────

export interface CreateWithdrawalRequestInput {
  recipientId: string
  recipientType: WithdrawalRecipientType
  amount: Money
  availableBalance: Money
  requestedBy?: string
}

/**
 * Create a new WithdrawalRequest in REQUESTED status.
 * Caller is responsible for checking availableBalance >= amount.
 */
export function createWithdrawalRequest(input: CreateWithdrawalRequestInput): WithdrawalRequest {
  const now = new Date().toISOString() as ISO8601
  const id = newId()
  return {
    id,
    recipientId: input.recipientId,
    recipientType: input.recipientType,
    amount: input.amount,
    availableBalanceAtRequest: input.availableBalance,
    reservedAmount: input.amount,
    idempotencyKey: buildWithdrawalIdempotencyKey(input.recipientId, input.recipientType, id),
    status: 'requested',
    requestedAt: now,
    updatedAt: now,
  }
}
