/**
 * CommissionService — canonical commission calculation and earning management.
 *
 * PHASE 18 OWNERSHIP: This service owns ALL commission math. Web, Mobile,
 * and Desktop MUST NOT recalculate commissions independently.
 *
 * ── Canonical commission formula ─────────────────────────────────────────────
 *
 *   Company:      500 + 25% × max(0, amount − 600)
 *   Salesperson:  100 + 75% × max(0, amount − 600)
 *   Influencer:   50 flat (paid BY company separately, not from client payment)
 *
 * Examples:
 *   amount=0    → (company:500, salesperson:100, influencer:50)
 *   amount=600  → (company:500, salesperson:100, influencer:50)
 *   amount=1000 → (company:600, salesperson:400, influencer:50)
 *   amount=2000 → (company:850, salesperson:700, influencer:50)
 *
 * ── Commercial invariants ───────────────────────────────────────────────────
 *
 * INVARIANT 1 — Attribution immutability:
 *   The influencer attribution (influencerId) on a CommissionEarning is set
 *   at BusinessEnrollment time and is NEVER modified. No code path may
 *   retroactively change who recruited a salesperson.
 *
 * INVARIANT 2 — No duplicate earnings:
 *   The idempotencyKey = salespersonId + subscriptionId + role is enforced
 *   unique at the repository layer. A replay of conversion.qualified MUST
 *   NOT produce a second earning.
 *
 * INVARIANT 3 — Commission trigger is conversion ONLY:
 *   Assignment of a salesperson to a lead does NOT create a commission.
 *   CommissionEarning records are created ONLY when:
 *     Business enrollment exists AND subscription payment succeeds AND
 *     conversion becomes 'qualified'.
 *
 * INVARIANT 4 — Canonical formula in SDK only:
 *   Commission amounts come ONLY from this service. Web/Mobile/Desktop
 *   read from CommissionService output; they MUST NOT recalculate.
 *
 * INVARIANT 5 — Business isolation:
 *   All earnings queries are scoped by salespersonId or influencerId.
 *
 * INVARIANT 6 — Admin exceptional-case path:
 *   Reversals and dispute corrections go through admin API, not direct writes.
 */

import type { BusinessId, SalespersonProfileId, InfluencerProfileId, Money } from '@soostori/core'
import { newId } from '@soostori/core'
import type { SyncEngine } from '@soostori/contracts'
import type { PartnerRepository } from './repository.js'
import type { CommissionEarning, CommissionRole, RecordCommissionInput } from './types.js'
import {
  COMMISSION_CREATED,
} from '@soostori/events'

const BASE_AMOUNT = 600 as const
const COMPANY_BASE = 500 as const
const SALESPERSON_BASE = 100 as const
const INFLUENCER_FLAT = 50 as const

// ── Commission split result ───────────────────────────────────────────────────

export interface CommissionSplit {
  companyShare: Money
  salespersonShare: Money
  influencerFlat: Money
  total: Money
}

// ── CommissionService ─────────────────────────────────────────────────────────

export class CommissionService {
  constructor(
    private readonly repo: PartnerRepository,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: string,
    private readonly userId?: string,
  ) {}

  /**
   * Calculate the canonical commission split for a package amount.
   *
   * Use this when you need to show a preview of commission amounts
   * before an actual earning is recorded.
   */
  calculateSplit(amount: Money): CommissionSplit {
    const excess = Math.max(0, amount - BASE_AMOUNT)
    return {
      companyShare: (COMPANY_BASE + 0.25 * excess) as Money,
      salespersonShare: (SALESPERSON_BASE + 0.75 * excess) as Money,
      influencerFlat: INFLUENCER_FLAT as Money,
      total: amount,
    }
  }

  /**
   * Build the idempotency key for a commission earning.
   *
   * Format: commission:{salespersonId}:{subscriptionId}:{role}
   *
   * This composite key is unique per (salesperson, subscription, recipient).
   * A replay of the same conversion event with identical parameters will
   * produce the same key and be deduplicated by the repository.
   */
  buildIdempotencyKey(
    salespersonId: SalespersonProfileId,
    subscriptionId: string,
    role: CommissionRole,
  ): string {
    return `commission:${salespersonId}:${subscriptionId}:${role}`
  }

