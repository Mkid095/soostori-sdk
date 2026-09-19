/**
 * Commission processor types — payment-integrated commission engine.
 *
 * Commission lifecycle:
 *   subscription.payment_confirmed (Tuma callback status=completed)
 *     → advance enrollment to qualified
 *     → record commission earnings (salesperson + influencer)
 *     → emit commission.accrued
 *
 *   payout window opens
 *     → update status to payable
 *     → emit commission.payable
 *
 *   disbursement confirmed
 *     → update status to paid
 *     → emit commission.paid
 *
 *   dispute / refund
 *     → update status to reversed
 *     → emit commission.reversed
 *
 * Hard privacy rule: influencer NEVER sees client payment amount.
 */

import type { BusinessId, SalespersonProfileId, InfluencerProfileId, Money } from '@soostori/core'

// ── Canonical commission status vocabulary ──────────────────────────────────────

/**
 * Closed vocabulary — only these four values are valid.
 * Maps to remote commissionLedger.status field.
 */
export type CommissionStatus = 'accrued' | 'payable' | 'paid' | 'reversed'

// ── Recipient-safe projection types ────────────────────────────────────────────

/**
 * InfluencerCommissionProjection — what an influencer can see.
 *
 * HARD PRIVACY RULE: saleAmount is NEVER exposed to the influencer.
 * They see only their flat KSh 50 commission and shop count.
 */
export interface InfluencerCommissionProjection {
  /** Internal: commission earning id — not shown to influencer */
  earningId: string
  status: CommissionStatus
  /** When the commission was earned */
  earnedAt: string
  /** KSh 50 — the influencer's flat commission */
  commissionAmount: Money
  /** Number of qualifying shops the influencer has recruited */
  qualifyingShopCount: number
  /** The salesperson this earning is attributed to */
  salespersonName: string
}

// ── Commission processor input ─────────────────────────────────────────────────

/**
 * CommissionTrigger — extracted from Tuma PaymentCallback.
 * Used by CommissionProcessor to drive the commission pipeline.
 */
export interface CommissionTrigger {
  /** The business (shop) that made the payment */
  businessId: BusinessId
  /** Tuma payment amount in KES — confirmed payment only */
  amount: Money
  /** Tuma subscription id (maps to subscriptions.id on backend) */
  subscriptionId: string
  /** ISO timestamp of the payment */
  paidAt: string
  /** M-Pesa receipt number for audit */
  receiptNumber: string
}
