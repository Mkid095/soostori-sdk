/**
 * Audit recorder — converts SoostoriEvents to audit entries.
 *
 * Subscribes to the event bus and emits audit entries.
 */

import type { AuditEntry, AuditStorage, AuditFilter } from './types'
import type { SoostoriEvent, SoostoriEventName } from '@soostori/events'
import type { UUID } from '@soostori/core'
import { newId } from '@soostori/core'

/** Events that should produce audit entries. */
const AUDITABLE_EVENTS: readonly SoostoriEventName[] = [
  'sale.confirmed', 'sale.rejected', 'sale.refunded',
  'product.created', 'product.updated', 'product.deleted', 'product.price_changed',
  'customer.created', 'customer.updated', 'customer.flagged',
  'debt.created', 'debt.payment_recorded', 'debt.written_off',
  'auth.login', 'auth.logout', 'auth.failed',
  'auth.invitation_created', 'auth.invitation_accepted',
  'device.registered', 'device.revoked', 'device.host_transfer',
  'subscription.payment_confirmed', 'subscription.cancelled',
  'audit.user_action', 'audit.permission_denied',
  'audit.data_exported', 'audit.data_deleted',
] as const

const EVENT_TO_ACTION: Record<string, string> = {
  'sale.confirmed': 'sale.complete',
  'sale.rejected': 'sale.reject',
  'sale.refunded': 'sale.refund',
  'product.created': 'product.create',
  'product.updated': 'product.update',
  'product.deleted': 'product.delete',
  'product.price_changed': 'product.price_change',
  'customer.created': 'customer.create',
  'customer.updated': 'customer.update',
  'customer.flagged': 'customer.flag',
  'debt.created': 'debt.create',
  'debt.payment_recorded': 'debt.payment',
  'debt.written_off': 'debt.write_off',
  'auth.login': 'auth.login',
  'auth.logout': 'auth.logout',
  'auth.failed': 'auth.fail',
  'auth.invitation_created': 'auth.invite_create',
  'auth.invitation_accepted': 'auth.invite_accept',
  'device.registered': 'device.register',
  'device.revoked': 'device.revoke',
  'device.host_transfer': 'device.transfer',
  'subscription.payment_confirmed': 'subscription.pay',
  'subscription.cancelled': 'subscription.cancel',
  'audit.user_action': 'user.action',
  'audit.permission_denied': 'user.permission_denied',
  'audit.data_exported': 'data.export',
  'audit.data_deleted': 'data.delete',
}

export class AuditRecorder {
  constructor(private readonly storage: AuditStorage) {}

  /** Subscribe to the event bus and record auditable events. */
  attach(getEventBus: () => { on(name: string, handler: (e: SoostoriEvent) => void): () => void }) {
    const unsubs: Array<() => void> = []
    for (const name of AUDITABLE_EVENTS) {
      const unsub = getEventBus().on(name, (e) => {
        void this.record(e).catch(err => console.error('Audit record failed:', err))
      })
      unsubs.push(unsub)
    }
    return () => { for (const u of unsubs) u() }
  }

  /** Manually record an event (useful for non-event-driven actions). */
  async record(event: SoostoriEvent): Promise<AuditEntry> {
    if (!AUDITABLE_EVENTS.includes(event.name)) {
      throw new Error(`Event ${event.name} is not auditable`)
    }
    const entry: AuditEntry = {
      id: newId() as UUID,
      eventId: event.id as UUID,
      eventName: event.name,
      actorId: event.userId ?? null,
      actorType: event.userId ? 'user' : 'system',
      entityType: event.entity ?? 'unknown',
      entityId: event.entityId ?? '',
      action: EVENT_TO_ACTION[event.name] ?? event.name,
      before: null,
      after: event.payload as Record<string, unknown>,
      reason: null,
      context: { deviceId: event.deviceId, source: event.source },
      timestamp: event.timestamp,
    }
    await this.storage.append(entry)
    return entry
  }

  async query(filter: AuditFilter): Promise<AuditEntry[]> {
    return this.storage.query(filter)
  }
}
