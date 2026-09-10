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

// ── Phase 04: Capability registry tests ─────────────────────────────────────

describe('capability registry', () => {

  // ── Canonical capabilities are defined ──────────────────────────────────

  it('all canonical capabilities are present', () => {
    expect(CAPABILITIES.PRODUCTS_VIEW).toBe('products.view')
    expect(CAPABILITIES.PRODUCTS_CREATE).toBe('products.create')
    expect(CAPABILITIES.PRODUCTS_UPDATE).toBe('products.update')
    expect(CAPABILITIES.PRODUCTS_ARCHIVE).toBe('products.archive')
    expect(CAPABILITIES.PRODUCTS_IMPORT).toBe('products.import')
    expect(CAPABILITIES.PRODUCTS_EXPORT).toBe('products.export')
    expect(CAPABILITIES.INVENTORY_VIEW).toBe('inventory.view')
    expect(CAPABILITIES.INVENTORY_RECEIVE).toBe('inventory.receive')
    expect(CAPABILITIES.INVENTORY_ADJUST).toBe('inventory.adjust')
    expect(CAPABILITIES.INVENTORY_TRANSFER).toBe('inventory.transfer')
    expect(CAPABILITIES.INVENTORY_APPROVE).toBe('inventory.approve_adjustment')
    expect(CAPABILITIES.SALES_VIEW).toBe('sales.view')
    expect(CAPABILITIES.SALES_CREATE).toBe('sales.create')
    expect(CAPABILITIES.SALES_DISCOUNT).toBe('sales.discount')
    expect(CAPABILITIES.SALES_VOID).toBe('sales.void')
    expect(CAPABILITIES.SALES_REFUND).toBe('sales.refund')
    expect(CAPABILITIES.SALES_EXPORT).toBe('sales.export')
    expect(CAPABILITIES.SALES_VIEW_PROFIT).toBe('sales.view_profit')
    expect(CAPABILITIES.CUSTOMERS_VIEW).toBe('customers.view')
    expect(CAPABILITIES.CUSTOMERS_CREATE).toBe('customers.create')
    expect(CAPABILITIES.CUSTOMERS_UPDATE).toBe('customers.update')
    expect(CAPABILITIES.CUSTOMERS_DELETE).toBe('customers.delete')
    expect(CAPABILITIES.DEBTS_VIEW).toBe('debts.view')
    expect(CAPABILITIES.DEBTS_CREATE).toBe('debts.create')
    expect(CAPABILITIES.DEBTS_PAYMENT).toBe('debts.payment')
    expect(CAPABILITIES.DEBTS_WRITEOFF).toBe('debts.writeoff')
    expect(CAPABILITIES.DEBTS_REMIND).toBe('debts.remind')
    expect(CAPABILITIES.EXPENSES_VIEW).toBe('expenses.view')
    expect(CAPABILITIES.EXPENSES_CREATE).toBe('expenses.create')
    expect(CAPABILITIES.EXPENSES_UPDATE).toBe('expenses.update')
    expect(CAPABILITIES.EXPENSES_DELETE).toBe('expenses.delete')
    expect(CAPABILITIES.EXPENSES_APPROVE).toBe('expenses.approve')
    expect(CAPABILITIES.TEAM_VIEW).toBe('team.view')
    expect(CAPABILITIES.TEAM_INVITE).toBe('team.invite')
    expect(CAPABILITIES.TEAM_UPDATE).toBe('team.update')
    expect(CAPABILITIES.TEAM_REMOVE).toBe('team.remove')
    expect(CAPABILITIES.TEAM_ASSIGN_ROLE).toBe('team.assign_role')
    expect(CAPABILITIES.TEAM_ASSIGN_PERMISSION).toBe('team.assign_permission')
    expect(CAPABILITIES.REPORTS_VIEW).toBe('reports.view')
    expect(CAPABILITIES.REPORTS_EXPORT).toBe('reports.export')
    expect(CAPABILITIES.DEVICES_VIEW).toBe('devices.view')
    expect(CAPABILITIES.DEVICES_MANAGE).toBe('devices.manage')
    expect(CAPABILITIES.SETTINGS_VIEW).toBe('settings.view')
    expect(CAPABILITIES.SETTINGS_UPDATE).toBe('settings.update')
    expect(CAPABILITIES.BUSINESS_VIEW).toBe('business.view')
    expect(CAPABILITIES.BUSINESS_UPDATE).toBe('business.update')
  })

  // ── Owner: all capabilities ────────────────────────────────────────────────

  it('owner has every capability', () => {
    const owner: Member = { role: 'owner' }
    for (const cap of ALL_CAPABILITIES) {
      expect(hasCapability(owner, cap)).toBe(true)
    }
  })

  it('owner has products.create', () => {
    expect(hasCapability({ role: 'owner' }, 'products.create')).toBe(true)
  })

  it('owner has sales.void', () => {
    expect(hasCapability({ role: 'owner' }, 'sales.void')).toBe(true)
  })

  it('owner has business.update', () => {
    expect(hasCapability({ role: 'owner' }, 'business.update')).toBe(true)
  })

  // ── Manager: all except business.update + team.assign_permission ──────────

  it('manager has most capabilities', () => {
    const manager: Member = { role: 'manager' }
    for (const cap of ALL_CAPABILITIES) {
      if (cap !== 'business.update' && cap !== 'team.assign_permission') {
        expect(hasCapability(manager, cap)).toBe(true)
      }
    }
  })

  it('manager cannot update business', () => {
    expect(hasCapability({ role: 'manager' }, 'business.update')).toBe(false)
  })

  it('manager cannot assign permissions', () => {
    expect(hasCapability({ role: 'manager' }, 'team.assign_permission')).toBe(false)
  })

  it('manager has team.assign_role', () => {
    expect(hasCapability({ role: 'manager' }, 'team.assign_role')).toBe(true)
  })

  // ── Cashier: sales + customers + inventory + products basics ─────────────

  it('cashier has sales.create and sales.view', () => {
    const cashier: Member = { role: 'cashier' }
    expect(hasCapability(cashier, 'sales.create')).toBe(true)
    expect(hasCapability(cashier, 'sales.view')).toBe(true)
  })

  it('cashier cannot void sales', () => {
    expect(hasCapability({ role: 'cashier' }, 'sales.void')).toBe(false)
  })

  it('cashier cannot refund sales', () => {
    expect(hasCapability({ role: 'cashier' }, 'sales.refund')).toBe(false)
  })

  it('cashier cannot view profit', () => {
    expect(hasCapability({ role: 'cashier' }, 'sales.view_profit')).toBe(false)
  })

  it('cashier has customers.view', () => {
    expect(hasCapability({ role: 'cashier' }, 'customers.view')).toBe(true)
  })

  it('cashier cannot delete customers', () => {
    expect(hasCapability({ role: 'cashier' }, 'customers.delete')).toBe(false)
  })

  it('cashier has inventory.view', () => {
    expect(hasCapability({ role: 'cashier' }, 'inventory.view')).toBe(true)
  })

  it('cashier cannot approve inventory adjustments', () => {
    expect(hasCapability({ role: 'cashier' }, 'inventory.approve_adjustment')).toBe(false)
  })

  it('cashier cannot manage team', () => {
    expect(hasCapability({ role: 'cashier' }, 'team.invite')).toBe(false)
  })

  it('cashier cannot manage devices', () => {
    expect(hasCapability({ role: 'cashier' }, 'devices.manage')).toBe(false)
  })

  // ── Attendant: inventory + products + customers view ──────────────────────

  it('attendant has inventory.view and products.view', () => {
    const attendant: Member = { role: 'attendant' }
    expect(hasCapability(attendant, 'inventory.view')).toBe(true)
    expect(hasCapability(attendant, 'products.view')).toBe(true)
    expect(hasCapability(attendant, 'customers.view')).toBe(true)
  })

  it('attendant cannot create products', () => {
    expect(hasCapability({ role: 'attendant' }, 'products.create')).toBe(false)
  })

  it('attendant cannot create sales', () => {
    expect(hasCapability({ role: 'attendant' }, 'sales.create')).toBe(false)
  })

  // ── Viewer: products + inventory + reports view ────────────────────────────

  it('viewer has products.view, inventory.view, reports.view', () => {
    const viewer: Member = { role: 'viewer' }
    expect(hasCapability(viewer, 'products.view')).toBe(true)
    expect(hasCapability(viewer, 'inventory.view')).toBe(true)
    expect(hasCapability(viewer, 'reports.view')).toBe(true)
  })

  it('viewer cannot create sales', () => {
    expect(hasCapability({ role: 'viewer' }, 'sales.create')).toBe(false)
  })

  it('viewer cannot export reports', () => {
    expect(hasCapability({ role: 'viewer' }, 'reports.export')).toBe(false)
  })

  // ── Member overrides ───────────────────────────────────────────────────────

  it('member override grants a capability the role denies', () => {
    const cashier: Member = {
      role: 'cashier',
      memberCapabilityOverrides: { 'sales.void': true },
    }
    expect(hasCapability(cashier, 'sales.void')).toBe(true)
  })

  it('member override denies a capability the role grants', () => {
    const owner: Member = {
      role: 'owner',
      memberCapabilityOverrides: { 'business.update': false },
    }
    expect(hasCapability(owner, 'business.update')).toBe(false)
  })

  it('override takes precedence over role even for owner', () => {
    const owner: Member = {
      role: 'owner',
      memberCapabilityOverrides: { 'sales.void': false },
    }
    expect(hasCapability(owner, 'sales.void')).toBe(false)
  })

  it('override with null means deny', () => {
    const cashier: Member = {
      role: 'cashier',
      memberCapabilityOverrides: { 'sales.create': false },
    }
    expect(hasCapability(cashier, 'sales.create')).toBe(false)
  })

  // ── Null / undefined member ───────────────────────────────────────────────

  it('hasCapability returns false for null member', () => {
    expect(hasCapability(null, 'products.view')).toBe(false)
  })

  it('hasCapability returns false for undefined member', () => {
    expect(hasCapability(undefined, 'products.view')).toBe(false)
  })

  it('can() is just hasCapability() returning boolean', () => {
    const owner: Member = { role: 'owner' }
    const cashier: Member = { role: 'cashier' }
    expect(can(owner, 'sales.void')).toBe(true)
    expect(can(cashier, 'sales.void')).toBe(false)
  })

  // ── Role default capabilities arrays ──────────────────────────────────────

  it('owner ROLE_DEFAULT_CAPABILITIES contains all capabilities', () => {
    const caps = ROLE_DEFAULT_CAPABILITIES.owner
    for (const cap of ALL_CAPABILITIES) {
      expect(caps).toContain(cap)
    }
  })

  it('manager ROLE_DEFAULT_CAPABILITIES excludes business.update and team.assign_permission', () => {
    const caps = ROLE_DEFAULT_CAPABILITIES.manager
    expect(caps).not.toContain('business.update')
    expect(caps).not.toContain('team.assign_permission')
    expect(caps).toContain('business.view')
    expect(caps).toContain('team.assign_role')
  })

  it('cashier ROLE_DEFAULT_CAPABILITIES matches brief', () => {
    const caps = ROLE_DEFAULT_CAPABILITIES.cashier
    expect(caps).toContain('sales.create')
    expect(caps).toContain('sales.view')
    expect(caps).toContain('customers.view')
    expect(caps).toContain('inventory.view')
    expect(caps).toContain('products.view')
    expect(caps).not.toContain('sales.void')
    expect(caps).not.toContain('team.invite')
  })

  it('attendant ROLE_DEFAULT_CAPABILITIES matches brief', () => {
    const caps = ROLE_DEFAULT_CAPABILITIES.attendant
    expect(caps).toContain('inventory.view')
    expect(caps).toContain('products.view')
    expect(caps).toContain('customers.view')
    expect(caps).not.toContain('sales.create')
  })

  it('viewer ROLE_DEFAULT_CAPABILITIES matches brief', () => {
    const caps = ROLE_DEFAULT_CAPABILITIES.viewer
    expect(caps).toContain('products.view')
    expect(caps).toContain('inventory.view')
    expect(caps).toContain('reports.view')
    expect(caps).not.toContain('sales.create')
  })
})
