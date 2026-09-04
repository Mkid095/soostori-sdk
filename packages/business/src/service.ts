/**
 * Business service — orchestrates Person/Business/Membership operations.
 *
 * CRITICAL: One subscription = one business. Each Business has its own
 * subscription, employees, devices, and operational data. Businesses are
 * fully isolated — no data crosses between them.
 */

import type { Person, Business, Membership } from './types'
import type { BusinessRepository } from './repository'
import type { UUID } from '@soostori/core'
import { newId, asShopId, asDeviceId } from '@soostori/core'
import {
  createEvent, BUSINESS_CREATED, MEMBERSHIP_INVITED, MEMBERSHIP_REVOKED,
} from '@soostori/events'
import { getEventBus } from '@soostori/events'

export class BusinessService {
  constructor(
    private readonly repo: BusinessRepository,
    private readonly deviceId: UUID,
  ) {}

  /** Create a new business for a Person. */
  async createBusiness(args: {
    name: string
    slug: string
    taxRate: number
    currency: string
    ownerPersonId: UUID
  }): Promise<Business> {
    const business = await this.repo.createBusiness({
      ...args,
      plan: 'free',
      subscriptionExpiry: null,
      status: 'active',
    })

    // Auto-create owner membership
    await this.repo.createMembership({
      personId: args.ownerPersonId,
      businessId: business.id,
      role: 'owner',
      permissions: null,
      status: 'active',
      invitedAt: new Date().toISOString(),
      joinedAt: new Date().toISOString(),
    })

    await getEventBus().publish(createEvent({
      name: BUSINESS_CREATED,
      shopId: asShopId(business.id),
      deviceId: asDeviceId(this.deviceId),
      entityId: business.id,
      entity: 'business',
      payload: { businessId: business.id, name: business.name, ownerPersonId: args.ownerPersonId },
    }))

    return business
  }

  /** Invite an employee to a business. */
  async inviteEmployee(args: {
    businessId: UUID
    personId: UUID
    role: Membership['role']
    invitedByPersonId: UUID
  }): Promise<Membership> {
    const membership = await this.repo.createMembership({
      personId: args.personId,
      businessId: args.businessId,
      role: args.role,
      permissions: null,
      status: 'invited',
      invitedAt: new Date().toISOString(),
      joinedAt: null,
    })

    await getEventBus().publish(createEvent({
      name: MEMBERSHIP_INVITED,
      shopId: asShopId(args.businessId),
      deviceId: asDeviceId(this.deviceId),
      entityId: membership.id,
      entity: 'membership',
      payload: { membershipId: membership.id, businessId: args.businessId, personId: args.personId, role: args.role },
    }))

    return membership
  }

  /** Revoke an employee's access. */
  async revokeEmployee(membershipId: UUID): Promise<void> {
    await this.repo.updateMembership(membershipId, { status: 'revoked' })
    const membership = await this.repo.findMembership(membershipId)
    if (membership) {
      await getEventBus().publish(createEvent({
        name: MEMBERSHIP_REVOKED,
        shopId: asShopId(membership.businessId),
        deviceId: asDeviceId(this.deviceId),
        entityId: membership.id,
        entity: 'membership',
        payload: { membershipId: membership.id },
      }))
    }
  }

  /** Get all businesses a person belongs to. */
  async getPersonMemberships(personId: UUID) {
    return this.repo.getPersonMemberships(personId)
  }
}
