/**
 * Canonical entity contract — Part 4a: Subscription / SalespersonApplication /
 * SalespersonProfile / InfluencerProfile.
 *
 * §19–§24, §45, §70–§73 of the Soostori vision.
 */

import type {
  BusinessId, SubscriptionId, PlanId, SalespersonApplicationId,
  SalespersonProfileId, InfluencerProfileId, CommissionRuleId,
  UserId,
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
 * SalespersonApplication — applicant onboarding state machine.
 *
 * Lifecycle: draft → submitted → under_review ↔ documents_required
 *          → approved | rejected | withdrawn.
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
 * SalespersonProfile — created on SalespersonApplication approval.
 *
 * Training is a 9-step pipeline (steps 0–8). `trainingStep` is the user's
 * position; `trainingStatus` is the high-level state.
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
  /** When the salesperson became active (i.e. completed training). */
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
