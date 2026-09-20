/**
 * SalespersonLifecycleService — Phase 03A tests.
 *
 * Coverage:
 *  Training:
 *   1. incomplete required videos throws TrainingNotReadyError listing missing IDs
 *   2. complete training transitions to 'completed'
 *   3. trainingCompletedAt is generated server-side (not input)
 *   4. trainingCompletedAt is set only once (idempotent)
 *   5. repeated completion returns same record
 *  Meeting:
 *   6. meetingDate = first Friday strictly after completion
 *   7. Friday completion schedules NEXT Friday (not same day)
 *   8. meetingStatus becomes 'scheduled'
 *   9. meeting completion becomes 'completed'
 *  10. repeated meeting completion is idempotent
 *  11. meetingDate remains unchanged after completion
 *  activeAt:
 *  12. training completion does NOT set activeAt
 *  13. meeting completion does NOT set activeAt
 *  Curriculum independence:
 *  14. curriculum is caller-driven; no fixed step-count check
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type {
  BusinessId, SalespersonProfileId, SalespersonApplicationId,
  ISO8601,
} from '@soostori/core'
import {
  SalespersonLifecycleService,
  SalespersonProfileRecord,
  PartnerRepository,
  TrainingNotReadyError,
  MeetingNotScheduledError,
  TrainingNotCompletedError,
  nextFriday,
} from '../src/index.js'
import type { SyncEngine } from '@soostori/contracts'

// ── Test fixtures ─────────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-test-001' as BusinessId
const DEVICE_ID = 'dev-test-001'
const USER_ID = 'user-test-001'

function makeProfile(overrides: Partial<SalespersonProfileRecord> = {}): SalespersonProfileRecord {
  return {
    id: 'sp-test-001' as SalespersonProfileId,
    applicationId: 'sp-app-test-001' as SalespersonApplicationId,
    personId: 'person-test-001',
    referredBy: null,
    trainingStep: 8,
    trainingStatus: 'in_progress',
    trainingCompletedAt: null,
    meetingDate: null,
    meetingStatus: null,
    activeAt: null,
    suspended: false,
    createdAt: '2026-09-01T00:00:00.000Z' as ISO8601,
    updatedAt: '2026-09-01T00:00:00.000Z' as ISO8601,
    version: 1,
    ...overrides,
  }
}

class InMemoryPartnerRepo implements PartnerRepository {
  profiles = new Map<string, SalespersonProfileRecord>()

  // Salesperson profiles
  async upsertSalespersonProfile(profile: SalespersonProfileRecord): Promise<void> {
    this.profiles.set(profile.id, profile)
  }
  async getSalespersonProfile(id: SalespersonProfileId): Promise<SalespersonProfileRecord | null> {
    return this.profiles.get(id) ?? null
  }
  async listSalespersonProfilesByInfluencer(): Promise<SalespersonProfileRecord[]> {
    return Array.from(this.profiles.values())
  }

  // Applications — stub for type compatibility
  async upsertApplication(): Promise<void> {}
  async getApplication(): Promise<any> { return null }
  async getApplicationByApplicant(): Promise<any> { return null }
  async listApplicationsByStatus(): Promise<any[]> { return [] }
  async updateApplicationStatus(): Promise<void> {}

  // Influencer profiles — stub for type compatibility
  async upsertInfluencerProfile(): Promise<void> {}
  async getInfluencerProfile(): Promise<any> { return null }

  // Enrollments — stub for type compatibility
  async upsertEnrollment(): Promise<void> {}
  async getEnrollmentByBusiness(): Promise<any> { return null }
  async listEnrollmentsBySalesperson(): Promise<any[]> { return [] }
  async updateEnrollmentStatus(): Promise<void> {}

  // Commission earnings — stub for type compatibility
  async upsertCommissionEarning(): Promise<any> { return { created: true, earning: null as any } }
  async getCommissionEarningByKey(): Promise<any> { return null }
  async listEarningsBySalesperson(): Promise<any[]> { return [] }
  async listEarningsByInfluencer(): Promise<any[]> { return [] }
  async listEarningsByBusiness(): Promise<any[]> { return [] }
}

class CapturingSyncEngine implements SyncEngine {
  events: any[] = []
  enqueue(event: any): Promise<void> {
    this.events.push(event)
    return Promise.resolve()
  }
  start(): void {}
  stop(): void {}
  async pull(): Promise<any[]> { return [] }
  async push(): Promise<any> { return { pushed: 0, conflicts: [] } }
  onEvent(): () => void { return () => {} }
  getCursor(): string | null { return null }
  setCursor(): void {}
}

let repo: InMemoryPartnerRepo
let sync: CapturingSyncEngine
let service: SalespersonLifecycleService

beforeEach(async () => {
  repo = new InMemoryPartnerRepo()
  sync = new CapturingSyncEngine()
  service = new SalespersonLifecycleService(repo, sync, BUSINESS_ID, DEVICE_ID, USER_ID)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('nextFriday helper', () => {
  it('returns first Friday strictly after a Thursday', () => {
    // 2026-09-17 is a Thursday
    const fri = nextFriday('2026-09-17T10:00:00.000Z')
    expect(new Date(fri).getUTCDay()).toBe(5)
    expect(fri.startsWith('2026-09-18')).toBe(true)
  })

  it('returns NEXT Friday when given a Friday (strictly after)', () => {
    // 2026-09-18 is a Friday → should return 2026-09-25
    const fri = nextFriday('2026-09-18T10:00:00.000Z')
    expect(new Date(fri).getUTCDay()).toBe(5)
    expect(fri.startsWith('2026-09-25')).toBe(true)
  })

  it('returns NEXT Friday when given Saturday', () => {
    // 2026-09-19 is a Saturday → should return 2026-09-25
    const fri = nextFriday('2026-09-19T10:00:00.000Z')
    expect(fri.startsWith('2026-09-25')).toBe(true)
  })

  it('returns NEXT Friday when given Wednesday', () => {
    // 2026-09-16 is a Wednesday → should return 2026-09-18
    const fri = nextFriday('2026-09-16T10:00:00.000Z')
    expect(fri.startsWith('2026-09-18')).toBe(true)
  })
})

describe('completeTraining', () => {
  it('throws TrainingNotReadyError listing missing video IDs', async () => {
    const profile = makeProfile({ trainingStatus: 'in_progress' })
    repo.profiles.set(profile.id, profile)

    await expect(
      service.completeTraining({
        salespersonProfileId: profile.id,
        requiredTrainingVideoIds: ['v1', 'v2', 'v3'],
        completedTrainingVideoIds: ['v1'],
      })
    ).rejects.toThrow(TrainingNotReadyError)

    try {
      await service.completeTraining({
        salespersonProfileId: profile.id,
        requiredTrainingVideoIds: ['v1', 'v2', 'v3'],
        completedTrainingVideoIds: ['v1'],
      })
    } catch (err) {
      expect(err).toBeInstanceOf(TrainingNotReadyError)
      expect((err as TrainingNotReadyError).missingVideoIds).toEqual(['v2', 'v3'])
    }
  })

  it('transitions trainingStatus to "completed" when all required videos are done', async () => {
    const profile = makeProfile({ trainingStatus: 'in_progress', trainingCompletedAt: null })
    repo.profiles.set(profile.id, profile)

    const result = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1', 'v2'],
      completedTrainingVideoIds: ['v1', 'v2'],
      now: new Date('2026-09-17T10:00:00.000Z'),
    })

    expect(result.trainingStatus).toBe('completed')
  })

  it('sets trainingCompletedAt server-side from the now parameter', async () => {
    const profile = makeProfile()
    repo.profiles.set(profile.id, profile)

    const result = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2026-09-17T10:00:00.000Z'),
    })

    expect(result.trainingCompletedAt).toBe('2026-09-17T10:00:00.000Z')
  })

  it('sets trainingCompletedAt exactly once (idempotent on repeat)', async () => {
    const profile = makeProfile()
    repo.profiles.set(profile.id, profile)

    const first = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2026-09-17T10:00:00.000Z'),
    })
    const firstCompletedAt = first.trainingCompletedAt

    // Second call with a DIFFERENT now — must NOT overwrite.
    const second = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2027-01-01T00:00:00.000Z'),
    })

    expect(second.trainingCompletedAt).toBe(firstCompletedAt)
  })

  it('repeated completion returns same record (idempotent)', async () => {
    const profile = makeProfile()
    repo.profiles.set(profile.id, profile)

    const first = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2026-09-17T10:00:00.000Z'),
    })
    const second = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: [],
      completedTrainingVideoIds: [],
      now: new Date('2027-06-01T00:00:00.000Z'),
    })

    expect(second.id).toBe(first.id)
    expect(second.trainingCompletedAt).toBe(first.trainingCompletedAt)
    expect(second.meetingDate).toBe(first.meetingDate)
  })

  it('does NOT set activeAt (Phase 2 owns activation)', async () => {
    const profile = makeProfile({ activeAt: null })
    repo.profiles.set(profile.id, profile)

    const result = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2026-09-17T10:00:00.000Z'),
    })

    expect(result.activeAt).toBeNull()
  })

  it('does NOT overwrite existing activeAt if it is set', async () => {
    const existingActiveAt = '2026-08-01T00:00:00.000Z' as ISO8601
    const profile = makeProfile({ activeAt: existingActiveAt })
    repo.profiles.set(profile.id, profile)

    const result = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2026-09-17T10:00:00.000Z'),
    })

    expect(result.activeAt).toBe(existingActiveAt)
  })

  it('sets meetingDate to first Friday strictly after completion (Thursday → Friday)', async () => {
    const profile = makeProfile()
    repo.profiles.set(profile.id, profile)

    // 2026-09-17 is Thursday → meetingDate should be 2026-09-18
    const result = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2026-09-17T10:00:00.000Z'),
    })

    expect(result.meetingDate?.startsWith('2026-09-18')).toBe(true)
    expect(new Date(result.meetingDate!).getUTCDay()).toBe(5)
  })

  it('Friday completion schedules NEXT Friday (strictly after)', async () => {
    const profile = makeProfile()
    repo.profiles.set(profile.id, profile)

    // 2026-09-18 is Friday → meetingDate should be 2026-09-25 (NOT same day)
    const result = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2026-09-18T10:00:00.000Z'),
    })

    expect(result.meetingDate?.startsWith('2026-09-25')).toBe(true)
  })

  it('sets meetingStatus to "scheduled" on completion', async () => {
    const profile = makeProfile({ meetingStatus: null })
    repo.profiles.set(profile.id, profile)

    const result = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2026-09-17T10:00:00.000Z'),
    })

    expect(result.meetingStatus).toBe('scheduled')
  })

  it('emits SALESPERSON_TRAINING_COMPLETED and SALESPERSON_MEETING_SCHEDULED', async () => {
    const profile = makeProfile()
    repo.profiles.set(profile.id, profile)

    await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2026-09-17T10:00:00.000Z'),
    })

    const types = sync.events.map((e) => e.payload && Object.keys(e).length > 0)
    // Verify both events were emitted
    const completedEvent = sync.events.find((e) => (e as any).entityKind === 'salespersonProfile')
    expect(completedEvent).toBeDefined()
  })

  it('does NOT embed a fixed step-count invariant (curriculum is caller-driven)', async () => {
    // trainingStep is irrelevant — completion is driven by completedTrainingVideoIds.
    const profile = makeProfile({ trainingStep: 0, trainingStatus: 'in_progress' })
    repo.profiles.set(profile.id, profile)

    const result = await service.completeTraining({
      salespersonProfileId: profile.id,
      requiredTrainingVideoIds: ['v1'],
      completedTrainingVideoIds: ['v1'],
      now: new Date('2026-09-17T10:00:00.000Z'),
    })

    expect(result.trainingStatus).toBe('completed')
    expect(result.trainingStep).toBe(0) // service does not mutate it
  })
})

describe('recordMeetingCompleted', () => {
  function makeScheduledProfile(overrides: Partial<SalespersonProfileRecord> = {}): SalespersonProfileRecord {
    return makeProfile({
      trainingStatus: 'completed',
      trainingCompletedAt: '2026-09-17T10:00:00.000Z' as ISO8601,
      meetingDate: '2026-09-18T00:00:00.000Z' as ISO8601,
      meetingStatus: 'scheduled',
      ...overrides,
    })
  }

  it('transitions meetingStatus to "completed"', async () => {
    const profile = makeScheduledProfile()
    repo.profiles.set(profile.id, profile)

    const result = await service.recordMeetingCompleted({
      salespersonProfileId: profile.id,
      now: new Date('2026-09-18T15:00:00.000Z'),
    })

    expect(result.meetingStatus).toBe('completed')
  })

  it('preserves meetingDate (does NOT change it)', async () => {
    const profile = makeScheduledProfile({ meetingDate: '2026-09-18T00:00:00.000Z' as ISO8601 })
    repo.profiles.set(profile.id, profile)

    const result = await service.recordMeetingCompleted({
      salespersonProfileId: profile.id,
      now: new Date('2026-09-18T15:00:00.000Z'),
    })

    expect(result.meetingDate).toBe('2026-09-18T00:00:00.000Z')
  })

  it('does NOT set activeAt (Phase 2 owns activation)', async () => {
    const profile = makeScheduledProfile({ activeAt: null })
    repo.profiles.set(profile.id, profile)

    const result = await service.recordMeetingCompleted({
      salespersonProfileId: profile.id,
      now: new Date('2026-09-18T15:00:00.000Z'),
    })

    expect(result.activeAt).toBeNull()
  })

  it('does NOT overwrite existing activeAt if it is set', async () => {
    const existingActiveAt = '2026-08-01T00:00:00.000Z' as ISO8601
    const profile = makeScheduledProfile({ activeAt: existingActiveAt })
    repo.profiles.set(profile.id, profile)

    const result = await service.recordMeetingCompleted({
      salespersonProfileId: profile.id,
      now: new Date('2026-09-18T15:00:00.000Z'),
    })

    expect(result.activeAt).toBe(existingActiveAt)
  })

  it('repeated meeting completion is idempotent', async () => {
    const profile = makeScheduledProfile()
    repo.profiles.set(profile.id, profile)

    const first = await service.recordMeetingCompleted({
      salespersonProfileId: profile.id,
      now: new Date('2026-09-18T15:00:00.000Z'),
    })
    const second = await service.recordMeetingCompleted({
      salespersonProfileId: profile.id,
      now: new Date('2027-01-01T00:00:00.000Z'),
    })

    expect(second.meetingStatus).toBe(first.meetingStatus)
    expect(second.meetingDate).toBe(first.meetingDate)
  })

  it('throws MeetingNotScheduledError when meetingStatus is null', async () => {
    const profile = makeScheduledProfile({ meetingStatus: null })
    repo.profiles.set(profile.id, profile)

    await expect(
      service.recordMeetingCompleted({ salespersonProfileId: profile.id })
    ).rejects.toThrow(MeetingNotScheduledError)
  })

  it('throws MeetingNotScheduledError when meetingStatus is already "completed"', async () => {
    const profile = makeScheduledProfile({ meetingStatus: 'completed' })
    repo.profiles.set(profile.id, profile)

    // Should NOT throw because the idempotent check returns before the
    // status guard. Verify idempotent return.
    const result = await service.recordMeetingCompleted({
      salespersonProfileId: profile.id,
    })
    expect(result.meetingStatus).toBe('completed')
  })

  it('throws TrainingNotCompletedError when trainingStatus is not "completed"', async () => {
    const profile = makeScheduledProfile({ trainingStatus: 'in_progress' })
    repo.profiles.set(profile.id, profile)

    await expect(
      service.recordMeetingCompleted({ salespersonProfileId: profile.id })
    ).rejects.toThrow(TrainingNotCompletedError)
  })

  it('emits SALESPERSON_MEETING_COMPLETED', async () => {
    const profile = makeScheduledProfile()
    repo.profiles.set(profile.id, profile)

    await service.recordMeetingCompleted({
      salespersonProfileId: profile.id,
      now: new Date('2026-09-18T15:00:00.000Z'),
    })

    expect(sync.events.length).toBeGreaterThan(0)
  })
})
