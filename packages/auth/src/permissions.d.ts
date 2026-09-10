import type { EmployeeRole } from '@soostori/core'
export { CAPABILITIES, ALL_CAPABILITIES, ROLE_DEFAULT_CAPABILITIES } from './permissions.js'
export type { Capability, Member } from './permissions.js'
export { hasCapability, can, hasPermission, checkPermission, roleHasCapability } from './permissions.js'
export declare const ROLE_PERMISSIONS: Record<EmployeeRole, ReadonlySet<string>>
export declare function hasPermission(role: EmployeeRole | null | undefined, permission: string): boolean
export declare function checkPermission(role: EmployeeRole, permission: string, overrides?: Record<string, boolean> | null): boolean
export declare function hasCapability(member: import('./permissions.js').Member | null | undefined, capability: import('./permissions.js').Capability): boolean
export declare function can(member: import('./permissions.js').Member | null | undefined, capability: import('./permissions.js').Capability): boolean
