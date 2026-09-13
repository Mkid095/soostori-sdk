/**
 * Repository contract for business/person/membership persistence.
 */

import type { Person, Business, Membership, PersonMemberships } from './types.js'
import type {
  PersonId,
  BusinessId,
  MembershipId,
  DeviceId,
} from '@soostori/core'

/** Pagination options — defined locally since core has no equivalent. */
export interface PaginationOptions {
  limit?: number
  offset?: number
}

export interface BusinessRepository {
  // Person
  findPerson(id: PersonId): Promise<Person | null>
  findPersonByCloudId(cloudUserId: string): Promise<Person | null>
  findPersonByEmail(email: string): Promise<Person | null>
  createPerson(data: Omit<Person, 'id' | 'createdAt' | 'updatedAt'>): Promise<Person>
  updatePerson(id: PersonId, changes: Partial<Person>): Promise<Person>

  // Business
  findBusiness(id: BusinessId): Promise<Business | null>
  findBusinessesByOwner(personId: PersonId): Promise<Business[]>
  createBusiness(data: Omit<Business, 'id' | 'createdAt' | 'updatedAt'>): Promise<Business>
  updateBusiness(id: BusinessId, changes: Partial<Business>): Promise<Business>
  /** Switch active business context for a user. */
  setActiveBusiness(personId: PersonId, businessId: BusinessId): Promise<void>
  /** Get the currently active business for this device. */
  getActiveBusiness(deviceId: DeviceId): Promise<Business | null>

  // Membership
  findMembership(id: MembershipId): Promise<Membership | null>
  findMemberships(personId: PersonId): Promise<Membership[]>
  findMembershipsByBusiness(businessId: BusinessId): Promise<Membership[]>
  createMembership(data: Omit<Membership, 'id' | 'createdAt' | 'updatedAt'>): Promise<Membership>
  updateMembership(id: MembershipId, changes: Partial<Membership>): Promise<Membership>
  revokeMembership(id: MembershipId): Promise<void>

  // Cross-cutting queries
  /** Get a person's complete membership view — all businesses they belong to. */
  getPersonMemberships(personId: PersonId): Promise<PersonMemberships | null>
}
