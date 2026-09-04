/**
 * Permission system — role-based defaults + fine-grained overrides.
 *
 * Roles:
 *   - owner:    full access including billing/team management
 *   - manager:  inventory + reports + team management (no billing)
 *   - cashier:  sales + basic inventory
 *   - attendant: POS-only access
 */
export const ROLE_PERMISSIONS = {
    owner: new Set([
        'pos.sell', 'pos.refund',
        'inventory.view', 'inventory.create', 'inventory.update', 'inventory.delete',
        'employee.view', 'employee.create', 'employee.update', 'employee.delete',
        'reports.view', 'reports.export',
        'expenses.view', 'expenses.create', 'expenses.update', 'expenses.delete',
        'debts.view', 'debts.create', 'debts.update', 'debts.delete',
        'customers.view', 'customers.create', 'customers.update', 'customers.delete',
        'settings.view', 'settings.update',
        'devices.view', 'devices.manage',
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
        'devices.view',
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
};
/** Check if a role has a specific permission. */
export function hasPermission(role, permission) {
    if (!role)
        return false;
    return ROLE_PERMISSIONS[role].has(permission);
}
/** Combine role defaults with fine-grained overrides. */
export function checkPermission(role, permission, overrides) {
    // Explicit overrides win
    if (overrides && permission in overrides)
        return Boolean(overrides[permission]);
    // Otherwise use role default
    return hasPermission(role, permission);
}
//# sourceMappingURL=permissions.js.map