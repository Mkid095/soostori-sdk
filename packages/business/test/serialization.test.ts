/**
 * Branded ID serialization — verify branded IDs survive JSON round-trip.
 */

import { describe, expect, it } from 'vitest'
import {
  asBusinessId,
  asPersonId,
  asMembershipId,
  asDeviceId,
  asEmployeeId,
  asProductId,
  asCustomerId,
  asSaleId,
  asDebtId,
  asExpenseId,
  asSubscriptionId,
  asSyncEventId,
  asIdempotencyKey,
} from '@soostori/core'

describe('Branded ID serialization round-trip', () => {

  const roundtrip = <T>(brandFn: (s: string) => T, str: string): T => {
    const original = brandFn(str)
    const serialized = JSON.stringify(original)
    const parsed = JSON.parse(serialized) as T
    return parsed
  }

  it('BusinessId survives JSON round-trip', () => {
    const id = asBusinessId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asBusinessId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('PersonId survives JSON round-trip', () => {
    const id = asPersonId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asPersonId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('MembershipId survives JSON round-trip', () => {
    const id = asMembershipId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asMembershipId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('DeviceId survives JSON round-trip', () => {
    const id = asDeviceId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asDeviceId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('EmployeeId survives JSON round-trip', () => {
    const id = asEmployeeId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asEmployeeId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('ProductId survives JSON round-trip', () => {
    const id = asProductId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asProductId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('CustomerId survives JSON round-trip', () => {
    const id = asCustomerId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asCustomerId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('SaleId survives JSON round-trip', () => {
    const id = asSaleId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asSaleId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('DebtId survives JSON round-trip', () => {
    const id = asDebtId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asDebtId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  // Note: asExpenseId and asSaleItemId not yet exported from @soostori/core — tracked as GAP-19

  it('SubscriptionId survives JSON round-trip', () => {
    const id = asSubscriptionId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asSubscriptionId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('SyncEventId survives JSON round-trip', () => {
    const id = asSyncEventId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asSyncEventId, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('IdempotencyKey survives JSON round-trip', () => {
    const id = asIdempotencyKey('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    const restored = roundtrip(asIdempotencyKey, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(restored).toBe(id)
  })

  it('Branded IDs compare equal to plain strings (brand erasure)', () => {
    const businessId = asBusinessId('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(businessId).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479')
    expect(businessId).toBeTruthy()
  })
})
