/**
 * Notification preferences — what each user wants delivered where.
 */

import type { SoostoriEventName } from '@soostori/events'

/** Per-user, per-event, per-channel preference. */
export interface NotificationPreference {
  userId: string
  shopId: string
  eventName: SoostoriEventName
  /** Which channels this user wants this event on. */
  channels: string[]
  enabled: boolean
}

/** Default preferences — applied when user has no override. */
export const DEFAULT_PREFERENCES: Record<string, string[]> = {
  'sale.confirmed': ['in_app', 'push'],
  'sale.rejected': ['in_app', 'push', 'sound'],
  'stock.low': ['in_app', 'whatsapp'],
  'debt.payment_recorded': ['in_app', 'whatsapp'],
  'subscription.expiring_soon': ['in_app', 'email', 'whatsapp'],
  'subscription.expired': ['in_app', 'email', 'whatsapp'],
  'subscription.commission_generated': ['in_app', 'email'],
  'audit.permission_denied': ['in_app', 'email'],
  'system.error': ['in_app', 'email'],
}

export function defaultChannelsFor(eventName: string): string[] {
  return DEFAULT_PREFERENCES[eventName] ?? ['in_app']
}
