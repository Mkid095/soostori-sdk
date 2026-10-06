/**
 * Schema-vs-contract Business match test (P0-3c, audit 2026-10-05).
 *
 * Verifies that a `@soostori/contracts` `Business` (the canonical contract)
 * validates against `@soostori/schema`'s runtime Zod for the `shops` cloud
 * entity. This is the runtime leg of the contract drift guard:
 *
 *   - `packages/contract-tests/test/contract-drift-business.test.ts` locks the
 *     schema fields against the contract fields at the structural level.
 *   - This file locks the runtime behavior — a contract-conformant Business
 *     must round-trip through `validateEntity('shops', ...)` without error.
 *
 * If a future change adds a required field to the contract without also
 * adding it to the schema (or vice versa), the corresponding test fails.
 */

import { describe, it, expect } from 'vitest'
import { cloudEntities, validateEntity } from '../src/entities'
import { asBusinessId, asPersonId, newId } from '@soostori/core'

/**
 * Build a minimal contract-conformant Business. All fields default to
 * canonical values; override in the test body for edge cases.
 */
function makeContractBusiness(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const ts = '2026-10-05T00:00:00.000Z'
  return {
    id: asBusinessId(newId()),
    ownerPersonId: asPersonId(newId()),
    name: 'Nairobi Quickmart',
    slug: 'nairobi-quickmart',
    currency: 'KES',
    country: 'KE',
    taxRate: 16,
    plan: 'free',
    subscriptionExpiry: ts,
    status: 'active',
    createdAt: ts,
    updatedAt: ts,
    version: 1,
    ...overrides,
  }
}

describe('schema: shops cloud entity ↔ contracts Business (P0-3c)', () => {
  it('cloudEntities.shops is registered', () => {
    expect(cloudEntities.shops).toBeDefined()
    expect(Object.keys(cloudEntities.shops).length).toBeGreaterThan(0)
  })

  it('validates a minimal contract-conformant Business (only required fields)', () => {
    // `name`, `createdAt`, `updatedAt` are the schema-required fields; all
    // others have defaults or are optional.
    const business = {
      id: newId(),
      name: 'Minimal Shop',
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    }
    expect(() => validateEntity('shops', business)).not.toThrow()
  })

  it('validates a fully-populated contract Business', () => {
    const business = makeContractBusiness({
      subscriptionExpiry: null,
    })
    expect(() => validateEntity('shops', business)).not.toThrow()
  })

  it('validates a Business with status=suspended (canonical enum)', () => {
    const business = makeContractBusiness({ status: 'suspended' })
    expect(() => validateEntity('shops', business)).not.toThrow()
  })

  it('validates a Business with status=inactive (canonical enum)', () => {
    const business = makeContractBusiness({ status: 'inactive' })
    expect(() => validateEntity('shops', business)).not.toThrow()
  })

  it('rejects an unknown field (strict Zod)', () => {
    // Even with P0-3c additions, the schema stays strict — unknown fields
    // must not silently pass. This protects against accidental data drift.
    const business = makeContractBusiness({ unknown_field: 'oops' })
    expect(() => validateEntity('shops', business)).toThrow()
  })

  it('rejects a row missing `name` (required field)', () => {
    const business = makeContractBusiness()
    delete (business as { name?: string }).name
    expect(() => validateEntity('shops', business)).toThrow()
  })

  it('rejects a row missing `createdAt` (required audit timestamp)', () => {
    const business = makeContractBusiness()
    delete (business as { createdAt?: string }).createdAt
    expect(() => validateEntity('shops', business)).toThrow()
  })

  // ── Field-type spot checks — catches regressions where a field's type ──────
  // ── silently drifts (e.g. a uuid becomes a string). ─────────────────────

  it('Business fields have expected primitive types', () => {
    const e = cloudEntities.shops
    expect(e.id.type).toBe('uuid')
    expect(e.ownerPersonId.type).toBe('uuid')
    expect(e.name.type).toBe('string')
    expect(e.slug.type).toBe('string')
    expect(e.currency.type).toBe('string')
    expect(e.country.type).toBe('string')
    expect(e.taxRate.type).toBe('number')
    expect(e.plan.type).toBe('string')
    expect(e.subscriptionExpiry.type).toBe('date')
    expect(e.status.type).toBe('string')
    expect(e.createdAt.type).toBe('string')
    expect(e.updatedAt.type).toBe('string')
    expect(e.version.type).toBe('number')
  })

  it('P0-3c additions — ownerPersonId, currency, country, createdAt, updatedAt, version — are present with correct types', () => {
    expect(cloudEntities.shops.ownerPersonId).toBeDefined()
    expect(cloudEntities.shops.ownerPersonId.type).toBe('uuid')
    expect(cloudEntities.shops.currency).toBeDefined()
    expect(cloudEntities.shops.currency.type).toBe('string')
    expect(cloudEntities.shops.country).toBeDefined()
    expect(cloudEntities.shops.country.type).toBe('string')
    expect(cloudEntities.shops.createdAt).toBeDefined()
    expect(cloudEntities.shops.createdAt.type).toBe('string')
    expect(cloudEntities.shops.updatedAt).toBeDefined()
    expect(cloudEntities.shops.updatedAt.type).toBe('string')
    expect(cloudEntities.shops.version).toBeDefined()
    expect(cloudEntities.shops.version.type).toBe('number')
  })

  it('P0-3c additions have sensible defaults (KES, KE, version=1)', () => {
    expect(cloudEntities.shops.currency.default).toBe('KES')
    expect(cloudEntities.shops.country.default).toBe('KE')
    expect(cloudEntities.shops.version.default).toBe(1)
  })

  it('ownerPersonId is indexed for Person→Business lookups', () => {
    expect(cloudEntities.shops.ownerPersonId.indexed).toBe(true)
  })
})