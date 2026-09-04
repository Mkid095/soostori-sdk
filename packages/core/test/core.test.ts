import { describe, it, expect } from 'vitest'
import { newId, asShopId, asProductId } from '../src/ids'
import { shopSchema, productSchema } from '../src/validation'

describe('ID generation', () => {
  it('generates unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) ids.add(newId())
    expect(ids.size).toBe(100)
  })

  it('IDs are UUID v4 format', () => {
    const id = newId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('Branded ID casting', () => {
  it('asShopId returns string', () => {
    const id = asShopId('abc-123')
    expect(typeof id).toBe('string')
    expect(id).toBe('abc-123')
  })

  it('asProductId returns string', () => {
    const id = asProductId(newId())
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(20)
  })
})

describe('shopSchema', () => {
  it('accepts valid shop', () => {
    const valid = {
      id: newId(),
      name: 'My Shop',
      slug: 'my-shop',
      taxRate: 16,
      plan: 'free',
      subscriptionExpiry: new Date().toISOString(),
      status: 'active',
    }
    expect(() => shopSchema.parse(valid)).not.toThrow()
  })

  it('rejects shop with invalid slug', () => {
    const invalid = {
      id: newId(),
      name: 'My Shop',
      slug: 'My Shop With Spaces',
      taxRate: 0,
      plan: 'free',
      status: 'active',
    }
    expect(() => shopSchema.parse(invalid)).toThrow()
  })
})

describe('productSchema', () => {
  it('accepts valid product', () => {
    const valid = {
      id: newId(),
      shopId: newId(),
      name: 'Coffee',
      sellingPrice: 500,
      costPrice: 300,
      isGroup: false,
      unitsPerPackage: 1,
      stockQuantity: 100,
      currentStock: 100,
      lowStockThreshold: 5,
      trackInventory: true,
      allowSingleUnitSale: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    expect(() => productSchema.parse(valid)).not.toThrow()
  })

  it('rejects product with negative price', () => {
    const invalid = {
      id: newId(),
      shopId: newId(),
      name: 'Coffee',
      sellingPrice: -100,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    expect(() => productSchema.parse(invalid)).toThrow()
  })
})
