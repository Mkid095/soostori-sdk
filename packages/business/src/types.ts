/**
 * Multi-business owner model — canonical types.
 *
 * Replaces the simple `User → Shop` model with:
 *
 *   Person
 *      │
 *      ├── owns/manages
 *      │
 *      ▼
 *   Business (formerly "Shop")
 *      │
 *      ├── has membership(s)
 *      │
 *      ▼
 *   Membership (per business: owner/manager/cashier/etc.)
 *
 * This allows one Person (e.g., a shop owner) to own multiple
 * Businesses, each with its own subscription, employees, devices, and data.
 *
 * The legacy `Shop` type is retained as an alias for backward compatibility.
 */

import type { ISO8601, UUID } from '@soostori/core'

/** A natural person — owner of one or more businesses. */
export interface Person {
  id: UUID
  /** Cloud user ID (from $users) — links Person to cloud identity. */
  cloudUserId: string
  email: string
  displayName: string
  phone?: string | null
  createdAt: ISO8601
  updatedAt: ISO8601
}

/** A business — one operating location (formerly called "Shop"). */
export interface Business {
  id: UUID
  name: string
  slug: string
  taxRate: number
  plan: string
  /** Derived from active subscription. ISO 8601 timestamp. */
  subscriptionExpiry: ISO8601 | null
  status: 'active' | 'inactive' | 'suspended'
  currency: string
  createdAt: ISO8601
  updatedAt: ISO8601
  /** Owner person — always exactly one. */
  ownerPersonId: UUID
}

/** Per-business membership — how a Person relates to a specific Business. */
export interface Membership {
  id: UUID
  personId: UUID
  businessId: UUID
  /** Per-business role (owner, manager, cashier, etc.). */
  role: 'owner' | 'manager' | 'cashier' | 'attendant' | 'viewer'
  /** Fine-grained permission overrides. */
  permissions: Record<string, boolean> | null
  status: 'active' | 'suspended' | 'invited' | 'revoked'
  invitedAt: ISO8601
  joinedAt: ISO8601 | null
  createdAt: ISO8601
  updatedAt: ISO8601
}

/** Cross-business view of one person's memberships. */
export interface PersonMemberships {
  person: Person
  memberships: Array<Membership & { business: Business }>
}

/** Backward-compat alias — Shop is now Business. */
export type Shop = Business
export type ShopId = UUID
