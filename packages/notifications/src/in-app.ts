/**
 * InAppChannel — stores notifications locally for platform display.
 *
 * The actual storage backend (IndexedDB / SQLite / memory) is provided
 * by the platform layer that constructs this channel.
 * This class holds an in-memory ring buffer; real storage is injected.
 */

import type {
  NotificationChannelName,
  DeliveryChannel,
  NotificationEvent,
} from './types.js'

export interface NotificationStore {
  save(event: NotificationEvent, recipientId: string): Promise<void>
  markRead(notificationId: string, recipientId: string): Promise<void>
  markAllRead(recipientId: string): Promise<void>
  list(recipientId: string): Promise<NotificationEvent[]>
  unreadCount(recipientId: string): Promise<number>
}

/** In-app delivery channel — platform provides the NotificationStore. */
export class InAppChannel implements DeliveryChannel {
  readonly name: NotificationChannelName = 'in_app' as NotificationChannelName

  constructor(private readonly store: NotificationStore) {}

  async send(event: NotificationEvent, recipientId: string): Promise<void> {
    await this.store.save(event, recipientId)
  }
}
