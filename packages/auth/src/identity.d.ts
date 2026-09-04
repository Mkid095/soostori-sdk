/**
 * Canonical Soostori identity model.
 *
 * The chain is:
 *   FIDScript User ($users)
 *     ↓
 *   Company (companies)
 *     ↓
 *   Shop (shops)
 *     ↓
 *   Employee (employees)
 *     ↓
 *   Device (devices)
 *     ↓
 *   Authorized Session
 *
 * Local PIN is NOT a cloud identity. It only unlocks an already-authorized
 * employee on a specific device.
 */
import type { UserId, User, Company, Shop, Employee, Device, AuthSession } from '@soostori/core';
/** Identity context — fully resolved after sign-in. */
export interface IdentityContext {
    user: User;
    company: Company | null;
    shop: Shop | null;
    employee: Employee | null;
    device: Device | null;
    session: AuthSession | null;
}
/** Build a session token from context. */
export declare function buildSession(ctx: Pick<IdentityContext, 'user' | 'shop' | 'employee' | 'device'>): AuthSession;
/** Resolve identity chain — strict ordering check. */
export declare function isValidChain(ctx: Partial<IdentityContext>): ctx is IdentityContext;
/** Determine the next link needed to complete the chain. */
export declare function nextRequiredLink(ctx: Partial<IdentityContext>): string | null;
/** Identity state transitions. */
export type IdentityAction = {
    type: 'SIGN_IN';
    userId: UserId;
    email: string;
} | {
    type: 'SET_COMPANY';
    company: Company;
} | {
    type: 'SET_SHOP';
    shop: Shop;
} | {
    type: 'SET_EMPLOYEE';
    employee: Employee;
} | {
    type: 'SET_DEVICE';
    device: Device;
} | {
    type: 'SIGN_OUT';
};
/** Identity reducer — pure function. */
export declare function identityReducer(state: IdentityContext | null, action: IdentityAction): IdentityContext | null;
//# sourceMappingURL=identity.d.ts.map