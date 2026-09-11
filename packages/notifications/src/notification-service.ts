/**
 * NotificationService — canonical notification dispatcher.
 *
 * Responsibilities:
 *   - Build a NotificationEvent from eventType + payload
 *   - Check user preferences before dispatching
 *   - Fan out to all registered channels
 *   - Fire-and-forget: channel errors never propagate
 *
 * Usage:
 *   const svc = new NotificationService({ channels, preferencesService })
 *   await svc.send({ id: newId(), businessId, eventType: 'sale.created', ... })
 *   await svc.notifyUser(userId, 'debt.settled', { debtId, balance: 0 })
 */

import type { ISO8601, UUID } from '@soostori/core'
import { newId } from '@soostori/core'
import type {
  NotificationEvent,
  NotificationEventType,
  NotificationChannelName,
  DeliveryChannel,
} from './types.js'
import type { NotificationPreferencesService } from './preferences-service.js'

export interface NotificationServiceOptions {
  /** All registered delivery channels. */
  channels: Map<NotificationChannelName, DeliveryChannel>
  /** User preference service — consulted before sending. */
  preferencesService: NotificationPreferencesService
  /** Default channels when no preference is set. */
  defaultChannels?: NotificationChannelName[]
}

/** Priority → default channels when user has no explicit preference. */
const PRIORITY_DEFAULTS: Record<string, NotificationChannelName[]> = {
  low:    ['in_app'],
  normal: ['in_app'],
  high:   ['in_app', 'whatsapp'],
  urgent: ['in_app', 'whatsapp', 'email'],
}

export class NotificationService {
  private readonly channels: Map<NotificationChannelName, DeliveryChannel>
  private readonly preferencesService: NotificationPreferencesService
  private readonly defaultChannels: NotificationChannelName[]

  constructor(options: NotificationServiceOptions) {
    this.channels = options.channels
    this.preferencesService = options.preferencesService
    this.defaultChannels = options.defaultChannels ?? ['in_app']
  }

  /**
   * Canonical send — dispatch a fully-formed NotificationEvent.
   *
   * Each channel is tried independently; failures are logged and swallowed
   * so a broken email integration never blocks in-app delivery.
   */
  async send(event: NotificationEvent): Promise<void> {
    const channels = event.channels.length > 0
      ? event.channels
      : (PRIORITY_DEFAULTS[event.priority] ?? this.defaultChannels)

    for (const channelName of channels) {
      const channel = this.channels.get(channelName)
      if (!channel) continue
      try {
        await channel.send(event, event.businessId)
      } catch (err) {
        console.error(`[NotificationService] channel ${channelName} failed:`, err)
      }
    }
  }

  /**
   * User-scoped helper — resolves channels from user preferences,
   * then dispatches.
   */
  async notifyUser(
    userId: string,
    eventType: NotificationEventType,
    payload: Record<string, unknown>,
    businessId: string,
    priority?: NotificationPriority,
  ): Promise<void> {
    const enabledChannels = await this.preferencesService.getEnabledChannels(userId, eventType)
    if (enabledChannels.length === 0) return  // user opted out

    const event = this.buildEvent(businessId, eventType, payload, priority)
    await this.sendWithChannels(event, enabledChannels)
  }

  /**
   * Business-scoped helper — notify all relevant users of a business-level event.
   * Caller provides the recipientIds list.
   */
  async notifyBusiness(
    businessId: string,
    eventType: NotificationEventType,
    payload: Record<string, unknown>,
    recipientIds: string[],
    priority?: NotificationPriority,
  ): Promise<void> {
    const event = this.buildEvent(businessId, eventType, payload, priority)
    for (const recipientId of recipientIds) {
      const enabledChannels = await this.preferencesService.getEnabledChannels(recipientId, eventType)
      if (enabledChannels.length === 0) continue
      await this.sendWithChannels(event, enabledChannels)
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private buildEvent(
    businessId: string,
    eventType: NotificationEventType,
    payload: Record<string, unknown>,
    priority?: NotificationPriority,
  ): NotificationEvent {
    return {
      id: newId() as UUID,
      businessId,
      eventType,
      payload,
      channels: [],
      priority: priority ?? 'normal',
      createdAt: new Date().toISOString() as ISO8601,
    }
  }

  private async sendWithChannels(
    event: NotificationEvent,
    channelNames: NotificationChannelName[],
  ): Promise<void> {
    for (const channelName of channelNames) {
      const channel = this.channels.get(channelName)
      if (!channel) continue
      try {
        await channel.send(event, event.businessId)
      } catch (err) {
        console.error(`[NotificationService] channel ${channelName} failed:`, err)
      }
    }
  }
}

type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'
