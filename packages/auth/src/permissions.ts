/**
 * Permission system — role-based defaults + fine-grained overrides.
 *
 * Roles:
 *   - owner:    full access including billing/team management
 *   - manager:  inventory + reports + team management (no billing)
 *   - cashier:  sales + basic inventory
 *   - attendant: POS-only access
 *
 * Phase 04: Canonical capability registry.
 * Every platform implements these capabilities; roles bundle them;
 * individual members can override.
 */

import type { EmployeeRole } from '@soostori/core'

// ── Legacy permission strings (back-compat) ──────────────────────────────────

export const ROLE_PERMISSIONS: Record<EmployeeRole, ReadonlySet<string>> = {
  owner: new Set([
    'pos.sell', 'pos.refund',
    'inventory.view', 'inventory.create', 'inventory.update', 'inventory.delete',
    'employee.view', 'employee.create', 'employee.update', 'employee.delete',
    'reports.view', 'reports.export',
    'expenses.view', 'expenses.create', 'expenses.update', 'expenses.delete',
    'debts.view', 'debts.create', 'debts.update', 'debts.delete',
    'customers.view', 'customers.create', 'customers.update', 'customers.delete',
    'settings.view', 'settings.update',
    'devices.view', 'devices.manage', 'devices.transfer_primary',
    'subscription.view', 'subscription.manage',
    'cloud.snapshot', 'cloud.fullSync',
  ]),
  manager: new Set([
    'pos.sell', 'pos.refund',
    'inventory.view', 'inventory.create', 'inventory.update', 'inventory.delete',
    'employee.view', 'employee.create', 'employee.update',
    'reports.view', 'reports.export',
    'expenses.view', 'expenses.create', 'expenses.update',
    'debts.view', 'debts.create', 'debts.update', 'debts.delete',
    'customers.view', 'customers.create', 'customers.update', 'customers.delete',
    'settings.view',
    'devices.view', 'devices.manage', 'devices.transfer_primary',
  ]),
  cashier: new Set([
    'pos.sell',
    'inventory.view', 'inventory.update',
    'customers.view', 'customers.create',
    'reports.view',
  ]),
  attendant: new Set([
    'pos.sell',
    'inventory.view',
  ]),
  viewer: new Set([
    'inventory.view',
    'products.view',
    'reports.view',
  ]),
}

/** Check if a role has a specific permission. */
export function hasPermission(role: EmployeeRole | null | undefined, permission: string): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role].has(permission)
}

/** Combine role defaults with fine-grained overrides. */
export function checkPermission(
  role: EmployeeRole,
  permission: string,
  overrides?: Record<string, boolean> | null
): boolean {
  // Explicit overrides win
  if (overrides && permission in overrides) return Boolean(overrides[permission])
  // Otherwise use role default
  return hasPermission(role, permission)
}

// ── Phase 04: Canonical capability registry ───────────────────────────────────

/**
 * All canonical capabilities declared by the SDK.
 * Format: `{domain}.{action}` — lower-case, dot-separated.
 */
export const CAPABILITIES = {
  // Products
  PRODUCTS_VIEW:            'products.view',
  PRODUCTS_CREATE:         'products.create',
  PRODUCTS_UPDATE:         'products.update',
  PRODUCTS_ARCHIVE:        'products.archive',
  PRODUCTS_IMPORT:         'products.import',
  PRODUCTS_EXPORT:         'products.export',
  // Inventory
  INVENTORY_VIEW:          'inventory.view',
  INVENTORY_RECEIVE:       'inventory.receive',
  INVENTORY_ADJUST:        'inventory.adjust',
  INVENTORY_TRANSFER:      'inventory.transfer',
  INVENTORY_APPROVE:       'inventory.approve_adjustment',
  // Sales
  SALES_VIEW:              'sales.view',
  SALES_CREATE:            'sales.create',
  SALES_DISCOUNT:          'sales.discount',
  SALES_VOID:              'sales.void',
  SALES_REFUND:            'sales.refund',
  SALES_EXPORT:            'sales.export',
  SALES_VIEW_PROFIT:       'sales.view_profit',
  // Customers
  CUSTOMERS_VIEW:          'customers.view',
  CUSTOMERS_CREATE:        'customers.create',
  CUSTOMERS_UPDATE:        'customers.update',
  CUSTOMERS_DELETE:        'customers.delete',
  // Debts
  DEBTS_VIEW:              'debts.view',
  DEBTS_CREATE:            'debts.create',
  DEBTS_PAYMENT:           'debts.payment',
  DEBTS_WRITEOFF:          'debts.writeoff',
  DEBTS_REMIND:            'debts.remind',
  // Expenses
  EXPENSES_VIEW:           'expenses.view',
  EXPENSES_CREATE:         'expenses.create',
  EXPENSES_UPDATE:         'expenses.update',
  EXPENSES_DELETE:         'expenses.delete',
  EXPENSES_APPROVE:        'expenses.approve',
  // Team
  TEAM_VIEW:               'team.view',
  TEAM_INVITE:             'team.invite',
  TEAM_UPDATE:             'team.update',
  TEAM_REMOVE:             'team.remove',
  TEAM_ASSIGN_ROLE:        'team.assign_role',
  TEAM_ASSIGN_PERMISSION:  'team.assign_permission',
  // Reports
  REPORTS_VIEW:            'reports.view',
  REPORTS_EXPORT:           'reports.export',
  // Devices
  DEVICES_VIEW:            'devices.view',
  DEVICES_MANAGE:          'devices.manage',
  DEVICES_TRANSFER_PRIMARY: 'devices.transfer_primary',
  // Settings
  SETTINGS_VIEW:           'settings.view',
  SETTINGS_UPDATE:         'settings.update',
  // Business
  BUSINESS_VIEW:           'business.view',
  BUSINESS_UPDATE:         'business.update',
  // Web / partner
  SALE_READ:               'sale.read',
  PARTNER_MANAGE:          'partner.manage',
  PARTNER_VIEW:            'partner.view',
  PARTNER_APPLY:           'partner.apply',
  PARTNER_APPROVE:         'partner.approve',
  PARTNER_REJECT:          'partner.reject',
  PARTNER_ENROLL:          'partner.enroll',    // Phase 18 — enroll a business
  PARTNER_CONVERT:         'partner.convert',  // Phase 18 — record a conversion
  COMMISSION_VIEW_OWN:     'commission.view_own',
  COMMISSION_VIEW_ALL:     'commission.view_all',
  SUBSCRIPTION_MANAGE:     'subscription.manage',
  TEAM_MANAGE:             'team.manage',
  SETTINGS_MANAGE:         'settings.manage',
} as const

