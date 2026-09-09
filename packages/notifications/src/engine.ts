/**
 * Notification engine — consumes @soostori/events, dispatches to channels.
 *
 * Plugin architecture:
 *
 *   Domain Event
 *      │
 *      ▼
 *   Notification Engine
 *      │
 *      ├── Preference lookup
 *      ├── Render message (per channel)
 *      ├── For each enabled channel:
 *      │     └── Channel.send(notification)
 *      └── Audit log
 */

import type { SoostoriEvent, SoostoriEventName } from '@soostori/events'
import type { ShopId, UserId, UUID } from '@soostori/core'
import { newId } from '@soostori/core'
import { NotificationChannel, Notification, NotificationChannelRegistry } from './channel.js'
import { defaultChannelsFor } from './preferences.js'

/** Mapping from event name to (title, body, priority). */
type PayloadFn = (e: SoostoriEvent) => string
const get = (e: SoostoriEvent, k: string): unknown => {
  const p = (e.payload ?? {}) as Record<string, unknown>
  return p[k]
}
const kget = (e: SoostoriEvent, k: string): string => {
  const v = get(e, k)
  return v == null ? '?' : String(v)
}
const NOTIFICATION_RULES: Record<string, { title: (e: SoostoriEvent) => string; body: PayloadFn; priority: Notification['priority'] }> = {
  'sale.confirmed': {
    title: () => 'Sale completed',
    body: (e) => `Sale of KES ${kget(e, 'total')} completed`,
    priority: 'normal',
  },
  'sale.rejected': {
    title: () => 'Sale rejected',
    body: (e) => `Sale rejected: ${kget(e, 'reason')}`,
    priority: 'high',
  },
  'stock.low': {
    title: (e) => `Low stock: ${kget(e, 'productName')}`,
    body: (e) => `Stock ${kget(e, 'currentStock')}/${kget(e, 'threshold')}`,
    priority: 'high',
  },
  'debt.payment_recorded': {
    title: () => 'Debt payment recorded',
    body: (e) => `KES ${kget(e, 'amount')} payment on debt ${kget(e, 'debtId')}`,
    priority: 'normal',
  },
  'subscription.expiring_soon': {
    title: () => 'Subscription expiring soon',
    body: (e) => `${kget(e, 'daysRemaining')} days until subscription expires`,
    priority: 'urgent',
  },
  'subscription.expired': {
    title: () => 'Subscription expired',
    body: () => 'Reconnect to verify online subscription',
    priority: 'urgent',
  },
  'subscription.commission_generated': {
    title: () => 'Commission generated',
    body: (e) => `Commission KES ${kget(e, 'amount')} earned`,
    priority: 'normal',
  },
  'audit.permission_denied': {
    title: () => 'Permission denied',
    body: (e) => `User attempted ${kget(e, 'permission')}`,
    priority: 'high',
  },
  'system.error': {
    title: () => 'System error',
    body: (e) => kget(e, 'message'),
    priority: 'urgent',
  },
}

/** Recipients resolver — gives the engine which users should get notified. */
export interface RecipientResolver {
  resolveRecipients(event: SoostoriEvent): Promise<Array<{ userId: UserId; shopId: ShopId }>>
}

export class NotificationEngine {
  private channels: NotificationChannelRegistry
  private resolver: RecipientResolver
  private preferOffline = new Map<string, string[]>()

  constructor(args: { channels: NotificationChannelRegistry; resolver: RecipientResolver }) {
    this.channels = args.channels
    this.resolver = args.resolver
  }

  /** Process an event — render notifications, dispatch to enabled channels. */
  async dispatch(event: SoostoriEvent): Promise<Notification[]> {
    const rule = NOTIFICATION_RULES[event.name as SoostoriEventName]
    if (!rule) return []  // event has no notification rule

    const recipients = await this.resolver.resolveRecipients(event)
    const channels = this.preferOffline.get(event.name) ?? defaultChannelsFor(event.name)
    const out: Notification[] = []

    for (const r of recipients) {
      for (const ch of channels) {
        const channel = this.channels.get(ch)
        if (!channel) continue
        const enabled = await channel.isEnabled(r.shopId, r.userId)
        if (!enabled) continue
        const notification: Notification = {
          id: newId() as UUID,
          shopId: r.shopId,
          triggerEvent: event.name,
          recipientId: r.userId,
          title: rule.title(event),
          body: rule.body(event),
          priority: rule.priority,
          data: event.payload as Record<string, unknown>,
          createdAt: new Date().toISOString(),
        }
        out.push(notification)
        try {
          await channel.send(notification)
        } catch (err) {
          // Don't throw — one channel failing shouldn't break others
          console.error('Notification channel failed:', ch, err)
        }
      }
    }
    return out
  }

  /** Override default channels for a specific event. */
  setOverride(eventName: SoostoriEventName, channels: string[]): void {
    this.preferOffline.set(eventName, channels)
  }
}
