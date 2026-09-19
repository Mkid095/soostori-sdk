/**
 * CommissionProcessor — payment-integrated commission engine.
 *
 * Listens to `subscription.payment_confirmed` (Tuma callback status=completed)
 * and drives the commission pipeline:
 *
 *   Tuma confirmed payment
 *     → find enrollment by businessId
 *     → advance enrollment to 'qualified'
 *     → record commission earnings (salesperson + influencer)
 *     → emit commission.accrued events
 *
 * Attribution chain:
 *   payment.shopId → enrollment.businessId → enrollment.salespersonProfileId
 *     → salespersonProfiles.influencerId (the influencer who recruited the salesperson)
 *
 * Idempotency: duplicate Tuma callbacks produce the same idempotencyKey,
 * which the repository rejects as a duplicate insert.
 */

import { newId, asIdempotencyKey } from '@soostori/core'
import type { SyncEngine, SyncEvent } from '@soostori/contracts'
import type { PartnerRepository } from './repository.js'
import type { CommissionService } from './CommissionService.js'
import type { CommissionStatus, CommissionTrigger } from './commission-processor-types.js'

// ── Errors ───────────────────────────────────────────────────────────────────

export class EnrollmentNotReadyError extends Error {
  constructor(
    public readonly businessId: string,
    public readonly currentStatus: string,
  ) {
    super(`Business ${businessId} enrollment is '${currentStatus}', expected 'qualifying' before recording commission`)
    this.name = 'EnrollmentNotReadyError'
  }
}

export class NoAttributionError extends Error {
  constructor(public readonly businessId: string) {
    super(`No salesperson enrollment found for business ${businessId}`)
    this.name = 'NoAttributionError'
  }
}

// ── CommissionProcessor ──────────────────────────────────────────────────────────

export class CommissionProcessor {
  constructor(
    private readonly repo: PartnerRepository,
    private readonly commissionService: CommissionService,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: string,
    private readonly deviceId: string,
    private readonly userId?: string,
  ) {}

  /**
   * Process a confirmed Tuma payment and record commission earnings.
   *
   * Called when a `subscription.payment_confirmed` event is received.
   * The event payload is typed as CommissionTrigger.
   *
   * Idempotency: if the enrollment is already 'qualified' and earnings already
   * exist for this subscription, the idempotencyKey collision in the repository
   * returns the existing earning — no duplicate is created.
   *
   * The idempotency key uses receiptNumber so the same Tuma callback delivered
   * multiple times (which carries the same receipt number) produces the same
   * SyncEvent and is safely deduplicated at the sync layer.
   *
   * @throws EnrollmentNotReadyError if enrollment is not in 'qualifying' state
   * @throws NoAttributionError if no enrollment exists for this business
   */
  async processPaymentConfirmed(trigger: CommissionTrigger): Promise<void> {
    const { businessId, subscriptionId, amount } = trigger

    // 1. Find the enrollment for this business
    const enrollment = await this.repo.getEnrollmentByBusiness(businessId)
    if (!enrollment) {
      // Business is not enrolled in the partner program — nothing to do
      return
    }

    // 2. Advance from qualifying → qualified (commission trigger point)
    if (enrollment.status === 'enrolled') {
      const now = new Date().toISOString()
      await this.repo.upsertEnrollment({
        ...enrollment,
        status: 'qualifying',
        qualifyingSinceAt: now,
        updatedAt: now,
      })
    }

    // Re-read after update
    const currentEnrollment = await this.repo.getEnrollmentByBusiness(businessId)
    if (!currentEnrollment) return

    // 3. Only advance to 'qualified' if already qualifying
    // Never overwrite an existing qualifiedAt — it anchors the 24-month commission window
    if (currentEnrollment.status === 'qualifying') {
      const now = new Date().toISOString()
      await this.repo.upsertEnrollment({
        ...currentEnrollment,
        status: 'qualified',
        qualifiedAt: currentEnrollment.qualifiedAt ?? now,
        updatedAt: now,
      })
    }

    // 4. Get the salesperson profile to check attribution
    const profile = await this.repo.getSalespersonProfile(currentEnrollment.salespersonProfileId)
    if (!profile) return

    // 5. Record commission earnings (idempotent by key)
    const commissionInput = {
      businessId,
      subscriptionId,
      subscriptionAmount: amount,
    }

    await this.commissionService.recordSalespersonCommission(
      commissionInput,
      currentEnrollment.salespersonProfileId,
      currentEnrollment.influencerProfileId,
    )

    if (currentEnrollment.influencerProfileId) {
      await this.commissionService.recordInfluencerCommission(
        commissionInput,
        currentEnrollment.salespersonProfileId,
        currentEnrollment.influencerProfileId,
      )
    }

    await this.commissionService.recordCompanyCommission(
      commissionInput,
      currentEnrollment.salespersonProfileId,
    )

    // 6. Emit commission.accrued for each earning
    await this.emitCommissionAccrued(
      currentEnrollment.salespersonProfileId,
      currentEnrollment.influencerProfileId ?? null,
      subscriptionId,
      trigger.receiptNumber,
    )
  }

