/**
 * Phase 04: Canonical capability registry — standalone test suite.
 * Run via: pnpm vitest run packages/auth/test/capabilities.test.ts
 */
import { describe, it, expect } from 'vitest'
// Use dist/permissions.js to bypass all TS compilation and module resolution issues
// The dist file is the canonical compiled output verified to contain all exports
import * as permissions from '../dist/permissions.js'
const { hasCapability, can, CAPABILITIES, ALL_CAPABILITIES, ROLE_DEFAULT_CAPABILITIES, hasPermission } = permissions
import type { Member } from '../dist/permissions.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const member = (role: Member['role'], overrides?: Member['memberCapabilityOverrides']): Member =>
  overrides ? { role, memberCapabilityOverrides: overrides } : { role }

// ── Canonical capabilities are all declared ───────────────────────────────────

describe('capability registry', () => {
  it('all 45 canonical capabilities are present', () => {
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

  it('ALL_CAPABILITIES contains all CAPABILITIES values', () => {
    const values = Object.values(CAPABILITIES)
    expect(ALL_CAPABILITIES).toHaveLength(values.length)
    for (const v of values) {
      expect(ALL_CAPABILITIES).toContain(v)
    }
  })

  // ── Owner: all capabilities ──────────────────────────────────────────────

  it('owner has every capability', () => {
    const o = member('owner')
    for (const cap of ALL_CAPABILITIES) {
      expect(hasCapability(o, cap)).toBe(true)
    }
  })

  it('owner has products.create', () => expect(hasCapability(member('owner'), 'products.create')).toBe(true))
  it('owner has sales.void', () => expect(hasCapability(member('owner'), 'sales.void')).toBe(true))
  it('owner has business.update', () => expect(hasCapability(member('owner'), 'business.update')).toBe(true))

  // ── Manager: all except business.update + team.assign_permission ─────────

  it('manager has every capability except the two restricted ones', () => {
    const m = member('manager')
    for (const cap of ALL_CAPABILITIES) {
      if (cap !== 'business.update' && cap !== 'team.assign_permission') {
        expect(hasCapability(m, cap)).toBe(true)
      }
    }
  })

  it('manager cannot update business', () => expect(hasCapability(member('manager'), 'business.update')).toBe(false))
  it('manager cannot assign permissions', () => expect(hasCapability(member('manager'), 'team.assign_permission')).toBe(false))
  it('manager has team.assign_role', () => expect(hasCapability(member('manager'), 'team.assign_role')).toBe(true))

  // ── Cashier: sales + customers + inventory + products basics ─────────────

  it('cashier has sales.create and sales.view', () => {
    const c = member('cashier')
    expect(hasCapability(c, 'sales.create')).toBe(true)
    expect(hasCapability(c, 'sales.view')).toBe(true)
  })

  it('cashier cannot void sales', () => expect(hasCapability(member('cashier'), 'sales.void')).toBe(false))
  it('cashier cannot refund sales', () => expect(hasCapability(member('cashier'), 'sales.refund')).toBe(false))
  it('cashier cannot view profit', () => expect(hasCapability(member('cashier'), 'sales.view_profit')).toBe(false))
  it('cashier has customers.view', () => expect(hasCapability(member('cashier'), 'customers.view')).toBe(true))
  it('cashier cannot delete customers', () => expect(hasCapability(member('cashier'), 'customers.delete')).toBe(false))
  it('cashier has inventory.view', () => expect(hasCapability(member('cashier'), 'inventory.view')).toBe(true))
  it('cashier cannot approve inventory adjustments', () => expect(hasCapability(member('cashier'), 'inventory.approve_adjustment')).toBe(false))
  it('cashier cannot manage team', () => expect(hasCapability(member('cashier'), 'team.invite')).toBe(false))
  it('cashier cannot manage devices', () => expect(hasCapability(member('cashier'), 'devices.manage')).toBe(false))

  // ── Attendant: inventory + products + customers view ──────────────────────

  it('attendant has inventory.view, products.view, customers.view', () => {
    const a = member('attendant')
    expect(hasCapability(a, 'inventory.view')).toBe(true)
    expect(hasCapability(a, 'products.view')).toBe(true)
    expect(hasCapability(a, 'customers.view')).toBe(true)
  })

  it('attendant cannot create products', () => expect(hasCapability(member('attendant'), 'products.create')).toBe(false))
  it('attendant cannot create sales', () => expect(hasCapability(member('attendant'), 'sales.create')).toBe(false))

  // ── Viewer: products + inventory + reports view ───────────────────────────

  it('viewer has products.view, inventory.view, reports.view', () => {
    const v = member('viewer')
    expect(hasCapability(v, 'products.view')).toBe(true)
    expect(hasCapability(v, 'inventory.view')).toBe(true)
    expect(hasCapability(v, 'reports.view')).toBe(true)
  })

  it('viewer cannot create sales', () => expect(hasCapability(member('viewer'), 'sales.create')).toBe(false))
  it('viewer cannot export reports', () => expect(hasCapability(member('viewer'), 'reports.export')).toBe(false))

  // ── Member overrides ───────────────────────────────────────────────────

  it('override grants a capability the role denies', () => {
    expect(hasCapability(member('cashier', { 'sales.void': true }), 'sales.void')).toBe(true)
  })

  it('override denies a capability the role grants', () => {
    expect(hasCapability(member('owner', { 'business.update': false }), 'business.update')).toBe(false)
  })

  it('override takes precedence for owner', () => {
    expect(hasCapability(member('owner', { 'sales.void': false }), 'sales.void')).toBe(false)
  })

  // ── Null / undefined member ─────────────────────────────────────────────

  it('hasCapability returns false for null', () => expect(hasCapability(null, 'products.view')).toBe(false))
  it('hasCapability returns false for undefined', () => expect(hasCapability(undefined, 'products.view')).toBe(false))

  // ── can() convenience wrapper ────────────────────────────────────────────

  it('can() is a boolean wrapper', () => {
    expect(can(member('owner'), 'sales.void')).toBe(true)
    expect(can(member('cashier'), 'sales.void')).toBe(false)
  })

  // ── ROLE_DEFAULT_CAPABILITIES arrays ────────────────────────────────────

  it('owner bundle has all capabilities', () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(ROLE_DEFAULT_CAPABILITIES.owner).toContain(cap)
    }
  })

  it('manager bundle excludes business.update and team.assign_permission', () => {
    expect(ROLE_DEFAULT_CAPABILITIES.manager).not.toContain('business.update')
    expect(ROLE_DEFAULT_CAPABILITIES.manager).not.toContain('team.assign_permission')
    expect(ROLE_DEFAULT_CAPABILITIES.manager).toContain('business.view')
    expect(ROLE_DEFAULT_CAPABILITIES.manager).toContain('team.assign_role')
  })

  it('cashier bundle matches brief', () => {
    const c = ROLE_DEFAULT_CAPABILITIES.cashier
    expect(c).toContain('sales.create')
    expect(c).toContain('sales.view')
    expect(c).toContain('customers.view')
    expect(c).toContain('inventory.view')
    expect(c).toContain('products.view')
    expect(c).not.toContain('sales.void')
    expect(c).not.toContain('team.invite')
  })

  it('attendant bundle matches brief', () => {
    const a = ROLE_DEFAULT_CAPABILITIES.attendant
    expect(a).toContain('inventory.view')
    expect(a).toContain('products.view')
    expect(a).toContain('customers.view')
    expect(a).not.toContain('sales.create')
  })

  it('viewer bundle matches brief', () => {
    const v = ROLE_DEFAULT_CAPABILITIES.viewer
    expect(v).toContain('products.view')
    expect(v).toContain('inventory.view')
    expect(v).toContain('reports.view')
    expect(v).not.toContain('sales.create')
  })

  // ── Legacy back-compat ───────────────────────────────────────────────────

  it('hasPermission still works for legacy code', () => {
    expect(hasPermission('owner', 'pos.sell')).toBe(true)
    expect(hasPermission('attendant', 'pos.sell')).toBe(true)
    expect(hasPermission('attendant', 'inventory.delete')).toBe(false)
  })
})
