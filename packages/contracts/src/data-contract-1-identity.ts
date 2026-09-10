/**
 * Canonical entity contract — Part 1: Identity (Person / Business / Membership / Employee / Device / Invitation).
 *
 * §10–§12, §36–§44 of the Soostori vision.
 * Single source of truth for Web, Desktop, Mobile, and Cloud.
 * Every row is tenant-scoped via `businessId: BusinessId`.
 *
 * Lifecycle / state machines live in the JSDoc per entity.
 * Audit timestamps use `ISO8601`. Every entity carries a monotonic `version: number`
 * used for last-writer-wins conflict resolution.
 */

import type {
  BusinessId, PersonId, MembershipId, EmployeeId, DeviceId, InvitationId, UserId,
  ISO8601,
} from '@soostori/core'

// ── Person ────────────────────────────────────────────────────────────────────
/**
 * Person — natural person / cloud identity owner (§2/§3).
 * Separate from Business: one Person can own or be a member of many Businesses.
 *
 * Relationships:
 *   - Memberships ← Membership (via personId)
 *   - Cloud identity ← FIDScript $users.id (via cloudUserId)
 *
 * Audit: createdAt, updatedAt, version (entity-level, monotonic per write).
 */
export interface Person {
  id: PersonId
  /** FIDScript $users.id — links Person to cloud auth identity. */
  cloudUserId: string
  email: string
  displayName: string
  phone?: string | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

/**
 * Business — the tenant (formerly "Shop"; §7, §10, §36).
 * Every operational row carries a `businessId: BusinessId`.
 *
 * Relationships:
 *   - Memberships ← Membership (via businessId)
 *   - Employees ← Employee (via shopId — legacy field name; semantically businessId)
 *   - Devices ← Device (via shopId)
 *   - Subscription ← Subscription (via shopId)
 */
export interface Business {
  id: BusinessId
  name: string
  slug: string
  taxRate: number
  plan: string
  /** Derived from active subscription. */
  subscriptionExpiry: ISO8601 | null
  status: 'active' | 'inactive' | 'suspended'
  currency: string
  /** Exactly one Person owns the Business. */
  ownerPersonId: PersonId
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

/**
 * Membership — Person ↔ Business (§8, §10, §37).
 * One row per (personId, businessId). Drives RBAC.
 *
 * Lifecycle: invited → active ↔ suspended → revoked.
 */
export interface Membership {
  id: MembershipId
  personId: PersonId
  businessId: BusinessId
  role: 'owner' | 'manager' | 'cashier' | 'attendant' | 'viewer'
  permissions?: Record<string, boolean> | null
  status: 'active' | 'suspended' | 'invited' | 'revoked'
  invitedAt: ISO8601
  joinedAt: ISO8601 | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

/**
 * Employee — FIDScript-anchored operational identity inside a Business (§42).
 * One Employee per Person per Business. Has `cloudId` link to `$users.id`.
 *
 * Lifecycle: active ↔ inactive (suspension is via Membership.status).
 */
export interface Employee {
  id: EmployeeId
  businessId: BusinessId
  name: string
  email?: string | null
  phone?: string | null
  role: 'owner' | 'manager' | 'cashier' | 'attendant'
  permissions?: Record<string, boolean> | null
  /** Forward-identity link to FIDScript $users.id. */
  cloudId: string
  status: 'active' | 'inactive'
  createdBy?: UserId | null
  invitedBy?: UserId | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}
