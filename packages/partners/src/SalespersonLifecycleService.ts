/**
 * SalespersonLifecycleService — canonical lifecycle mutations for
 * SalespersonProfile beyond application approval.
 *
 * Phase 03A scope:
 *   - completeTraining()      — caller-driven completion; sets trainingCompletedAt
 *                                server-side; schedules the meeting.
 *   - recordMeetingCompleted()— marks the scheduled meeting complete; preserves
 *                                meetingDate; does NOT touch activeAt.
 *
 * Out of scope for this phase:
 *   - activate() / setting activeAt. Phase 2 owns operational activation.
 *     Adding a second activate() here would create two authorities for the
 *     same field.
 *
 * INVARIANTS:
 *   1. trainingCompletedAt is set EXACTLY ONCE. Repeated completion is
 *      idempotent — the existing record is returned unchanged.
 *   2. activeAt is NEVER modified by completeTraining() or
 *      recordMeetingCompleted(). Phase 2 owns that transition.
 *   3. meetingDate is the first Friday STRICTLY AFTER trainingCompletedAt.
 *      If completion happens on a Friday, the meeting is scheduled for the
 *      following Friday.
 *   4. meetingStatus transitions scheduled → completed. Repeated completion
 *      is idempotent.
 *
 * Curriculum:
 *   The SDK does NOT embed a fixed step count (e.g. `trainingStep === 8`).
 *   The required curriculum is admin-controlled and dynamic. The caller
 *   passes the required video IDs and the completed video IDs; the service
 *   validates that every required ID is present in completed.
 */

import type { BusinessId, SalespersonProfileId, ISO8601 } from '@soostori/core'
import { newId, asIdempotencyKey } from '@soostori/core'
import type { SyncEngine, SyncEvent } from '@soostori/contracts'
import type {
  PartnerRepository,
  SalespersonProfileRecord,
} from './repository.js'
import {
  SALESPERSON_TRAINING_COMPLETED,
  SALESPERSON_MEETING_SCHEDULED,
  SALESPERSON_MEETING_COMPLETED,
} from '@soostori/events'

// ── Error types ───────────────────────────────────────────────────────────────

export class TrainingNotReadyError extends Error {
  constructor(public readonly missingVideoIds: string[]) {
    super(
      `Training not ready: ${missingVideoIds.length} required video(s) not completed: ` +
        `[${missingVideoIds.join(', ')}]`,
    )
    this.name = 'TrainingNotReadyError'
  }
}

export class MeetingNotScheduledError extends Error {
  constructor(public readonly currentStatus: string | null) {
    super(`Meeting is not in 'scheduled' state (current: ${currentStatus ?? 'null'})`)
    this.name = 'MeetingNotScheduledError'
  }
}

export class TrainingNotCompletedError extends Error {
  constructor(public readonly currentStatus: string) {
    super(`Training is not 'completed' (current: ${currentStatus}); cannot record meeting`)
    this.name = 'TrainingNotCompletedError'
  }
}

export class SalespersonProfileNotFoundError extends Error {
  constructor(id: string) {
    super(`SalespersonProfile ${id} not found`)
    this.name = 'SalespersonProfileNotFoundError'
  }
}

// ── Input types ──────────────────────────────────────────────────────────────

export interface CompleteTrainingInput {
  salespersonProfileId: SalespersonProfileId
  /** Required curriculum video IDs for this salesperson's audience. */
  requiredTrainingVideoIds: string[]
  /** Video IDs the salesperson has actually completed. */
  completedTrainingVideoIds: string[]
  /** Optional override for the completion timestamp (tests). Defaults to now. */
  now?: Date
}

export interface RecordMeetingCompletedInput {
  salespersonProfileId: SalespersonProfileId
  /** Optional override for the completion timestamp (tests). Defaults to now. */
  now?: Date
}

// ── nextFriday helper ────────────────────────────────────────────────────────

/**
 * First Friday strictly after the given timestamp.
 *
 * Examples (assuming 2026 Friday calendar):
 *   nextFriday('2026-09-17T10:00:00Z' [Thu]) = '2026-09-18T00:00:00Z' [Fri]
 *   nextFriday('2026-09-18T10:00:00Z' [Fri]) = '2026-09-25T00:00:00Z' [next Fri]
 *
 * The returned timestamp is at 00:00:00Z of that Friday in UTC. The exact
 * hour is not semantically meaningful — the contract is calendar-day only.
 */
