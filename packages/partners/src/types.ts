/**
 * Partner Platform types — Phase 18.
 *
 * Canonical contracts for:
 *   - PartnerApplication  — salesperson application state machine
 *   - CommissionEarning   — idempotent commission earning record
 *   - Enrollment/Conversion state
 *
 * Commercial invariants (proven in code):
 *   1. Attribution IMMUTABLE: referredBy + attributionSource cannot change
 *      once a CommissionEarning or enrollment record is created.
 *   2. No duplicate earnings: idempotencyKey = salespersonId+subscriptionId+role
 *      is enforced unique at the repository layer.
 *   3. Commission triggered ONLY by conversion.qualified event — not by
 *      assignment, application, or approval.
 *   4. Commission calculation via canonical formula in CommissionService —
 *      Web/Mobile/Desktop MUST NOT recalculate independently.
 *   5. Business isolation: every query is scoped by businessId or partnerId.
 *   6. Admin exceptional-case path: disputes/reversals via admin API only.
 */

import type {
  BusinessId, SalespersonProfileId, InfluencerProfileId,
  SalespersonApplicationId, CommissionLedgerId, ISO8601, Money,
} from '@soostori/core'

// ── Application state machine (§19/§20) ─────────────────────────────────────

export type PartnerApplicationStatus =
  | 'pending'    // submitted, awaiting review
  | 'approved'   // admin approved → SalespersonProfile created
  | 'rejected'   // admin rejected

/**
 * PartnerApplication — public-facing application for becoming a salesperson.
 *
 * Lifecycle: pending → approved | rejected.
 * Immutable after creation; only status transitions via approve/reject.
 *
 * INVARIANT 1 (Attribution immutability): Once created, referredBy and
 * attributionSource are NEVER modified. The record is append-only.
 */
