/**
 * WhatsApp notification channel — implements @soostori/notifications' NotificationChannel.
 */

import type { NotificationChannel, Notification } from '@soostori/notifications'
import { EvolutionClient } from './client'

export class WhatsAppChannel implements NotificationChannel {
  readonly channelName = 'whatsapp'

  constructor(
    private readonly evolution: EvolutionClient,
    /** Resolve phone number from recipient. */
    private readonly resolvePhone: (recipientId: string) => Promise<string | null>,
  ) {}

  async isEnabled(_shopId: string, _recipientId: string): Promise<boolean> {
    try {
      const status = await this.evolution.getStatus()
      return status.state === 'open'
    } catch {
      return false
    }
  }

  async send(notification: Notification): Promise<void> {
    const phone = await this.resolvePhone(notification.recipientId)
    if (!phone) return
    const text = `*${notification.title}*\n\n${notification.body}`
    await this.evolution.sendText({ number: phone, text })
  }
}
