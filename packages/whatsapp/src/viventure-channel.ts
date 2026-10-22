/**
 * The Viventure WhatsApp channel — implements @soostori/notifications'
 * NotificationChannel, so the notification engine can route a high or urgent
 * event to WhatsApp without knowing anything about instances.
 *
 * The difference from the Evolution channel is the instance. Evolution had
 * one instance for everybody; here every shop has its own, because every shop
 * owner connects their own number. So the channel resolves the shop's
 * instance first, and only then the recipient's number.
 */

import type { NotificationChannel, Notification } from '@soostori/notifications'
import { ViventureClient, type ViventureInstanceState } from './viventure-client.js'

export interface ViventureChannelOptions {
  /** The instance that belongs to a shop, or null when it has not connected one. */
  resolveInstance: (shopId: string) => Promise<string | null>
  /** The recipient's number in international format. */
  resolvePhone: (recipientId: string) => Promise<string | null>
}

export class ViventureChannel implements NotificationChannel {
  readonly channelName = 'whatsapp'

  constructor(
    private readonly client: ViventureClient,
    private readonly options: ViventureChannelOptions,
  ) {}

  /**
   * A shop can only be reached on WhatsApp once it has connected a number and
   * that number is actually connected.
   */
  async isEnabled(shopId: string, _recipientId: string): Promise<boolean> {
    const instancePublicId = await this.options.resolveInstance(shopId)
    if (!instancePublicId) return false
    try {
      const state: ViventureInstanceState = await this.client.getInstanceState(instancePublicId)
      return state.status === 'CONNECTED'
    } catch {
      return false
    }
  }

  /**
   * Sends the notification as text.
   *
   * The notification's id is the idempotency key, so a retry of the same
   * notification does not send the message twice — which matters because the
   * platform paces its sends and a duplicate would land as a second message
   * in the customer's chat.
   */
  async send(notification: Notification): Promise<void> {
    const instancePublicId = await this.options.resolveInstance(notification.shopId)
    if (!instancePublicId) return
    const phone = await this.options.resolvePhone(notification.recipientId)
    if (!phone) return

    const text = `*${notification.title}*\n\n${notification.body}`
    await this.client.sendText({
      instancePublicId,
      number: phone,
      text,
      idempotencyKey: notification.id,
    })
  }
}
