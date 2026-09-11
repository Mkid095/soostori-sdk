/**
 * Phase 17 — NotificationEvent types, enums, and interfaces.
 *
 * Canonical NotificationEvent flows:
 *   Business Event → NotificationService → channels → user devices
 *
 * Each NotificationEvent carries an eventType drawn from this enum,
 * a priority, a payload, and one or more delivery channels.
 */

import type { ISO8601, UUID } from '@soostori/core'

// ── Event Types ─────────────────────────────────────────────────────────────

/**
 * Every notification-capable event in the system.
 * Mapped from SyncEvent emit points in SaleService, DebtService, etc.
 */
export const NotificationEventType = {
  // Commerce
  SALE_CREATED:              'sale.created',
  SALE_REFUNDED:             'sale.refunded',
  DEBT_CREATED:              'debt.created',
  DEBT_PAYMENT_RECORDED:     'debt.payment_recorded',
  DEBT_SETTLED:              'debt.settled',
  EXPENSE_CREATED:           'expense.created',
  EXPENSE_APPROVED:          'expense.approved',
  EXPENSE_PAID:              'expense.paid',
  // Inventory
  INVENTORY_LOW_STOCK:       'inventory.low_stock',
  INVENTORY_RECEIVED:        'inventory.received',
  INVENTORY_ADJUSTED:        'inventory.adjusted',
  // Team
  TEAM_INVITATION_SENT:      'team.invitation_sent',
  TEAM_MEMBER_ADDED:         'team.member_added',
  TEAM_ROLE_CHANGED:         'team.role_changed',
  // Device
  DEVICE_ENROLLED:           'device.enrolled',
  DEVICE_APPROVED:           'device.approved',
  DEVICE_REVOKED:            'device.revoked',
  DEVICE_PRIMARY_CHANGED:    'device.primary_changed',
  // Commercial
  COMMISSION_CREATED:        'commission.created',
  COMMISSION_PAID:           'commission.paid',
} as const

export type NotificationEventType = typeof NotificationEventType[keyof typeof NotificationEventType]

export const ALL_NOTIFICATION_EVENT_TYPES = Object.values(NotificationEventType)

// ── Channel names ────────────────────────────────────────────────────────────

/** Delivery channel identifiers. */
export const NotificationChannelName = {
  IN_APP:     'in_app',
  EMAIL:      'email',
  WHATSAPP:   'whatsapp',
  EXPO_PUSH:  'expo_push',
} as const

export type NotificationChannelName = typeof NotificationChannelName[keyof typeof NotificationChannelName]

// ── NotificationEvent ─────────────────────────────────────────────────────────

export interface NotificationEvent {
  id: string
  businessId: string
  /** Maps to a NotificationEventType value. */
  eventType: NotificationEventType
  /** Event-specific data — rendered by channels. */
  payload: Record<string, unknown>
  /** Channels to attempt delivery on. */
  channels: NotificationChannelName[]
  priority: NotificationPriority
  createdAt: ISO8601
  readAt?: ISO8601
  deliveredAt?: Partial<Record<NotificationChannelName, ISO8601>>
}

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

// ── NotificationChannel (interface for platform implementations) ───────────────

/**
 * A delivery channel — in-app store, email, WhatsApp, Expo Push, etc.
 * Platforms implement this interface to integrate their delivery mechanism.
 */
export interface DeliveryChannel {
  readonly name: NotificationChannelName
  /**
   * Send a notification to a recipient.
   * Implementations must not throw — log errors and return normally.
   */
  send(event: NotificationEvent, recipientId: string): Promise<void>
}

// ── NotificationPreferences ──────────────────────────────────────────────────

/**
 * Per-user, per-event-type delivery preferences.
 * Stored by NotificationPreferencesService.
 */
export interface NotificationPreferences {
  userId: string
  eventType: NotificationEventType
  /** Which channels are enabled for this user+event combo. */
  channels: NotificationChannelName[]
  /** Master toggle — false means all channels are suppressed. */
  enabled: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map a SyncEvent entityKind+operation to a NotificationEventType. */
export function syncEventToNotificationType(
  entityKind: string,
  operation: string,
): NotificationEventType | null {
  const key = `${entityKind}.${operation}`
  const map: Record<string, NotificationEventType> = {
    'sale.create':       NotificationEventType.SALE_CREATED,
    'sale.update':       NotificationEventType.SALE_CREATED,
    'sale.refunded':     NotificationEventType.SALE_REFUNDED,
    'debt.create':       NotificationEventType.DEBT_CREATED,
    'debt.update':       NotificationEventType.DEBT_PAYMENT_RECORDED,
    'debtPayment.create': NotificationEventType.DEBT_PAYMENT_RECORDED,
    'expense.create':    NotificationEventType.EXPENSE_CREATED,
    'expense.update':    NotificationEventType.EXPENSE_APPROVED,
    'inventory.receive': NotificationEventType.INVENTORY_RECEIVED,
    'inventory.adjust':  NotificationEventType.INVENTORY_ADJUSTED,
    'device.enroll':     NotificationEventType.DEVICE_ENROLLED,
    'device.approve':    NotificationEventType.DEVICE_APPROVED,
    'device.revoke':     NotificationEventType.DEVICE_REVOKED,
    'device.primary':    NotificationEventType.DEVICE_PRIMARY_CHANGED,
    'commission.create': NotificationEventType.COMMISSION_CREATED,
    'commission.pay':    NotificationEventType.COMMISSION_PAID,
  }
  return map[key] ?? null
}
