import { describe, it, expect } from 'vitest'
import {
  buildSession, isValidChain, nextRequiredLink, identityReducer,
  hashPin, verifyPin,
  hasPermission, checkPermission,
  isSessionExpired, isSessionExpiringSoon, serializeSession, deserializeSession,
} from '../src/index'
import {
  hasCapability, can,
  CAPABILITIES, ALL_CAPABILITIES, ROLE_DEFAULT_CAPABILITIES,
} from '../src/permissions'
import type { Member } from '../src/permissions'
import type { User, Shop, Employee, Device } from '@soostori/core'
import { newId, asUserId, asShopId, asEmployeeId, asDeviceId } from '@soostori/core'

const makeUser = (): User => ({ id: asUserId(newId()), email: 'a@b.com', type: 'owner' })
const makeShop = (id?: string): Shop => ({
  id: id ? asShopId(id) : asShopId(newId()),
  name: 'Shop', slug: 'shop', taxRate: 0, plan: 'free',
  subscriptionExpiry: null, status: 'active',
})
const makeEmployee = (shopId: string): Employee => ({
  id: asEmployeeId(newId()),
  shopId: asShopId(shopId),
  name: 'John', email: null, phone: null,
  role: 'cashier', permissions: null,
  cloudId: '', status: 'active',
})
const makeDevice = (shopId: string): Device => ({
  id: asDeviceId(newId()),
  shopId: asShopId(shopId),
  deviceName: 'POS-1', deviceType: 'desktop',
  status: 'authorized', isLanHost: false,
  authorizedAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
})

describe('identity chain', () => {
  it('builds a valid session', () => {
    const user = makeUser()
    const session = buildSession({ user, shop: makeShop(), employee: makeEmployee('s1'), device: makeDevice('s1') })
    expect(session.userId).toBe(user.id)
    expect(session.email).toBe('a@b.com')
  })

  it('nextRequiredLink walks the chain', () => {
    expect(nextRequiredLink({})).toBe('user')
    expect(nextRequiredLink({ user: makeUser() })).toBe('shop')
    expect(nextRequiredLink({ user: makeUser(), shop: makeShop() })).toBe('employee')
  })

  it('isValidChain rejects mismatched shop ids', () => {
    const ctx = {
      user: makeUser(),
      shop: makeShop('shop-1'),
      employee: makeEmployee('shop-DIFFERENT'),
      device: makeDevice('shop-1'),
      session: {} as ReturnType<typeof buildSession>,
    }
    expect(isValidChain(ctx)).toBe(false)
  })
})

describe('identity reducer', () => {
  it('starts with SIGN_IN', () => {
    // SIGN_IN without a shop is allowed — the reducer builds the user state
    // but cannot create the session until a shop is set.
    const state = identityReducer(null, { type: 'SIGN_IN', userId: asUserId('u1'), email: 'a@b.com' })
    expect(state?.user.email).toBe('a@b.com')
  })

  it('SIGN_OUT clears', () => {
    const state = identityReducer(null, { type: 'SIGN_OUT' })
    expect(state).toBeNull()
  })

  it('chains SET_SHOP then SET_EMPLOYEE', () => {
    let s = identityReducer(null, { type: 'SIGN_IN', userId: asUserId('u1'), email: 'a@b.com' })
    s = identityReducer(s, { type: 'SET_SHOP', shop: makeShop() })
    s = identityReducer(s, { type: 'SET_EMPLOYEE', employee: makeEmployee('s1') })
    expect(s?.employee).not.toBeNull()
  })
})

describe('pin hashing', () => {
  it('hashes and verifies', () => {
    const { hash, salt } = hashPin('1234')
    expect(verifyPin('1234', hash, salt)).toBe(true)
    expect(verifyPin('9999', hash, salt)).toBe(false)
  })

  it('rejects wrong length', () => {
    expect(() => hashPin('12')).toThrow()
    expect(() => hashPin('12345')).toThrow()
  })
})

describe('permissions', () => {
  it('owner has full perms', () => {
    expect(hasPermission('owner', 'subscription.manage')).toBe(true)
  })

  it('attendant has only POS', () => {
    expect(hasPermission('attendant', 'pos.sell')).toBe(true)
    expect(hasPermission('attendant', 'inventory.delete')).toBe(false)
  })

  it('overrides role default', () => {
    expect(checkPermission('cashier', 'inventory.delete', { 'inventory.delete': true })).toBe(true)
    expect(checkPermission('owner', 'invoice.void', { 'invoice.void': false })).toBe(false)
  })
})

describe('session', () => {
  it('serialize/deserialize round-trip', () => {
    const s = {
      userId: asUserId(newId()),
      shopId: asShopId(newId()),
      employeeId: asEmployeeId(newId()),
      deviceId: asDeviceId(newId()),
      email: 'a@b.com',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }
    const round = deserializeSession(serializeSession(s))
    expect(round?.userId).toBe(s.userId)
  })

  it('detects expired', () => {
    const s = {
      userId: asUserId(newId()),
      shopId: asShopId(newId()),
      employeeId: asEmployeeId(newId()),
      deviceId: asDeviceId(newId()),
      email: 'a@b.com',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }
    expect(isSessionExpired(s)).toBe(true)
  })

  it('detects expiring soon', () => {
    const s = {
      userId: asUserId(newId()),
      shopId: asShopId(newId()),
      employeeId: asEmployeeId(newId()),
      deviceId: asDeviceId(newId()),
      email: 'a@b.com',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),  // 1 hour
    }
    expect(isSessionExpiringSoon(s, 24)).toBe(true)
    expect(isSessionExpiringSoon(s, 0.5)).toBe(false)
  })
})
