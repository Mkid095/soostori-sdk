/**
 * Subscription cache — platform-agnostic storage adapter.
 */

import type { SubscriptionEntitlement } from '@soostori/core'
import { defaultEntitlement, computeState, type CachedEntitlement, type SubscriptionState } from './entitlement.js'

export interface EntitlementCacheStorage {
  get(key: string): string | null | Promise<string | null>
  set(key: string, value: string): void | Promise<void>
  delete(key: string): void | Promise<void>
}

export class SubscriptionCache {
  constructor(private readonly storage: EntitlementCacheStorage) {}

  async load(shopId: string, key = 'soostori:subscription'): Promise<CachedEntitlement | null> {
    const raw = await this.storage.get(key)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as CachedEntitlement
      if (parsed.entitlement.shopId !== shopId) return null
      return parsed
    } catch {
      return null
    }
  }

  async save(entitlement: SubscriptionEntitlement, key = 'soostori:subscription'): Promise<void> {
    const cached: CachedEntitlement = {
      entitlement,
      lastVerifiedAt: new Date().toISOString(),
    }
    await this.storage.set(key, JSON.stringify(cached))
  }

  async clear(key = 'soostori:subscription'): Promise<void> {
    await this.storage.delete(key)
  }

  async getState(shopId: string): Promise<SubscriptionState> {
    const cached = await this.load(shopId)
    return computeState(cached)
  }
}
