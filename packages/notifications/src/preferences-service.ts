/**
 * NotificationPreferencesService — stores and retrieves user notification preferences.
 *
 * In-memory implementation for SDK portability.
 * Platform adapters (desktop/mobile/web) replace this with a persistent store.
 */

import type {
  NotificationPreferences,
  NotificationEventType,
  NotificationChannelName,
} from './types.js'
import { ALL_NOTIFICATION_EVENT_TYPES } from './types.js'

/** Map of "userId:eventType" → preferences. */
type PrefStore = Map<string, NotificationPreferences>

/** Platform implements this to persist preferences. */
export interface NotificationPreferencesStorage {
  load(userId: string): Promise<NotificationPreferences[]>
  save(prefs: NotificationPreferences): Promise<void>
}

/** In-memory fallback when no platform storage is provided. */
class MemoryPreferencesStorage implements NotificationPreferencesStorage {
  private store: PrefStore = new Map()

  async load(userId: string): Promise<NotificationPreferences[]> {
    return ALL_NOTIFICATION_EVENT_TYPES
      .map(et => this.store.get(prefKey(userId, et)))
      .filter((p): p is NotificationPreferences => p !== undefined)
  }

  async save(prefs: NotificationPreferences): Promise<void> {
    this.store.set(prefKey(prefs.userId, prefs.eventType), prefs)
  }
}

function prefKey(userId: string, eventType: NotificationEventType): string {
  return `${userId}::${eventType}`
}

export class NotificationPreferencesService {
  private storage: NotificationPreferencesStorage

  constructor(storage?: NotificationPreferencesStorage) {
    this.storage = storage ?? new MemoryPreferencesStorage()
  }

  /**
   * Return all saved preferences for a user.
   * Defaults to all events enabled on 'in_app' if nothing saved.
   */
  async getPreferences(userId: string): Promise<NotificationPreferences[]> {
    const saved = await this.storage.load(userId)
    if (saved.length > 0) return saved
    // Return defaults for all event types
    return ALL_NOTIFICATION_EVENT_TYPES.map(et => ({
      userId,
      eventType: et,
      channels: ['in_app'] as NotificationChannelName[],
      enabled: true,
    }))
  }

  /**
   * Update preferences for a specific user+eventType combo.
   */
  async setPreferences(
    userId: string,
    eventType: NotificationEventType,
    prefs: Partial<Pick<NotificationPreferences, 'channels' | 'enabled'>>,
  ): Promise<void> {
    const existing = await this.getPreferences(userId)
    const current = existing.find(p => p.eventType === eventType) ?? {
      userId,
      eventType,
      channels: ['in_app'] as NotificationChannelName[],
      enabled: true,
    }
    await this.storage.save({
      ...current,
      ...prefs,
      userId,
      eventType,
    })
  }

  /**
   * Return which channels are enabled for a user+event combination.
   * Returns ['in_app'] if no preference is set.
   */
  async getEnabledChannels(
    userId: string,
    eventType: NotificationEventType,
  ): Promise<NotificationChannelName[]> {
    const prefs = await this.getPreferences(userId)
    const found = prefs.find(p => p.eventType === eventType)
    if (!found || !found.enabled) return []
    return found.channels.length > 0 ? found.channels : ['in_app']
  }
}
