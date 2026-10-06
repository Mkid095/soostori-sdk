/**
 * Schema-vs-contract Product match test (P0-3a, audit 2026-10-05).
 *
 * Verifies that a `@soostori/contracts` `Product` (the canonical contract)
 * validates against `@soostori/schema`'s runtime Zod for the `products` cloud
 * entity. This is the runtime leg of the contract drift guard:
 *
 *   - `packages/contract-tests/test/contract-drift.test.ts` locks the schema
 *     fields against the contract fields at the structural level.
 *   - This file locks the runtime behavior — a contract-conformant Product
 *     must round-trip through `validateEntity('products', ...)` without error.
 *
 * If a future change adds a required field to the contract without also adding
 * it to the schema (or vice versa), the corresponding test below fails.
 */

import { describe, it, expect } from 'vitest'
import { cloudEntities, validateEntity } from '../src/entities'
import { asBusinessId, asProductId, asCategoryId, newId } from '@soostori/core'

/**
 * Build a minimal contract-conformant Product. All fields default to canonical
 * values; override in the test body for edge cases.
 */
function makeContractProduct(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const ts = '2026-10-05T00:00:00.000Z'
  return {
    id: asProductId(newId()),
    businessId: asBusinessId(newId()),
    name: 'Coffee Beans 250g',
    costPrice: 300,
    sellingPrice: 500,
    isGroup: false,
    unitsPerPackage: 1,
    stockQuantity: 42,
    currentStock: 42,
    lowStockThreshold: 10,
    trackInventory: true,
    allowSingleUnitSale: true,
    isActive: true,
    createdAt: ts,
    updatedAt: ts,
    version: 1,
    ...overrides,
  }
}

describe('schema: products cloud entity ↔ contracts Product (P0-3a)', () => {
  it('cloudEntities.products is registered', () => {
    expect(cloudEntities.products).toBeDefined()
    expect(Object.keys(cloudEntities.products).length).toBeGreaterThan(0)
  })

  it('validates a minimal contract-conformant Product (only required fields)', () => {
    const product = makeContractProduct()
    expect(() => validateEntity('products', product)).not.toThrow()
  })

  it('validates a fully-populated contract Product', () => {
    const product = makeContractProduct({
      barcode: '544900000002000',
      sku: 'COF-250',
      categoryId: asCategoryId(newId()),
      description: 'Single-origin Kenyan AA',
      groupPrices: JSON.stringify([{ quantity: 6, price: 2700 }]),
      distributorName: 'Nairobi Coffee Co.',
      distributorPhone: '+254712345678',
      image: 'https://cdn.example.com/products/cof-250.jpg',
    })
    expect(() => validateEntity('products', product)).not.toThrow()
  })

  it('validates a legacy cloud row that uses `shopId` instead of `businessId`', () => {
    // Existing deployed cloud rows use `shopId`. The schema keeps `shopId`
    // as a backwards-compatible tenant key — a row written with `shopId`
    // only must still validate.
    const ts = '2026-10-05T00:00:00.000Z'
    const product = {
      id: newId(),
      shopId: newId(),
      name: 'Legacy Coffee',
      costPrice: 200,
      sellingPrice: 400,
      isGroup: false,
      unitsPerPackage: 1,
      stockQuantity: 10,
      currentStock: 10,
      lowStockThreshold: 5,
      trackInventory: true,
      allowSingleUnitSale: true,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    }
    expect(() => validateEntity('products', product)).not.toThrow()
  })

  it('validates a bridged row that carries both `shopId` and `businessId`', () => {
    // A migration row carries both keys pointing at the same tenant id.
    // Both fields are now in the schema, so validation succeeds.
    const ts = '2026-10-05T00:00:00.000Z'
    const tenantId = newId()
    const product = {
      id: newId(),
      businessId: tenantId,
      shopId: tenantId,
      name: 'Bridged Coffee',
      costPrice: 200,
      sellingPrice: 400,
      isGroup: false,
      unitsPerPackage: 1,
      stockQuantity: 10,
      currentStock: 10,
      lowStockThreshold: 5,
      trackInventory: true,
      allowSingleUnitSale: true,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
      version: 1,
    }
    expect(() => validateEntity('products', product)).not.toThrow()
  })

  it('accepts schema-only denormalized field `categoryName`', () => {
    const product = makeContractProduct({ categoryName: 'Beverages' })
    expect(() => validateEntity('products', product)).not.toThrow()
  })

  it('rejects an unknown field (strict Zod)', () => {
    // Even with P0-3a additions, the schema stays strict — unknown fields
    // must not silently pass. This protects against accidental data drift.
    const product = makeContractProduct({ unknown_field: 'oops' })
    expect(() => validateEntity('products', product)).toThrow()
  })

  it('rejects a row missing `name` (required field)', () => {
    const product = makeContractProduct()
    delete (product as { name?: string }).name
    expect(() => validateEntity('products', product)).toThrow()
  })

  it('rejects a row missing `costPrice` (required numeric)', () => {
    const product = makeContractProduct()
    delete (product as { costPrice?: number }).costPrice
    expect(() => validateEntity('products', product)).toThrow()
  })

  // ── Field-type spot checks — catches regressions where a field's type ──────
  // ── silently drifts (e.g. a number becomes a string). ─────────────────────

  it('Product fields have expected primitive types', () => {
    const e = cloudEntities.products
    expect(e.id.type).toBe('uuid')
    expect(e.businessId.type).toBe('uuid')
    expect(e.shopId.type).toBe('uuid')
    expect(e.name.type).toBe('string')
    expect(e.costPrice.type).toBe('number')
    expect(e.sellingPrice.type).toBe('number')
    expect(e.isGroup.type).toBe('boolean')
    expect(e.isActive.type).toBe('boolean')
    expect(e.unitsPerPackage.type).toBe('number')
    expect(e.currentStock.type).toBe('number')
    expect(e.lowStockThreshold.type).toBe('number')
    expect(e.trackInventory.type).toBe('boolean')
    expect(e.allowSingleUnitSale.type).toBe('boolean')
    expect(e.createdAt.type).toBe('string')
    expect(e.updatedAt.type).toBe('string')
    expect(e.version.type).toBe('number')
  })

  it('P0-3a additions — `description` and `version` — are present with correct types', () => {
    expect(cloudEntities.products.description).toBeDefined()
    expect(cloudEntities.products.description.type).toBe('string')
    expect(cloudEntities.products.version).toBeDefined()
    expect(cloudEntities.products.version.type).toBe('number')
  })
})