/**
 * Canonical entity contract — Part 4b: CommissionRule / CommissionLedger / AuthAuditEvent.
 *
 * §56, §75–§76, §78 of the Soostori vision.
 */

import type {
  BusinessId, CommissionLedgerId, CommissionRuleId, AuthAuditEventId,
  SalespersonProfileId, InfluencerProfileId, EmployeeId, DeviceId, UserId,
  SaleId,
  ISO8601, Money,
} from '@soostori/core'

// ── CommissionRule (§75, §76) ─────────────────────────────────────────────────
export type CommissionScope = 'global' | 'influencer' | 'category' | 'product'

/**
 * CommissionRule — admin-configurable rate + duration rules.
 *
 * One rule applies per scope. Multiple rules can exist; the engine picks the
 * most specific. Rates drive CommissionLedger rows when a Sale is attributed.
 */
export interface CommissionRule {
  id: CommissionRuleId
  scope: CommissionScope
  /** When scope=influencer → InfluencerProfileId; category/product → that FK. */
  scopeRefId?: string | null
  /** Commission rate (0..1). */
  rate: number
  /** Optional override for commission duration (seconds). */
  durationSeconds?: number | null
  effectiveFrom: ISO8601
  effectiveTo?: ISO8601 | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── CommissionLedger (§76) ────────────────────────────────────────────────────
export type CommissionStatus = 'accruing' | 'confirmed' | 'paid' | 'reversed'

/**
 * CommissionLedger — salesperson-attributed sale event.
 *
 * Created when a Sale is attributed to a Salesperson / Influencer.
 * Status drives payout: accruing → confirmed → paid (or reversed).
 */
export interface CommissionLedger {
  id: CommissionLedgerId
  businessId: BusinessId
  salespersonId: SalespersonProfileId
  influencerId?: InfluencerProfileId | null
  saleId: SaleId
  /** CommissionRule that produced this rate. */
  ruleId: CommissionRuleId
  /** Sale amount at capture — replay-safe. */
  saleAmount: Money
  /** Commission amount at capture. */
  commissionAmount: Money
  status: CommissionStatus
  confirmedAt?: ISO8601 | null
  paidAt?: ISO8601 | null
  reversedAt?: ISO8601 | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── AuthAuditEvent (§78) ──────────────────────────────────────────────────────
export type AuthAuditEventKind =
  | 'SIGNED_IN' | 'SIGNED_OUT' | 'SESSION_REFRESHED' | 'SESSION_EXPIRED'
  | 'DEVICE_REGISTERED' | 'DEVICE_AUTHORIZED' | 'DEVICE_REVOKED'
  | 'PIN_SETUP' | 'PIN_VERIFIED' | 'PIN_CHANGED'
  | 'PIN_RECOVERY_STARTED' | 'PIN_RECOVERY_COMPLETED'
  | 'BUSINESS_SELECTED'

/**
 * AuthAuditEvent — append-only auth/security event log.
 *
 * Insert-only. Never updated or deleted (compliance / §78).
 */
export interface AuthAuditEvent {
  id: AuthAuditEventId
  businessId?: BusinessId | null
  employeeId?: EmployeeId | null
  deviceId?: DeviceId | null
  /** Originating auth subject. */
  userId?: UserId | null
  kind: AuthAuditEventKind
  /** Non-sensitive metadata — counts, role, success/failure. */
  metadata?: Record<string, unknown> | null
  /** Originating-device timestamp. */
  timestamp: ISO8601
  createdAt: ISO8601
  /** Append-only — version increments on insert. */
  version: number
}
