/**
 * Notification channels — pluggable delivery targets.
 *
 * Each platform implements its own channels:
 *   - Desktop: in-app + system notifications
 *   - Mobile: in-app + push
 *   - Server: WhatsApp + email
 */

import type { ShopId, ISO8601, UUID } from '@soostori/core'

/** A notification to send. */
export interface Notification {
  id: UUID
  shopId: ShopId
  /** Which event triggered this notification. */
  triggerEvent: string
  /** User this notification is for. */
  recipientId: UUID
  /** Notification title. */
  title: string
  /** Notification body. */
  body: string
  /** Optional action URL. */
  actionUrl?: string
  /** Priority. */
  priority: 'low' | 'normal' | 'high' | 'urgent'
  /** Payload data — for in-app display. */
  data?: Record<string, unknown>
  /** When the notification was created. */
  createdAt: ISO8601
}

/** Channel abstraction — each platform implements. */
export interface NotificationChannel {
  /** Unique channel identifier. */
  readonly channelName: string
  /** Whether this channel is enabled for this user/shop. */
  isEnabled(shopId: ShopId, recipientId: UUID): Promise<boolean>
  /** Send a notification. */
  send(notification: Notification): Promise<void>
}

/** Channel registry — known channels. */
export class NotificationChannelRegistry {
  private channels = new Map<string, NotificationChannel>()

  register(channel: NotificationChannel): void {
    this.channels.set(channel.channelName, channel)
  }

  get(name: string): NotificationChannel | undefined {
    return this.channels.get(name)
  }

  list(): NotificationChannel[] {
    return [...this.channels.values()]
  }
}
