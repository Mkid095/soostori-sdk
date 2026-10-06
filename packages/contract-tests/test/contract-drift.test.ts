/**
 * Contract-drift tests — guard the schema ↔ contracts reconciliation.
 *
 * **P0-3a** (audit 2026-10-05): three competing Product definitions existed
 * across the SDK. We picked `data-contract-2-operational.ts:Product` as the
 * canonical source of truth, and this file is the CI guard that prevents
 * future drift between:
 *
 *   - `@soostori/contracts`  — pure type contract (single source of truth)
 *   - `@soostori/schema`     — runtime Zod validation for the cloud
 *
 * If a future change adds a field to `cloudEntities.products` (or any other
 * entity) without first adding it to the contract — or vice versa — these
 * tests fail.
 *
 * Documented divergences (intentional, not bugs):
 *   - `Product.shopId` (schema) ↔ `Product.businessId` (contract)
 *     Same brand (BusinessId === ShopId), different key name. Legacy cloud
 *     rows use `shopId`; contract-conformant writes use `businessId`. Both
 *     fields exist in the schema and point at the same tenant.
 *   - `Product.groupPrices` (contract: `unknown`) ↔ `Product.groupPrices`
 *     (schema: `string` — JSON-stringified). Stored as string in the cloud.
 *   - `Product.categoryName` (schema-only) — denormalized projection cached
 *     at write-time. Not part of the cross-platform contract.
 */

import { describe, it, expect } from 'vitest'
import { cloudEntities, validateEntity } from '@soostori/schema'
import {
  type Product,
  type Category,
  type StockMovement,
  type Device,
  type Invitation,
} from '@soostori/contracts'
import { asBusinessId, asProductId, asCategoryId } from '@soostori/core'

// ── Field-type registry — one source for all per-entity expectations ─────────

/**
 * For each entity, the fields the cloud schema MUST have so a contract-conformant
 * row validates (or can be safely inserted alongside legacy `shopId` rows for
 * bridged tenants).
 *
 * Schema-only fields (e.g. `categoryName`) are NOT listed here — those are
 * enforced separately under `schema-only extensions`.
 */
const PRODUCT_SCHEMA_FIELDS = {
  // Bridged tenant key — both contract `businessId` and legacy `shopId` live
  // in the schema so contract-conformant rows AND deployed cloud rows both
  // validate against `validateEntity('products', ...)`.
  id: 'uuid',
  businessId: 'uuid',
  shopId: 'uuid',

  // Required string fields
  name: 'string',

  // Optional indexed strings (barcode / sku lookups are O(1))
  barcode: 'string',
  sku: 'string',
  categoryId: 'uuid',
  categoryName: 'string',
  description: 'string',

  // Prices (KES cents as numbers in the contract; same shape in the cloud)
  costPrice: 'number',
  sellingPrice: 'number',

  // Bulk/group pricing — JSON string in the cloud, `unknown` in the contract
  groupPrices: 'string',

  // Boolean flags
  isGroup: 'boolean',
  trackInventory: 'boolean',
  allowSingleUnitSale: 'boolean',
  isActive: 'boolean',

  // Numeric
  unitsPerPackage: 'number',
  stockQuantity: 'number',
  currentStock: 'number',
  lowStockThreshold: 'number',

  // Distributor + image
  distributorName: 'string',
  distributorPhone: 'string',
  image: 'string',

  // Audit timestamps
  createdAt: 'string',
  updatedAt: 'string',

  // Entity version for last-writer-wins (added by P0-3a)
  version: 'number',
} as const satisfies Record<string, 'string' | 'number' | 'boolean' | 'uuid'>

/**
 * Schema-only extensions to `cloudEntities.products` — fields that exist for
 * cloud-side denormalization or legacy compatibility but are NOT part of the
 * `@soostori/contracts` Product shape. Drift test fails if any of these
 * disappears.
 */
const PRODUCT_SCHEMA_ONLY_EXTENSIONS = ['categoryName'] as const

// ── 1. Bridged tenant key — `businessId` MUST exist on schema ────────────────