  /**
   * Record a commission earning for a salesperson after a qualified conversion.
   *
   * INVARIANT 2: Idempotent by idempotencyKey. If the key already exists,
   * returns the existing earning without creating a duplicate.
   *
   * INVARIANT 3: Called ONLY after conversion.qualified event is processed.
   * Callers are responsible for ensuring the conversion preconditions are met.
   *
   * INVARIANT 4: Amount is computed here using the canonical formula.
   */
  async recordSalespersonCommission(
    input: RecordCommissionInput,
    salespersonId: SalespersonProfileId,
    influencerId?: InfluencerProfileId | null,
  ): Promise<CommissionEarning> {
    const key = this.buildIdempotencyKey(salespersonId, input.subscriptionId, 'salesperson')

    // Check for existing earning (idempotent replay guard)
    const existing = await this.repo.getCommissionEarningByKey(key)
    if (existing) return existing

    const split = this.calculateSplit(input.subscriptionAmount)

    const earning: CommissionEarning = {
      id: newId(),
      salespersonProfileId: salespersonId,
      influencerProfileId: influencerId ?? null,
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      amount: split.salespersonShare,
      role: 'salesperson',
      idempotencyKey: key,
      createdAt: new Date().toISOString(),
    }

    const result = await this.repo.upsertCommissionEarning(earning)

    // Emit sync event — fire and forget; failure does not rollback earning
    this.syncEngine.enqueue({
      id: newId(),
      idempotencyKey: key,
      businessId: this.businessId,
      entityKind: 'commissionEarning',
      entityId: result.earning.id,
      operation: 'create',
      originatingDeviceId: this.deviceId as any,
      originatingEmployeeId: this.userId as any,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: 1,
      payload: earning as unknown as Record<string, unknown>,
      state: 'pending',
    }).catch(() => { /* non-critical */ })

    return result.earning
  }

  /**
   * Record the influencer attribution earning (50 KES flat) after a qualified conversion.
   *
   * INVARIANT 1: The influencerId attribution is set at BusinessEnrollment time
   * and is passed in here unchanged. It is NEVER modified by this method.
   *
   * INVARIANT 2: Idempotent by (salespersonId + subscriptionId + 'influencer') key.
   */
  async recordInfluencerCommission(
    input: RecordCommissionInput,
    salespersonId: SalespersonProfileId,
    influencerId: InfluencerProfileId,
  ): Promise<CommissionEarning> {
    const key = this.buildIdempotencyKey(salespersonId, input.subscriptionId, 'influencer')

    const existing = await this.repo.getCommissionEarningByKey(key)
    if (existing) return existing

    const earning: CommissionEarning = {
      id: newId(),
      salespersonProfileId: salespersonId,
      influencerProfileId: influencerId,
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      amount: INFLUENCER_FLAT as Money,
      role: 'influencer',
      idempotencyKey: key,
      createdAt: new Date().toISOString(),
    }

    const result = await this.repo.upsertCommissionEarning(earning)

    this.syncEngine.enqueue({
      id: newId(),
      idempotencyKey: key,
      businessId: this.businessId,
      entityKind: 'commissionEarning',
      entityId: result.earning.id,
      operation: 'create',
      originatingDeviceId: this.deviceId as any,
      originatingEmployeeId: this.userId as any,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: 1,
      payload: earning as unknown as Record<string, unknown>,
      state: 'pending',
    }).catch(() => { /* non-critical */ })

    return result.earning
  }

  /**
   * List all earnings for a salesperson, scoped to this business.
   *
   * INVARIANT 5: Results are filtered by salespersonId. A salesperson can
   * only see their own earnings.
   */
  listSalespersonEarnings(salespersonId: SalespersonProfileId): Promise<CommissionEarning[]> {
    return this.repo.listEarningsBySalesperson(salespersonId)
  }

  /**
   * List all attribution earnings for an influencer, scoped to this business.
   *
   * INVARIANT 5: Results are filtered by influencerId. An influencer can
   * only see earnings attributed to their recruited salespeople.
   */
  listInfluencerEarnings(influencerId: InfluencerProfileId): Promise<CommissionEarning[]> {
    return this.repo.listEarningsByInfluencer(influencerId)
  }
}