export function nextFriday(after: ISO8601 | Date): ISO8601 {
  const ref = typeof after === 'string' ? new Date(after) : after
  // Clone so we don't mutate the input
  const d = new Date(Date.UTC(
    ref.getUTCFullYear(),
    ref.getUTCMonth(),
    ref.getUTCDate() + 1, // start strictly after
  ))
  // Walk forward until we hit Friday (UTC day-of-week: 5 = Friday).
  // Limit to 7 iterations to be safe.
  for (let i = 0; i < 7; i++) {
    if (d.getUTCDay() === 5) break
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return d.toISOString() as ISO8601
}

// ── Service ──────────────────────────────────────────────────────────────────

export class SalespersonLifecycleService {
  constructor(
    private readonly repo: PartnerRepository,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: string,
    private readonly userId?: string,
  ) {}

  /**
   * Mark training complete. Idempotent.
   *
   * Caller-driven completion: the service does not embed a fixed curriculum.
   * The caller passes the required video IDs (admin-configured) and the
   * completed video IDs (UI state). Validation: every required ID MUST be
   * present in completed, else TrainingNotReadyError.
   *
   * On first completion:
   *   trainingStatus       → 'completed'
   *   trainingCompletedAt  → server-side timestamp (now)
   *   meetingDate          → first Friday strictly after completion
   *   meetingStatus        → 'scheduled'
   *   activeAt             → UNCHANGED (Phase 2 owns this)
   *
   * Emits SALESPERSON_TRAINING_COMPLETED and SALESPERSON_MEETING_SCHEDULED.
   */
  async completeTraining(input: CompleteTrainingInput): Promise<SalespersonProfileRecord> {
    const profile = await this.repo.getSalespersonProfile(input.salespersonProfileId)
    if (!profile) throw new SalespersonProfileNotFoundError(input.salespersonProfileId)

    // Idempotency: if already completed, return existing.
    if (profile.trainingStatus === 'completed') {
      return profile
    }

    // Caller-driven validation: every required video must be completed.
    const completed = new Set(input.completedTrainingVideoIds)
    const missing = input.requiredTrainingVideoIds.filter((id) => !completed.has(id))
    if (missing.length > 0) {
      throw new TrainingNotReadyError(missing)
    }

    const now = (input.now ?? new Date()).toISOString() as ISO8601
    const meetingDate = nextFriday(now)

    const updated: SalespersonProfileRecord = {
      ...profile,
      trainingStatus: 'completed',
      trainingCompletedAt: now,
      meetingDate,
      meetingStatus: 'scheduled',
      // activeAt intentionally NOT modified.
      updatedAt: now,
      version: profile.version + 1,
    }

    await this.repo.upsertSalespersonProfile(updated)

    await this.emit(SALESPERSON_TRAINING_COMPLETED, {
      salespersonProfileId: profile.id,
      trainingCompletedAt: now,
      meetingDate,
    }, 'update')

    await this.emit(SALESPERSON_MEETING_SCHEDULED, {
      salespersonProfileId: profile.id,
      meetingDate,
    }, 'update')

    return updated
  }

  /**
   * Mark the scheduled meeting complete. Idempotent. Does NOT touch activeAt.
   *
   * Pre-conditions:
   *   trainingStatus === 'completed'
   *   meetingStatus === 'scheduled'
   *
   * On first completion:
   *   meetingStatus → 'completed'
   *   meetingDate   → UNCHANGED
   *   activeAt      → UNCHANGED
   */
  async recordMeetingCompleted(
    input: RecordMeetingCompletedInput,
  ): Promise<SalespersonProfileRecord> {
    const profile = await this.repo.getSalespersonProfile(input.salespersonProfileId)
    if (!profile) throw new SalespersonProfileNotFoundError(input.salespersonProfileId)

    if (profile.trainingStatus !== 'completed') {
      throw new TrainingNotCompletedError(profile.trainingStatus)
    }

    // Idempotency: if already completed, return existing.
    if (profile.meetingStatus === 'completed') {
      return profile
    }

    if (profile.meetingStatus !== 'scheduled') {
      throw new MeetingNotScheduledError(profile.meetingStatus ?? null)
    }

    const now = (input.now ?? new Date()).toISOString() as ISO8601

    const updated: SalespersonProfileRecord = {
      ...profile,
      meetingStatus: 'completed',
      // meetingDate and activeAt intentionally NOT modified.
      updatedAt: now,
      version: profile.version + 1,
    }

    await this.repo.upsertSalespersonProfile(updated)

    await this.emit(SALESPERSON_MEETING_COMPLETED, {
      salespersonProfileId: profile.id,
      meetingDate: profile.meetingDate ?? '',
    }, 'update')

    return updated
  }

  // ── Emit helper (mirrors PartnerService.emit pattern) ──────────────────────

  private async emit(
    eventType: string,
    payload: Record<string, unknown>,
    operation: SyncEvent['operation'],
  ): Promise<void> {
    const event: SyncEvent = {
      id: newId() as any,
      idempotencyKey: asIdempotencyKey(`${this.businessId}:${eventType}:${Date.now()}`),
      businessId: this.businessId,
      entityKind: 'salespersonProfile',
      entityId: (payload as any).salespersonProfileId ?? this.businessId,
      operation,
      originatingDeviceId: this.deviceId as any,
      originatingEmployeeId: this.userId as any,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: 1,
      payload,
      state: 'pending',
    }
    this.syncEngine.enqueue(event).catch(() => { /* non-critical */ })
  }
}
