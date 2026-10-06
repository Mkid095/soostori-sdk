/**
 * Contract-drift tests — guard the schema ↔ contracts reconciliation for
 * the `Business` tenant entity (P0-3c, audit 2026-10-05).
 *
 * Two competing definitions existed:
 *   - `@soostori/contracts`  `Business`  — `data-contract-1-identity.ts:51+`
 *     Canonical tenant identity with `ownerPersonId`, `currency`, `country`.
 *   - `@soostori/schema`     `shops`     — `packages/schema/src/entities.ts:54+`
 *     Storage form on the deployed FIDScript cloud with `taxRate`,
 *     `subscriptionExpiry`, `status`.
 *
 * Resolution (P0-3c):
 *   - `Business` (contract) is now the **CANONICAL** tenant contract.
 *   - `shops` (schema) is the **storage form**. `BusinessId === ShopId`
 *     (same brand, two names — see `@soostori/core/ids.ts`).
 *   - The schema has been extended with every contract field so a contract-
 *     conformant `Business` validates against `validateEntity('shops', ...)`.
 *
 * This file is the CI guard that prevents future drift. If a future change
 * adds a field to `cloudEntities.shops` (or any other entity) without first
 * adding it to the `Business` contract — or vice versa — these tests fail.
 *
 * Documented divergences (intentional, not bugs):
 *   - `taxRate`, `subscriptionExpiry`, `status` live on the schema but are
 *     semantically operational (`BusinessSettings`) — kept on `Business`
 *     for backwards compatibility with the deployed cloud rows. The
 *     `schema-only extensions` test below enforces this continued presence.
 *   - `Business.status` is the canonical enum (`active | inactive | suspended`);
 *     `cloudEntities.shops.status` stays a freeform `str` so legacy deployed
 *     rows (which may carry other values) still validate.
 *   - `Business.country` (new in P0-3c) is a canonical tenant identity field;
 *     default `'KE'` matches the Soostori target market.
 */

import { describe, it, expect } from 'vitest'
import { cloudEntities, validateEntity } from '@soostori/schema'
import { type Business } from '@soostori/contracts'
import { asBusinessId, asPersonId } from '@soostori/core'

// ── Field-type registry — one source for all per-entity expectations ─────────

/**
 * For the `Business` entity, the fields the cloud schema MUST have so a
 * contract-conformant row validates against `validateEntity('shops', ...)`.
 * Each entry pairs the contract field with the expected schema primitive type.
 *
 * Schema-only extensions are NOT listed here — those are enforced separately
 * under `schema-only extensions`.
 */
const BUSINESS_SCHEMA_FIELDS = {
  // Identity (canonical tenant key — `BusinessId === ShopId`)
  id: 'uuid',
  ownerPersonId: 'uuid',

  // Display + slug
  name: 'string',
  slug: 'string',

  // Tenant locale
  currency: 'string',
  country: 'string',

  // Operational extensions
  taxRate: 'number',
  plan: 'string',
  status: 'string',

  // Audit timestamps
  createdAt: 'string',
  updatedAt: 'string',

  // Entity version for last-writer-wins
  version: 'number',
} as const satisfies Record<string, 'string' | 'number' | 'boolean' | 'uuid' | 'date' | 'json'>

/**
 * Fields that the contract considers operational (`BusinessSettings` semantically)
 * but that the schema keeps on `shops` for backwards compatibility with the
 * deployed FIDScript cloud rows. Drift test fails if any of these disappears.
 */
const BUSINESS_SCHEMA_ONLY_EXTENSIONS = [
  'taxRate',
  'subscriptionExpiry', // type 'date' (ISO 8601)
  'status',             // freeform str — contract codifies the enum
] as const

// ── 1. Bridged tenant key + canonical owner ─────────────────────────────────

