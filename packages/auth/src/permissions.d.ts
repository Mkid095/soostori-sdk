/**
 * Permission system — role-based defaults + fine-grained overrides.
 *
 * Roles:
 *   - owner:    full access including billing/team management
 *   - manager:  inventory + reports + team management (no billing)
 *   - cashier:  sales + basic inventory
 *   - attendant: POS-only access
 */
import type { EmployeeRole } from '@soostori/core';
export declare const ROLE_PERMISSIONS: Record<EmployeeRole, ReadonlySet<string>>;
/** Check if a role has a specific permission. */
export declare function hasPermission(role: EmployeeRole | null | undefined, permission: string): boolean;
/** Combine role defaults with fine-grained overrides. */
export declare function checkPermission(role: EmployeeRole, permission: string, overrides?: Record<string, boolean> | null): boolean;
//# sourceMappingURL=permissions.d.ts.map