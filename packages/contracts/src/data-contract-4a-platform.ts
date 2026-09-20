/**
 * Canonical entity contract — Part 4a: Subscription / SalespersonApplication /
 * SalespersonProfile / InfluencerProfile.
 *
 * §19–§24, §45, §70–§73 of the Soostori vision.
 */

import type {
  BusinessId, SubscriptionId, PlanId, SalespersonApplicationId,
  SalespersonProfileId, InfluencerProfileId, CommissionRuleId,
  CommissionLedgerId, UserId, PackageId,
  ISO8601, Money,
} from '@soostori/core'

// ── Subscription (§24, §45) ───────────────────────────────────────────────────
export type SubscriptionStatus =
  | 'active' | 'grace' | 'read_only' | 'expired' | 'trialing' | 'cancelled'

/**
 * Subscription — business billing envelope.
 *
 * Lifecycle: trialing → active → grace → read_only → expired (or cancelled).
 * Drives downstream capability checks across all four platforms.
 */
export interface Subscription {
  id: SubscriptionId
  businessId: BusinessId
  planId: PlanId
  /** Denormalized plan key for fast lookups. */
  planKey: string
  status: SubscriptionStatus
  billingCycle: 'monthly' | 'yearly'
  amountPaid: Money
  currentPeriodStart: ISO8601
  currentPeriodEnd: ISO8601
  deviceLimit: number
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── SalespersonApplication (§19, §20) ─────────────────────────────────────────
export type SalespersonApplicationStatus =
  | 'draft' | 'submitted' | 'under_review' | 'documents_required'
  | 'approved' | 'rejected' | 'withdrawn'

/**
 * SalespersonApplication — applicant onboarding state machine (CANONICAL).
 *
 * Lifecycle: draft → submitted → under_review ↔ documents_required
 *          → approved | rejected | withdrawn.
 *
 * NOTE: This is the canonical 7-state contract. There is also a legacy
 * 3-state `PartnerApplication` type in `@soostori/partners/src/types.ts`
 * with `pending → approved | rejected`. The 3-state type is DEPRECATED —
 * new code should consume `SalespersonApplication` from this package.
 * Web/admin workflow UI states (`draft`, `withdrawn`, `documents_required`)
 * are NOT collapsed into this type; they are workflow metadata over the
 * canonical lifecycle.
 */
export interface SalespersonApplication {
  id: SalespersonApplicationId
  /** Originating Person record (null until cloud identity is linked). */
  applicantPersonId: string
  fullName: string
  email: string
  phone: string
  country: string
  /** National ID / passport reference (sensitive — see §20). */
  idDocumentRef?: string | null
  /** Selfie/photo reference (sensitive — see §20). */
  photoRef?: string | null
  motivation?: string | null
  status: SalespersonApplicationStatus
  reviewerUserId?: UserId | null
  reviewNotes?: string | null
  reviewedAt?: ISO8601 | null
  submittedAt?: ISO8601 | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── SalespersonProfile (§21, §22) ─────────────────────────────────────────────
export type TrainingStatus = 'not_started' | 'in_progress' | 'completed' | 'expired'

/**
 * MeetingStatus — null until training is completed.
 *
 * - null: training not yet complete; no meeting scheduled.
 * - 'scheduled': training completed; meeting is on the books.
 * - 'completed': meeting has occurred.
 *
 * meetingStatus transition is independent of `activeAt`. Completing a meeting
 * does NOT activate the salesperson.
 */
export type MeetingStatus = 'scheduled' | 'completed' | null

/**
 * SalespersonProfile — created on SalespersonApplication approval.
 *
 * Lifecycle fields (training → meeting → activation):
 * - trainingStep / trainingStatus — position in the training pipeline.
 * - trainingCompletedAt — server-authoritative timestamp; set exactly once
 *   when the salesperson completes all required training. Independent of
 *   activeAt.
 * - meetingDate — first Friday strictly after trainingCompletedAt.
 *   Null until training is completed.
 * - meetingStatus — see MeetingStatus.
 * - activeAt — operational activation. Set by the activation authority
 *   (Phase 2 owns this transition). NOT set by training completion and
 *   NOT set by meeting completion.
 *
 * Training is a 9-step pipeline (steps 0–8). `trainingStep` is the user's
 * position; `trainingStatus` is the high-level state. The curriculum
 * (which videos are required for which audience) is admin-controlled and
 * dynamic — the SDK does not embed a fixed step-count invariant.
 */
export interface SalespersonProfile {
  id: SalespersonProfileId
  /** Originating approved application (one-to-one). */
  applicationId: SalespersonApplicationId
  /** Person record the salesperson was provisioned as. */
  personId: string
  /** Recruiting influencer; null until recruited. */
  influencerId?: InfluencerProfileId | null
  /** 0..8 — current step in the training pipeline. */
  trainingStep: number
  trainingStatus: TrainingStatus
  /**
   * ISO 8601 timestamp at which the salesperson completed all required
   * training. Server-authoritative. Set exactly once — repeated
   * completion requests MUST NOT overwrite this value.
   *
   * Null until training transitions to 'completed'.
   */
  trainingCompletedAt?: ISO8601 | null
  /**
   * ISO 8601 timestamp of the first Friday strictly after
   * trainingCompletedAt. Null until training is completed.
   */
  meetingDate?: ISO8601 | null
  /**
   * Meeting lifecycle. Null until training is completed; 'scheduled' on
   * completion of training; 'completed' after the meeting occurs.
   */
  meetingStatus?: MeetingStatus
  /**
   * ISO 8601 timestamp at which the salesperson became operationally
   * active. CANONICAL MEANING: operational activation by the activation
   * authority. NOT set by training completion. NOT set by meeting
   * completion. Phase 2 owns this transition.
   */
  activeAt?: ISO8601 | null
  /** Admin-disabled — salesperson cannot earn commissions. */
  suspended: boolean
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── InfluencerProfile (§70–§73) ────────────────────────────────────────────────
/**
 * InfluencerProfile — admin-created only; recruits salespeople.
 *
 * Influencers earn override commissions on the sales attributed to their
 * recruited salespeople (§76). Lifecycle is admin-controlled.
 */
export interface InfluencerProfile {
  id: InfluencerProfileId
  /** The Person record that acts as the influencer. */
  personId: string
  /** Display handle / vanity name. */
  handle: string
  bio?: string | null
  /** Admin-controlled lifecycle: active ↔ suspended. */
  status: 'active' | 'suspended'
  /** Default override rate (0..1). CommissionRule rows can override. */
  defaultCommissionRate: number
  /** CommissionRule currently applied (cached FK). */
  activeCommissionRuleId?: CommissionRuleId | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── Package (§24, Phase 06) ────────────────────────────────────────────────────

/**
 * Package — commercial onboarding subscription package.
 *
 * Assigned by a salesperson to an enrolled client business. Drives the
 * commission split via the linked CommissionRule.
 */
export interface Package {
  id: PackageId
  businessId: BusinessId
  name: string
  /** Monthly package amount in KES. Minimum enforced at 600 KES. */
  amount: Money
  /** Salesperson who enrolled this client. */
  salespersonId: SalespersonProfileId
  /** Influencer who recruited the salesperson (if any). */
  influencerId?: InfluencerProfileId | null
  isActive: boolean
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── Commission calculation helpers (Phase 06) ─────────────────────────────────

const BASE_PACKAGE_AMOUNT = 600

/**
 * Commission split result for a given package amount.
 *
 * companyShare  = 500 + 25% × max(0, amount − 600)
 * salespersonShare = 100 + 75% × max(0, amount − 600)
 * influencerShare = 50 flat (paid BY COMPANY, not from client payment)
 */
export interface CommissionSplit {
  companyShare: Money
  salespersonShare: Money
  influencerShare: Money
  /** Always equals the input packageAmount. */
  total: Money
}

/**
 * Calculate the commission split for a given package amount.
 *
 * @param packageAmount - Monthly package amount in KES (must be ≥ 0)
 */
export function calculateCommission(packageAmount: Money): CommissionSplit {
  const base = BASE_PACKAGE_AMOUNT
  const excess = Math.max(0, packageAmount - base)
  const companyShare = 500 + 0.25 * excess
  const salespersonShare = 100 + 0.75 * excess
  const influencerShare = 50
  return {
    companyShare,
    salespersonShare,
    influencerShare,
    total: packageAmount,
  }
}

/**
 * CommissionRule — commercial Phase 06 commission rule.
 *
 * Attaches a concrete commission split to a specific business+ salesperson+influencer
 * combination, derived from a Package amount via `calculateCommission()`.
 */
export interface CommissionRuleCommercial {
  id: CommissionRuleId
  businessId: BusinessId
  /** The salesperson who enrolled the client. */
  salespersonId: SalespersonProfileId
  /** The influencer who recruited the salesperson (optional). */
  influencerId?: InfluencerProfileId | null
  /** Package amount this rule was computed from. */
  packageAmount: Money
  companyShare: Money
  salespersonShare: Money
  influencerShare: Money
  effectiveFrom: ISO8601
  effectiveTo?: ISO8601 | null
  status: 'active' | 'suspended'
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

/**
 * Create a Phase 06 CommissionRuleCommercial from a package amount.
 */
export function createCommissionRule(
  businessId: BusinessId,
  salespersonId: SalespersonProfileId,
  packageAmount: Money,
  influencerId?: InfluencerProfileId | null,
): Omit<CommissionRuleCommercial, 'id' | 'createdAt' | 'updatedAt' | 'version'> {
  const split = calculateCommission(packageAmount)
  const now: ISO8601 = new Date().toISOString()
  return {
    businessId,
    salespersonId,
    influencerId: influencerId ?? null,
    packageAmount,
    companyShare: split.companyShare,
    salespersonShare: split.salespersonShare,
    influencerShare: split.influencerShare,
    effectiveFrom: now,
    effectiveTo: null,
    status: 'active',
  }
}

// ── CommissionLedgerEntry (Phase 06) ──────────────────────────────────────────

export type CommissionRecipientType = 'company' | 'salesperson' | 'influencer'
export type CommissionLedgerEntryStatus = 'pending' | 'paid'

/**
 * CommissionLedgerEntry — a single commission payment record.
 *
 * Created per recipient (company / salesperson / influencer) per billing period.
 * Paid status is tracked separately per entry; the influencer entry is
 * always 50 KES (paid by company, not deducted from client payment).
 */
export interface CommissionLedgerEntry {
  id: CommissionLedgerId
  businessId: BusinessId
  subscriptionId: SubscriptionId
  commissionRuleId: CommissionRuleId
  /** Amount paid to this specific recipient. */
  amount: Money
  recipientType: CommissionRecipientType
  /** ID of the recipient (BusinessId | SalespersonProfileId | InfluencerProfileId). */
  recipientId: string
  /** Billing period in YYYY-MM format. */
  period: string
  status: CommissionLedgerEntryStatus
  paidAt?: ISO8601 | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}