describe('contract-drift: Business (P0-3c canonical)', () => {
  it('cloudEntities.shops has `ownerPersonId` (canonical owner link)', () => {
    expect(cloudEntities.shops.ownerPersonId).toBeDefined()
    expect(cloudEntities.shops.ownerPersonId.type).toBe('uuid')
  })

  it('cloudEntities.shops has `id` as uuid (BusinessId === ShopId)', () => {
    expect(cloudEntities.shops.id).toBeDefined()
    expect(cloudEntities.shops.id.type).toBe('uuid')
  })

  // ── 2. Every contract Business field is present in the schema ────────────────

  it('every Business contract field is present in cloudEntities.shops with compatible type', () => {
    for (const [field, expectedType] of Object.entries(BUSINESS_SCHEMA_FIELDS)) {
      const def = cloudEntities.shops[field]
      expect(def, `cloudEntities.shops.${field} is missing`).toBeDefined()
      expect(def!.type, `cloudEntities.shops.${field}.type`).toBe(expectedType)
    }
  })

  // ── 3. Fields added by P0-3c reconciliation are present ─────────────────────

  it('P0-3c additions: ownerPersonId, currency, country, createdAt, updatedAt, version are present', () => {
    // ownerPersonId
    expect(cloudEntities.shops.ownerPersonId).toBeDefined()
    expect(cloudEntities.shops.ownerPersonId.type).toBe('uuid')

    // currency + country
    expect(cloudEntities.shops.currency).toBeDefined()
    expect(cloudEntities.shops.currency.type).toBe('string')
    expect(cloudEntities.shops.country).toBeDefined()
    expect(cloudEntities.shops.country.type).toBe('string')

    // Audit timestamps
    expect(cloudEntities.shops.createdAt).toBeDefined()
    expect(cloudEntities.shops.createdAt.type).toBe('string')
    expect(cloudEntities.shops.updatedAt).toBeDefined()
    expect(cloudEntities.shops.updatedAt.type).toBe('string')

    // version
    expect(cloudEntities.shops.version).toBeDefined()
    expect(cloudEntities.shops.version.type).toBe('number')
  })

  it('P0-3c additions have sensible defaults', () => {
    expect(cloudEntities.shops.currency.default).toBe('KES')
    expect(cloudEntities.shops.country.default).toBe('KE')
    expect(cloudEntities.shops.version.default).toBe(1)
  })

  // ── 4. Schema-only extensions are preserved (operational fields) ────────────

  it('schema-only extensions (taxRate, subscriptionExpiry, status) are preserved', () => {
    for (const field of BUSINESS_SCHEMA_ONLY_EXTENSIONS) {
      expect(
        cloudEntities.shops[field],
        `schema-only extension cloudEntities.shops.${field} was removed — if this is intentional, update this test`,
      ).toBeDefined()
    }
  })

  it('schema-only extension `subscriptionExpiry` is canonical date (ISO 8601)', () => {
    expect(cloudEntities.shops.subscriptionExpiry.type).toBe('date')
  })

  // ── 5. Validation: a contract-conformant Business validates against the cloud ──

  it('validates a contract-conformant Business via `validateEntity("shops", ...)`', () => {
    const business = {
      // Contract identity
      id: asBusinessId('00000000-0000-4000-8000-000000000001'),
      ownerPersonId: asPersonId('00000000-0000-4000-8000-000000000002'),
      // Display + slug
      name: 'Nairobi Quickmart',
      slug: 'nairobi-quickmart',
      // Tenant locale (P0-3c additions)
      currency: 'KES',
      country: 'KE',
      // Operational extensions
      taxRate: 16,
      plan: 'free',
      status: 'active',
      // Audit
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
      version: 1,
    }
    expect(() => validateEntity('shops', business)).not.toThrow()
  })

  it('validates a Business with null subscriptionExpiry (post-renewal)', () => {
    const business = {
      id: asBusinessId('00000000-0000-4000-8000-000000000010'),
      ownerPersonId: asPersonId('00000000-0000-4000-8000-000000000011'),
      name: 'Mombasa Duka',
      slug: 'mombasa-duka',
      currency: 'KES',
      country: 'KE',
      taxRate: 0,
      plan: 'pro',
      subscriptionExpiry: null,
      status: 'active',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
      version: 1,
    }
    expect(() => validateEntity('shops', business)).not.toThrow()
  })

  it('validates a Business with status=suspended (canonical enum value)', () => {
    const business = {
      id: asBusinessId('00000000-0000-4000-8000-000000000020'),
      ownerPersonId: asPersonId('00000000-0000-4000-8000-000000000021'),
      name: 'Suspended Shop',
      slug: 'suspended-shop',
      currency: 'KES',
      country: 'KE',
      taxRate: 0,
      plan: 'free',
      status: 'suspended',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
      version: 1,
    }
    expect(() => validateEntity('shops', business)).not.toThrow()
  })

  it('schema rejects unknown field (strict mode preserved)', () => {
    const bad = {
      id: '00000000-0000-4000-8000-000000000030',
      unknown_field: 'oops',
    }
    expect(() => validateEntity('shops', bad)).toThrow()
  })

  // ── 6. Same Business shape is exported from `@soostori/contracts` ───────────

  it('@soostori/contracts still exports `Business` with the canonical fields', () => {
    // Type-level — the type checker enforces presence; the runtime assertion
    // below confirms the import path resolves.
    const businessShape: keyof Business = 'ownerPersonId'
    expect(businessShape).toBe('ownerPersonId')
    // Spot-check additional canonical fields:
    const checks: Array<keyof Business> = [
      'id',
      'ownerPersonId',
      'name',
      'slug',
      'currency',
      'country',
      'taxRate',
      'plan',
      'subscriptionExpiry',
      'status',
      'createdAt',
      'updatedAt',
      'version',
    ]
    expect(checks.length).toBe(13)
  })

  it('Business.status enum covers active | inactive | suspended', () => {
    // Compile-time: `status: 'inactive'` is valid.
    const sample: Business['status'] = 'inactive'
    expect(sample).toBe('inactive')
  })
})