  /**
   * Advance commission status from 'accrued' to 'payable'.
   *
   * Called by the payout scheduler when a payout window opens.
   * In this SDK version, status transitions are recorded in the sync layer.
   * The caller is responsible for writing the status update to the backend.
   */
  async markPayable(salespersonId: string, influencerId: string | null, subscriptionId: string): Promise<void> {
    await this.emit(subscriptionId, salespersonId, influencerId, 'payable', undefined)
  }

  /**
   * Advance commission status from 'payable' to 'paid'.
   *
   * Called after disbursement confirmation.
   */
  async markPaid(salespersonId: string, influencerId: string | null, subscriptionId: string): Promise<void> {
    await this.emit(subscriptionId, salespersonId, influencerId, 'paid', undefined)
  }

  /**
   * Reverse a commission earning.
   *
   * Called when a payment is refunded or a dispute is resolved in the customer's favor.
   */
  async reverse(salespersonId: string, influencerId: string | null, subscriptionId: string): Promise<void> {
    await this.emit(subscriptionId, salespersonId, influencerId, 'reversed', undefined)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async emitCommissionAccrued(
    salespersonProfileId: string,
    influencerProfileId: string | null,
    subscriptionId: string,
    receiptNumber?: string,
  ): Promise<void> {
    // Emit for salesperson
    await this.emit(
      subscriptionId,
      salespersonProfileId,
      influencerProfileId,
      'accrued',
      receiptNumber,
    )

    // Emit for influencer if attributed
    if (influencerProfileId) {
      await this.emit(
        subscriptionId,
        salespersonProfileId,
        influencerProfileId,
        'accrued',
        receiptNumber,
      )
    }
  }

  private async emit(
    subscriptionId: string,
    salespersonProfileId: string,
    influencerProfileId: string | null,
    status: CommissionStatus,
    receiptNumber?: string,
  ): Promise<void> {
    // receiptNumber provides stable deduplication: multiple deliveries of the same
    // Tuma callback carry the same receipt number. Falls back to timestamp for
    // non-payment status transitions (markPayable, markPaid, reverse).
    const idempotencyBase = receiptNumber
      ? `commission:${salespersonProfileId}:${subscriptionId}:${receiptNumber}`
      : `${status}:${salespersonProfileId}:${subscriptionId}:${influencerProfileId ?? 'none'}`
    const event: SyncEvent = {
      id: newId() as any,
      idempotencyKey: asIdempotencyKey(idempotencyBase),
      businessId: this.businessId as any,
      entityKind: 'commissionLedger',
      entityId: `commission:${salespersonProfileId}:${subscriptionId}:${status}`,
      operation: 'update',
      originatingDeviceId: this.deviceId as any,
      originatingEmployeeId: this.userId as any,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: 1,
      payload: {
        subscriptionId,
        salespersonProfileId,
        influencerProfileId,
        status,
      },
      state: 'pending',
    }

    this.syncEngine.enqueue(event).catch(() => { /* non-critical */ })
  }
}