export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES]

/** All canonical capability strings. */
export const ALL_CAPABILITIES: readonly Capability[] = Object.values(CAPABILITIES)

/**
 * Default capability bundle per role.
 * owner: all capabilities
 * manager: all except business.update, team.assign_permission
 * cashier: sales + customers + inventory + products basics
 * attendant: inventory + products + customers view
 * viewer: products + inventory + reports view
 */
// Type cast needed: workspace core (alpha.9) includes 'viewer' role but
// the published @soostori/core this package resolves at build-time only has 4 roles.
// Casting through `any` sidesteps the spurious 5th-key mismatch.
export const ROLE_DEFAULT_CAPABILITIES = {
  owner:      ALL_CAPABILITIES,
  manager:    ALL_CAPABILITIES.filter(c =>
    c !== 'business.update' && c !== 'team.assign_permission'
  ),
  cashier:    [
    CAPABILITIES.SALES_CREATE,
    CAPABILITIES.SALES_VIEW,
    CAPABILITIES.CUSTOMERS_VIEW,
    CAPABILITIES.INVENTORY_VIEW,
    CAPABILITIES.PRODUCTS_VIEW,
    CAPABILITIES.PARTNER_VIEW,
    CAPABILITIES.COMMISSION_VIEW_OWN,
  ],
  attendant:  [
    CAPABILITIES.INVENTORY_VIEW,
    CAPABILITIES.PRODUCTS_VIEW,
    CAPABILITIES.CUSTOMERS_VIEW,
    CAPABILITIES.PARTNER_VIEW,
    CAPABILITIES.COMMISSION_VIEW_OWN,
  ],
  viewer:     [
    CAPABILITIES.PRODUCTS_VIEW,
    CAPABILITIES.INVENTORY_VIEW,
    CAPABILITIES.REPORTS_VIEW,
    CAPABILITIES.PARTNER_VIEW,
    CAPABILITIES.COMMISSION_VIEW_OWN,
  ],
} as Record<EmployeeRole, readonly Capability[]>

/** True if role bundle contains the given capability. */
function roleHasCapability(role: EmployeeRole, capability: Capability): boolean {
  return (ROLE_DEFAULT_CAPABILITIES[role] as readonly Capability[]).includes(capability)
}

// ── Member override support ────────────────────────────────────────────────────

/**
 * A member object that can be checked for capabilities.
 * Supports the legacy `permissions` field (Record<string, boolean>) and the
 * canonical `memberCapabilityOverrides` field.
 */
export interface Member {
  role: EmployeeRole
  /** Legacy per-entity permission overrides. */
  permissions?: Record<string, boolean> | null
  /**
   * Canonical capability-level overrides.
   * Key: capability string, Value: true=grant, false=deny.
   * When present, takes precedence over role bundle.
   */
  memberCapabilityOverrides?: Record<Capability, boolean> | null
}

/**
 * Check if a member has a specific capability.
 * Resolution order:
 *   1. If `memberCapabilityOverrides` contains the capability, use that value.
 *   2. Otherwise, check the role's default capability bundle.
 *
 * @param member  - the member object (must have a role)
 * @param capability - the capability string to check
 */
export function hasCapability(member: Member | null | undefined, capability: Capability): boolean {
  if (!member || !member.role) return false

  // Override takes absolute precedence
  if (member.memberCapabilityOverrides && capability in member.memberCapabilityOverrides) {
    return Boolean(member.memberCapabilityOverrides[capability])
  }

  return roleHasCapability(member.role, capability)
}

/**
 * Convenience boolean wrapper around `hasCapability`.
 * Use this in guard expressions: `if (!can(member, 'products.create')) return`
 */
export function can(member: Member | null | undefined, capability: Capability): boolean {
  return hasCapability(member, capability)
}