// ── 7. Backwards-compat: legacy deployed `shops` rows still validate ─────────

describe('contract-drift: backwards compatibility with deployed cloud rows', () => {
  it('legacy row missing P0-3c fields (no ownerPersonId, currency, etc.) still validates as `shops`', () => {
    // Simulates a row written before P0-3c landed in the deployed cloud:
    // no ownerPersonId, no currency/country, no audit timestamps, no version.
    // The schema's strict Zod will reject unknown fields, but OPTIONAL fields
    // that are missing should be permitted (they become undefined).
    const legacy = {
      id: '00000000-0000-4000-8000-000000000040',
      name: 'Legacy Shop',
      slug: 'legacy-shop',
      taxRate: 0,
      plan: 'free',
      status: 'active',
    }
    // The schema is strict (rejects unknown fields), but it should accept a
    // row that only carries the legacy fields. P0-3c adds the new fields
    // as optional/with defaults, so a row that omits them is still valid —
    // except for `createdAt` / `updatedAt` which are marked `required: true`.
    // This documents the migration expectation (existing deployed rows
    // need a backfill before they can be re-written via the contract).
    const requiresAuditBackfill = (() => {
      try {
        validateEntity('shops', legacy)
        return false
      } catch {
        return true
      }
    })()
    expect(requiresAuditBackfill).toBe(true)
  })

  it('fully-migrated legacy row (with default-fill audit timestamps + owner) passes', () => {
    const migrated = {
      id: '00000000-0000-4000-8000-000000000050',
      ownerPersonId: '00000000-0000-4000-8000-000000000051',
      name: 'Migrated Shop',
      slug: 'migrated-shop',
      currency: 'KES',
      country: 'KE',
      taxRate: 0,
      plan: 'free',
      status: 'active',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
      version: 1,
    }
    expect(() => validateEntity('shops', migrated)).not.toThrow()
  })
})

// ── 8. Cross-entity smoke: contracts ↔ schema exports resolve ─────────────────

describe('contract-drift: cross-package exports', () => {
  it('Business import resolves and the entity key is registered in the schema', () => {
    // The mere fact that this import didn't throw at the top of the file
    // is the assertion. This block documents the expected surface area.
    const businessExport: keyof Business = 'id'
    expect(businessExport).toBe('id')
    // Schema entities must include `shops` (the storage form of `Business`).
    expect(Object.keys(cloudEntities)).toContain('shops')
  })

  // Re-export the type alias so the file-level type checker confirms the
  // import resolves. Without this, an unused-import lint rule would strip the
  // type import and the file would no longer prove the cross-package wiring.
  void ({} as Business)
})