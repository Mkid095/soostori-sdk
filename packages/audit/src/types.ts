/**
 * Audit log — immutable record of sensitive business actions.
 *
 * Audit entries MUST be append-only. Never updated or deleted by application code.
 * Compliance/regulatory requirements may apply.
 */

import type { SoostoriEvent, SoostoriEventName } from '@soostori/events'
import type { UUID, ISO8601 } from '@soostori/core'

/** Audit log entry. */
export interface AuditEntry {
  id: UUID
  /** Event that caused this audit entry. */
  eventId: UUID
  /** Event name (denormalized for query). */
  eventName: SoostoriEventName
  /** Actor — the user or system that performed the action. */
  actorId: UUID | null
  /** Actor type. */
  actorType: 'user' | 'employee' | 'system' | 'integration'
  /** Entity affected. */
  entityType: string
  entityId: string
  /** What happened (action verb). */
  action: string
  /** Before snapshot — null for create events. */
  before: Record<string, unknown> | null
  /** After snapshot — null for delete events. */
  after: Record<string, unknown> | null
  /** Reason (for deletions/refunds/etc). */
  reason: string | null
  /** IP address / device info (if available). */
  context: Record<string, unknown> | null
  timestamp: ISO8601
}

/** Storage interface — append-only. */
export interface AuditStorage {
  append(entry: AuditEntry): Promise<void>
  query(filter: AuditFilter): Promise<AuditEntry[]>
  /** Count entries by event type — for reporting. */
  countByEventName(filter: AuditFilter): Promise<Record<string, number>>
}

export interface AuditFilter {
  startTime?: ISO8601
  endTime?: ISO8601
  actorId?: UUID
  eventName?: SoostoriEventName
  entityType?: string
  entityId?: string
}

/** Errors. */
export class AuditAppendError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuditAppendError'
  }
}