export interface PartnerApplication {
  id: SalespersonApplicationId
  applicantPersonId: string
  fullName: string
  email: string
  phone: string
  country: string
  /** Referral code used at application time — set once, never changed. */
  referralCode?: string | null
  /** Influencer who recruited this applicant — set once at creation. */
  referredBy?: InfluencerProfileId | null
  status: PartnerApplicationStatus
  reviewerUserId?: string | null
  reviewNotes?: string | null
  reviewedAt?: ISO8601 | null
  submittedAt?: ISO8601 | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── Enrollment / conversion state machine ────────────────────────────────────

export type EnrollmentStatus = 'enrolled' | 'qualifying' | 'qualified' | 'converted'

/**
 * Business enrollment record — links a business to a salesperson.
 *
 * Lifecycle: enrolled → qualifying → qualified → converted.
 * The chain Business → Subscription → Commission is driven by this record.
 *
 * INVARIANT 1: referredBy and attributionSource are set at enrollment time
 * and are immutable for the lifetime of this record.
 */
export interface BusinessEnrollment {
  id: string
  businessId: BusinessId
  /** The salesperson who enrolled this business. */
  salespersonProfileId: SalespersonProfileId
  /** Influencer who recruited the salesperson — set at enrollment. */
  influencerProfileId?: InfluencerProfileId | null
  status: EnrollmentStatus
  enrolledAt: ISO8601
  qualifyingSinceAt?: ISO8601 | null
  qualifiedAt?: ISO8601 | null
  convertedAt?: ISO8601 | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── Commission earning (idempotent) ───────────────────────────────────────────

export type CommissionRole = 'salesperson' | 'influencer' | 'company'

/**

 * recipientType — which party this ledger entry is for.
 * Stored on commissionLedger.recipientType in the backend.
 * - 'company': company share (company's own earnings)
 * - 'salesperson': salesperson commission share
 * - 'influencer': influencer flat attribution fee
 */
export type RecipientType = 'company' | 'salesperson' | 'influencer'

/**
 * CommissionEarning — a single commission payment record.
 *
 * INVARIANT 2 (No duplicate earnings): The idempotencyKey is the composite
 * of salespersonId + subscriptionId + role. The repository MUST enforce
 * uniqueness; a replay of the same event MUST NOT create a second record.
 *
 * INVARIANT 3 (Commission trigger): Earning records are created ONLY when
 * a conversion.qualified event is processed — NOT on business enrollment,
 * salesperson assignment, or application approval.
 *
 * INVARIANT 4 (Canonical formula): Amount is computed by CommissionService
 * using the formula: Company=500+25%×max(0,amount−600),
 *                    Salesperson=100+75%×max(0,amount−600),
 *                    Influencer=50 flat.
 * No other component recalculates commission amounts.
 */
export interface CommissionEarning {
  id: string
  salespersonProfileId: SalespersonProfileId
  /** Attribution source — set at enrollment, never modified. */
  influencerProfileId?: InfluencerProfileId | null
  businessId: BusinessId
  subscriptionId: string
  /** Amount in KES — computed by CommissionService, not by callers. */
  amount: Money
  role: CommissionRole
  /** Which party this ledger entry is for: company | salesperson | influencer */
  recipientType: RecipientType
  /**
   * Uniqueness constraint: salespersonId + subscriptionId + role.
   * A second emit of the same conversion event MUST NOT create a second earning.
   */
  idempotencyKey: string
  createdAt: ISO8601
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface SubmitApplicationInput {
  applicantPersonId: string
  fullName: string
  email: string
  phone: string
  country: string
  /** Referral code used at application time. */
  referralCode?: string
  /** Influencer who recruited this applicant. */
  referredBy?: InfluencerProfileId
}

export interface ApproveApplicationInput {
  applicationId: SalespersonApplicationId
  /** Notes from the reviewer. */
  reviewNotes?: string
}

export interface RejectApplicationInput {
  applicationId: SalespersonApplicationId
  reason?: string
}

export interface EnrollBusinessInput {
  businessId: BusinessId
  /** Referral code used at enrollment. */
  referralCode?: string
  /** Influencer who recruited the enrolling salesperson (if known). */
  influencerProfileId?: InfluencerProfileId
}

export interface RecordConversionInput {
  businessId: BusinessId
  subscriptionId: string
  /** Minimum qualifying amount in KES (600). */
  subscriptionAmount: Money
}

export interface RecordCommissionInput {
  businessId: BusinessId
  subscriptionId: string
  subscriptionAmount: Money
}

// ── Influencer eligibility ───────────────────────────────────────────────────────

/**
 * Represents an influencer's 24-month commission eligibility window for a specific shop.
 *
 * The window is fixed at qualification time (qualifiedAt on the enrollment) and
 * runs for exactly 24 months. Commission accrues only while the shop is active.
 * Requalification after a lapse may resume earning if the original window has not expired.
 */
export interface InfluencerEligibility {
  influencerId: InfluencerProfileId
  shopId: BusinessId
  /** When the shop first qualified for this influencer (qualifiedAt from enrollment). */
  windowStartAt: ISO8601
  /** Last day of the 24-month window (inclusive): windowStartAt + 24 months − 1 day. */
  windowEndAt: ISO8601
  /**
   * Number of whole months the influencer has earned commission for this shop.
   * Counted from qualifying events, not calendar time — commission stops accruing
   * while the shop is inactive but the window end date does not shift.
   */
  monthsEarned: number
  /** Whether the influencer is still within their 24-month window for this shop. */
  isEligible: boolean
}

/** Salesperson profile record — runtime shape with full lifecycle state. */
export interface SalespersonProfileRecord {
  id: SalespersonProfileId
  applicationId: SalespersonApplicationId
  personId: string
  referredBy?: InfluencerProfileId | null
  trainingStatus: "not_started" | "in_progress" | "completed"
  trainingCompletedAt?: string
  meetingStatus: "not_scheduled" | "scheduled" | "completed"
  meetingDate?: string
  createdAt: string
  updatedAt: string
  version: number
}