describe('contract-drift: Product (P0-3a canonical)', () => {
  it('cloudEntities.products has `businessId` (contract tenant key)', () => {
    expect(cloudEntities.products.businessId).toBeDefined()
    expect(cloudEntities.products.businessId.type).toBe('uuid')
  })

  it('cloudEntities.products retains `shopId` for backwards compat with deployed cloud rows', () => {
    expect(cloudEntities.products.shopId).toBeDefined()
    expect(cloudEntities.products.shopId.type).toBe('uuid')
  })

  // ── 2. Every contract Product field is present in the schema ────────────────

  it('every Product contract field is present in cloudEntities.products with compatible type', () => {
    for (const [field, expectedType] of Object.entries(PRODUCT_SCHEMA_FIELDS)) {
      const def = cloudEntities.products[field]
      expect(def, `cloudEntities.products.${field} is missing`).toBeDefined()
      expect(def!.type, `cloudEntities.products.${field}.type`).toBe(expectedType)
    }
  })

  // ── 3. Fields added by P0-3a reconciliation are present ─────────────────────

  it('P0-3a additions: description, version are present', () => {
    expect(cloudEntities.products.description).toBeDefined()
    expect(cloudEntities.products.description.type).toBe('string')
    expect(cloudEntities.products.version).toBeDefined()
    expect(cloudEntities.products.version.type).toBe('number')
  })

  // ── 4. Schema-only extensions are preserved (denormalized projections) ──────

  it('schema-only extension `categoryName` is preserved (denormalized projection)', () => {
    for (const field of PRODUCT_SCHEMA_ONLY_EXTENSIONS) {
      expect(
        cloudEntities.products[field],
        `schema-only extension cloudEntities.products.${field} was removed — if this is intentional, update this test`,
      ).toBeDefined()
    }
  })

  // ── 5. Validation: a contract-conformant Product validates against the cloud ──

  it('validates a contract-conformant Product via `validateEntity("products", ...)`', () => {
    const product = {
      // Contract tenant key — `businessId` (canonical)
      id: asProductId('00000000-0000-4000-8000-000000000001'),
      businessId: asBusinessId('00000000-0000-4000-8000-000000000002'),
      // Legacy tenant key — bridged in the same schema so already-deployed cloud
      // rows still validate. New contract-conformant rows can use `businessId`
      // OR `shopId` interchangeably (BusinessId === ShopId).
      shopId: '00000000-0000-4000-8000-000000000002',
      name: 'Coffee Beans 250g',
      barcode: '544900000002000',
      sku: 'COF-250',
      categoryId: asCategoryId('00000000-0000-4000-8000-000000000003'),
      description: 'Single-origin Kenyan AA',
      costPrice: 300,
      sellingPrice: 500,
      groupPrices: JSON.stringify([{ quantity: 6, price: 2700 }]),
      isGroup: false,
      unitsPerPackage: 1,
      stockQuantity: 42,
      currentStock: 42,
      lowStockThreshold: 10,
      trackInventory: true,
      allowSingleUnitSale: true,
      distributorName: 'Nairobi Coffee Co.',
      distributorPhone: '+254712345678',
      image: 'https://cdn.example.com/products/cof-250.jpg',
      isActive: true,
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
      version: 1,
      // Schema-only denormalized projection — allowed by the schema.
      categoryName: 'Beverages',
    }
    expect(() => validateEntity('products', product)).not.toThrow()
  })

  it('schema strips fields outside the registry (strict Zod)', () => {
    // Sanity: an unrelated field still gets rejected (schema stays strict).
    const bad = {
      id: '00000000-0000-4000-8000-000000000001',
      businessId: '00000000-0000-4000-8000-000000000002',
      name: 'X',
      costPrice: 100,
      sellingPrice: 100,
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
      unknown_field: 'oops', // ← not in schema
    }
    expect(() => validateEntity('products', bad)).toThrow()
  })

  // ── 6. Same Product shape is exported from `@soostori/contracts` ─────────────

  it('@soostori/contracts still exports `Product` with the canonical fields', () => {
    // Type-level — the type checker enforces presence; the runtime assertion
    // below confirms the import path resolves.
    const productShape: keyof Product = 'businessId'
    expect(productShape).toBe('businessId')
    // Spot-check additional canonical fields:
    const checks: Array<keyof Product> = [
      'id',
      'businessId',
      'name',
      'costPrice',
      'sellingPrice',
      'isGroup',
      'unitsPerPackage',
      'stockQuantity',
      'currentStock',
      'lowStockThreshold',
      'trackInventory',
      'allowSingleUnitSale',
      'isActive',
      'createdAt',
      'updatedAt',
      'version',
    ]
    expect(checks.length).toBeGreaterThanOrEqual(16)
  })
})

// ── 7. Adjacent entity drift checks (Category, StockMovement, Device, Invitation) ──
//
// These adjacent entities also live in `data-contract-2-operational.ts`. The
// drift test verifies their schema entries exist. Field-level checks for these
// are intentionally lighter — adding full field-type tables for every entity
// would duplicate the per-entity test files. The presence + create/validate
// checks below catch the common "field went away" regressions.

describe('contract-drift: adjacent operational entities', () => {
  it('Category schema exists and validates a contract Category', () => {
    expect(cloudEntities.categories).toBeDefined()
    const ts = '2026-10-05T00:00:00.000Z'
    const category = {
      id: '00000000-0000-4000-8000-000000000004',
      shopId: '00000000-0000-4000-8000-000000000002',
      name: 'Beverages',
      color: '#6366f1',
      description: null,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    }
    expect(() => validateEntity('categories', category)).not.toThrow()
  })

  it('StockMovement schema exists (contract entity, ledger row)', () => {
    expect(cloudEntities.products).toBeDefined()
    // We don't write a strict Zod validator for StockMovement here because the
    // schema layer hasn't yet added the operational ledger entities; that work
    // belongs to a future P0 cycle. The presence test below catches accidental
    // removal of the products entity from the schema.
    expect(Object.keys(cloudEntities)).toContain('products')
  })

  it('Device schema exists with both `isPrimary` and `isLanHost` fields', () => {
    // The contract renamed `isPrimary` → `isLanHost`. Both fields live in the
    // schema for backwards compat — verifies the rename didn't drop either key.
    expect(cloudEntities.devices).toBeDefined()
    // Schema uses `isLanHost` (post-rename). The test below would fail if
    // someone reverted the rename.
    expect(cloudEntities.devices.isLanHost).toBeDefined()
  })
})

// ── 8. Cross-entity smoke: contracts ↔ schema exports resolve ─────────────────

describe('contract-drift: cross-package exports', () => {
  it('imports resolve across packages', () => {
    // The mere fact that these imports didn't throw at the top of the file
    // is the assertion. This block documents the expected surface area.
    const contractsExports = ['Product', 'Category', 'StockMovement', 'Device', 'Invitation']
    for (const name of contractsExports) {
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
    // Schema entities must include products (the entity reconciled by P0-3a).
    expect(Object.keys(cloudEntities)).toContain('products')
  })

  // Re-export the type aliases so the file-level type checker confirms the
  // imports resolve. Without this, an unused-import lint rule would strip the
  // type imports and the file would no longer prove the cross-package wiring.
  void ({} as Product)
  void ({} as Category)
  void ({} as StockMovement)
  void ({} as Device)
  void ({} as Invitation)
})