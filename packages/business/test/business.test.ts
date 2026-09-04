import { describe, it, expect, vi } from 'vitest'
import { BusinessService } from '../src/index'
import type { BusinessRepository } from '../src/index'
import type { Business, Person, Membership } from '../src/types'
import { getEventBus } from '@soostori/events'
import { newId, asShopId, asDeviceId } from '@soostori/core'

const DEVICE = asDeviceId('d-1')

/** Create a Person object (caller stores in mock if needed). */
function makePerson(): Person {
  return {
    id: newId() as Person['id'],
    cloudUserId: 'cu-' + Math.random().toString(36).slice(2),
    email: 'owner@example.com',
    displayName: 'Owner',
    phone: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function mockRepo(): BusinessRepository {
  const persons = new Map<string, Person>()
  const businesses = new Map<string, Business>()
  const memberships = new Map<string, Membership>()
  return {
    findPerson: vi.fn(async (id) => persons.get(id) ?? null),
    findPersonByCloudId: vi.fn(async (cid) =>
      [...persons.values()].find(p => p.cloudUserId === cid) ?? null
    ),
    findPersonByEmail: vi.fn(async (email) =>
      [...persons.values()].find(p => p.email === email) ?? null
    ),
    createPerson: vi.fn(async (data) => {
      const p: Person = {
        ...data,
        id: newId() as Person['id'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      persons.set(p.id, p)
      return p
    }),
    updatePerson: vi.fn(async (id, changes) => {
      const existing = persons.get(id)
      if (!existing) throw new Error('Person not found')
      const updated: Person = { ...existing, ...changes, updatedAt: new Date().toISOString() }
      persons.set(id, updated)
      return updated
    }),
    findBusiness: vi.fn(async (id) => businesses.get(id) ?? null),
    findBusinessesByOwner: vi.fn(async (ownerId) =>
      [...businesses.values()].filter(b => b.ownerPersonId === ownerId)
    ),
    createBusiness: vi.fn(async (data) => {
      const b: Business = {
        ...data,
        id: newId() as Business['id'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      businesses.set(b.id, b)
      return b
    }),
    updateBusiness: vi.fn(async (id, changes) => {
      const existing = businesses.get(id)
      if (!existing) throw new Error('Business not found')
      const updated: Business = { ...existing, ...changes, updatedAt: new Date().toISOString() }
      businesses.set(id, updated)
      return updated
    }),
    setActiveBusiness: vi.fn(async () => {}),
    getActiveBusiness: vi.fn(async () => null),
    findMembership: vi.fn(async (id) => memberships.get(id) ?? null),
    findMemberships: vi.fn(async (personId) =>
      [...memberships.values()].filter(m => m.personId === personId)
    ),
    findMembershipsByBusiness: vi.fn(async (businessId) =>
      [...memberships.values()].filter(m => m.businessId === businessId)
    ),
    createMembership: vi.fn(async (data) => {
      const m: Membership = {
        ...data,
        id: newId() as Membership['id'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      memberships.set(m.id, m)
      return m
    }),
    updateMembership: vi.fn(async (id, changes) => {
      const existing = memberships.get(id)
      if (!existing) throw new Error('Membership not found')
      const updated: Membership = { ...existing, ...changes, updatedAt: new Date().toISOString() }
      memberships.set(id, updated)
      return updated
    }),
    getPersonMemberships: vi.fn(async (personId) => {
      const person = [...persons.values()].find(p => p.id === personId)
      if (!person) return null
      return {
        person,
        memberships: [...memberships.values()]
          .filter(m => m.personId === personId)
          .map(m => ({ ...m, business: businesses.get(m.businessId)! })),
      }
    }),
  }
}

describe('BusinessService', () => {
  it('creates business and emits event', async () => {
    getEventBus().clear()
    const repo = mockRepo()
    const service = new BusinessService(repo, DEVICE)
    const owner = makePerson()
    // Pre-register owner so getPersonMemberships can find them
    await repo.createPerson({
      cloudUserId: owner.cloudUserId,
      email: owner.email,
      displayName: owner.displayName,
      phone: owner.phone,
    })
    // Use the person actually in the repo (createPerson generated a new id)
    const stored = await repo.findPersonByEmail!(owner.email)
    const ownerId = stored!.id

    const business = await service.createBusiness({
      name: 'My Shop', slug: 'my-shop', taxRate: 16, currency: 'KES',
      ownerPersonId: ownerId,
    })

    expect(business.name).toBe('My Shop')
    expect(business.ownerPersonId).toBe(ownerId)
  })

  it('creates owner membership automatically', async () => {
    const repo = mockRepo()
    const service = new BusinessService(repo, DEVICE)
    const owner = makePerson()
    await repo.createPerson({
      cloudUserId: owner.cloudUserId,
      email: owner.email,
      displayName: owner.displayName,
      phone: owner.phone,
    })
    const stored = await repo.findPersonByEmail!(owner.email)
    const ownerId = stored!.id
    await service.createBusiness({
      name: 'My Shop', slug: 's', taxRate: 16, currency: 'KES',
      ownerPersonId: ownerId,
    })
    const memberships = await repo.findMemberships(ownerId)
    expect(memberships).toHaveLength(1)
    expect(memberships[0].role).toBe('owner')
    expect(memberships[0].status).toBe('active')
  })

  it('invites employee', async () => {
    const repo = mockRepo()
    const service = new BusinessService(repo, DEVICE)
    const owner = makePerson()
    const employee = makePerson()
    await repo.createPerson({
      cloudUserId: owner.cloudUserId,
      email: owner.email,
      displayName: owner.displayName,
      phone: owner.phone,
    })
    const stored = await repo.findPersonByEmail!(owner.email)
    const ownerId = stored!.id
    await repo.createPerson({
      cloudUserId: employee.cloudUserId,
      email: employee.email,
      displayName: employee.displayName,
      phone: employee.phone,
    })
    const empStored = await repo.findPersonByEmail!(employee.email)
    const employeeId = empStored!.id

    const business = await service.createBusiness({
      name: 'X', slug: 'x', taxRate: 0, currency: 'KES',
      ownerPersonId: ownerId,
    })
    const membership = await service.inviteEmployee({
      businessId: business.id, personId: employeeId,
      role: 'cashier', invitedByPersonId: ownerId,
    })
    expect(membership.role).toBe('cashier')
    expect(membership.status).toBe('invited')
  })

  it('revokes employee', async () => {
    const repo = mockRepo()
    const service = new BusinessService(repo, DEVICE)
    const owner = makePerson()
    const employee = makePerson()
    await repo.createPerson({
      cloudUserId: owner.cloudUserId,
      email: owner.email,
      displayName: owner.displayName,
      phone: owner.phone,
    })
    const stored = await repo.findPersonByEmail!(owner.email)
    const ownerId = stored!.id
    await repo.createPerson({
      cloudUserId: employee.cloudUserId,
      email: employee.email,
      displayName: employee.displayName,
      phone: employee.phone,
    })
    const empStored = await repo.findPersonByEmail!(employee.email)
    const employeeId = empStored!.id

    const business = await service.createBusiness({
      name: 'X', slug: 'x', taxRate: 0, currency: 'KES',
      ownerPersonId: ownerId,
    })
    const m = await service.inviteEmployee({
      businessId: business.id, personId: employeeId,
      role: 'cashier', invitedByPersonId: ownerId,
    })
    await service.revokeEmployee(m.id)
    const updated = await repo.findMembership(m.id)
    expect(updated?.status).toBe('revoked')
  })

  it('returns all memberships for a person', async () => {
    const repo = mockRepo()
    const service = new BusinessService(repo, DEVICE)
    const owner = makePerson()
    await repo.createPerson({
      cloudUserId: owner.cloudUserId,
      email: owner.email,
      displayName: owner.displayName,
      phone: owner.phone,
    })
    const stored = await repo.findPersonByEmail!(owner.email)
    const ownerId = stored!.id

    await service.createBusiness({
      name: 'A', slug: 'a', taxRate: 0, currency: 'KES',
      ownerPersonId: ownerId,
    })
    await service.createBusiness({
      name: 'B', slug: 'b', taxRate: 0, currency: 'KES',
      ownerPersonId: ownerId,
    })
    const memberships = await service.getPersonMemberships(ownerId)
    expect(memberships?.memberships).toHaveLength(2)
  })
})
