/**
 * Repository contract for business/person/membership persistence.
 */

import type { Person, Business, Membership, PersonMemberships } from './types.js'
import type { UUID } from '@soostori/core'

/** Pagination options — defined locally since core has no equivalent. */
export interface PaginationOptions {
  limit?: number
  offset?: number
}

export interface BusinessRepository {
  // Person
  findPerson(id: UUID): Promise<Person | null>
  findPersonByCloudId(cloudUserId: string): Promise<Person | null>
  findPersonByEmail(email: string): Promise<Person | null>
  createPerson(data: Omit<Person, 'id' | 'createdAt' | 'updatedAt'>): Promise<Person>
  updatePerson(id: UUID, changes: Partial<Person>): Promise<Person>

  // Business
  findBusiness(id: UUID): Promise<Business | null>
  findBusinessesByOwner(personId: UUID): Promise<Business[]>
  createBusiness(data: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>): Promise<Business>
  updateBusiness(id: UUID, changes: Partial<Business>): Promise<Business>
  /** Switch active business context for a user. */
  setActiveBusiness(personId: UUID, businessId: UUID): Promise<void>
  /** Get the currently active business for this device. */
  getActiveBusiness(deviceId: UUID): Promise<Business | null>

  // Membership
  findMembership(id: UUID): Promise<Membership | null>
  findMemberships(personId: UUID): Promise<Membership[]>
  findMembershipsByBusiness(businessId: UUID): Promise<Membership[]>
  createMembership(data: Omit<Membership, 'id' | 'createdAt' | 'updatedAt'>): Promise<Membership>
  updateMembership(id: UUID, changes: Partial<Membership>): Promise<Membership>
  revokeMembership(id: UUID): Promise<void>

  // Cross-cutting queries
  /** Get a person's complete membership view — all businesses they belong to. */
  getPersonMemberships(personId: UUID): Promise<PersonMemberships | null>
}
