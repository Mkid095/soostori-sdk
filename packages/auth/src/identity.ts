/**
 * Canonical Soostori identity model.
 *
 * The chain is:
 *   FIDScript User ($users) — cloud identity (Google account, email/password)
 *     ↓ cloudId link
 *   Employee (employees) — shop membership with roles/permissions
 *     ↓ deviceId link
 *   Device (devices) — enrolled device with local PIN verifier
 *     ↓
 *   OperationalSession — local PIN verified, can make mutations
 *
 * Local PIN is NOT a cloud identity. It only unlocks an already-authorized
 * employee on a specific device. The cloud stores only `Device.hasPin`.
 *
 * NOTE: Company (companies) was removed — no such entity exists in the
 * FIDScript remote schema. Shops are the top-level business entity.
 */

import type {
  UserId, ShopId, EmployeeId, DeviceId,
  User, Shop, Employee, Device, AuthSession,
} from '@soostori/core'

/** Identity context — fully resolved after sign-in. */
export interface IdentityContext {
  user: User
  shop: Shop | null
  employee: Employee | null
  device: Device | null
  session: AuthSession | null
}

/** Build a session token from context. */
export function buildSession(ctx: Pick<IdentityContext, 'user' | 'shop' | 'employee' | 'device'>): AuthSession {
  const now = new Date()
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)  // 30 days
  return {
    userId: ctx.user.id,
    shopId: ctx.shop!.id,
    employeeId: ctx.employee!.id,
    deviceId: ctx.device!.id,
    email: ctx.user.email,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  }
}

/** Resolve identity chain — strict ordering check. */
export function isValidChain(ctx: Partial<IdentityContext>): ctx is IdentityContext {
  const emp = ctx.employee, dev = ctx.device
  if (!emp || !dev) return false
  // Employee must belong to the shop
  if (emp.shopId !== ctx.shop?.id) return false
  // Device must belong to the same shop as the employee
  if (dev.shopId !== emp.shopId) return false
  // Device must be authorized
  if (dev.status !== 'authorized') return false
  // Session must match
  if (ctx.session?.userId !== ctx.user?.id) return false
  if (!ctx.session || ctx.session.shopId !== ctx.shop.id) return false
  if (ctx.session.employeeId !== emp.id) return false
  if (ctx.session.deviceId !== dev.id) return false
  return true
}

/** Determine the next link needed to complete the chain. */
export function nextRequiredLink(ctx: Partial<IdentityContext>): string | null {
  if (!ctx.user) return 'user'
  if (!ctx.shop) return 'shop'
  if (!ctx.employee) return 'employee'
  if (!ctx.device) return 'device'
  if (!ctx.session) return 'session'
  return null
}

/** Identity state transitions. */
export type IdentityAction =
  | { type: 'SIGN_IN'; userId: UserId; email: string }
  | { type: 'SET_SHOP'; shop: Shop }
  | { type: 'SET_EMPLOYEE'; employee: Employee }
  | { type: 'SET_DEVICE'; device: Device }
  | { type: 'SIGN_OUT' }

/** Identity reducer — pure function. */
export function identityReducer(
  state: IdentityContext | null,
  action: IdentityAction
): IdentityContext | null {
  switch (action.type) {
    case 'SIGN_IN': {
      return {
        user: { id: action.userId, email: action.email, type: 'owner' },
        shop: null,
        employee: null,
        device: null,
        session: null,
      }
    }
    case 'SET_SHOP':
      return state ? { ...state, shop: action.shop } : null
    case 'SET_EMPLOYEE':
      return state ? { ...state, employee: action.employee } : null
    case 'SET_DEVICE':
      if (state && state.user && state.shop && state.employee && action.device) {
        const session = buildSession({
          user: state.user,
          shop: state.shop,
          employee: state.employee,
          device: action.device,
        })
        return { ...state, device: action.device, session }
      }
      return state ? { ...state, device: action.device } : null
    case 'SIGN_OUT':
      return null
    default:
      return state
  }
}
