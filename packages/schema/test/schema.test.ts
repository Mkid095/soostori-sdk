import { describe, it, expect } from 'vitest'
import { cloudEntities, validateEntity } from '../src/entities'
import { newId } from '@soostori/core'
import { SCHEMA_VERSION, migrations, isCompatible } from '../src/migrations'

describe('cloudEntities', () => {
  it('contains the expected entities', () => {
    expect(Object.keys(cloudEntities).sort()).toContain('shops')
    expect(Object.keys(cloudEntities).sort()).toContain('employees')
    expect(Object.keys(cloudEntities).sort()).toContain('devices')
    expect(Object.keys(cloudEntities).sort()).toContain('syncEvents')
  })

  it('shops has subscriptionExpiry as date field', () => {
    expect(cloudEntities.shops.subscriptionExpiry.type).toBe('date')
  })

  it('devices has lastSyncAt field', () => {
    expect(cloudEntities.devices.lastSyncAt).toBeDefined()
  })

  it('subscriptions has both planId and planKey', () => {
    expect(cloudEntities.subscriptions.planId).toBeDefined()
    expect(cloudEntities.subscriptions.planKey).toBeDefined()
  })

  it('syncEvents has shopId, deviceId, entityId fields', () => {
    expect(cloudEntities.syncEvents.shopId).toBeDefined()
    expect(cloudEntities.syncEvents.deviceId).toBeDefined()
    expect(cloudEntities.syncEvents.entityId).toBeDefined()
  })
})

describe('validateEntity', () => {
  it('validates a shop', () => {
    const shop = {
      id: newId(),
      name: 'My Shop',
      slug: 'my-shop',
      taxRate: 16,
      plan: 'free',
      subscriptionExpiry: new Date().toISOString(),
      status: 'active',
    }
    expect(() => validateEntity('shops', shop)).not.toThrow()
  })

  it('rejects unknown field (strict mode)', () => {
    const shop = {
      id: newId(),
      name: 'Shop',
      slug: 'shop',
      taxRate: 0,
      plan: 'free',
      status: 'active',
      unknown_field: 'oops',
    }
    expect(() => validateEntity('shops', shop)).toThrow()
  })
})

describe('migrations', () => {
  it('has monotonically increasing versions', () => {
    for (let i = 1; i < migrations.length; i++) {
      expect(migrations[i].version).toBeGreaterThan(migrations[i - 1].version)
    }
  })

  it('SCHEMA_VERSION is the latest version', () => {
    expect(SCHEMA_VERSION).toBe(migrations[migrations.length - 1].version)
  })

  it('isCompatible returns true for current version', () => {
    expect(isCompatible(SCHEMA_VERSION)).toBe(true)
  })
})
