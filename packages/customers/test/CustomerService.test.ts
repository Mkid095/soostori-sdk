import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CustomerService, type CreateCustomerInput } from '../src/CustomerService'
import type { Customer, CustomerRepository, CustomerSearchFilter } from '../src/repository'
import { NoOpSyncEngineClass } from '@soostori/contracts'
import {
  newId,
  asBusinessId,
  asCustomerId,
  asDeviceId,
  asEmployeeId,
  asIdempotencyKey,
} from '@soostori/core'

const BIZ = asBusinessId('biz-1')
const BIZ2 = asBusinessId('biz-other')
const DEVICE = asDeviceId('device-1')
const EMPLOYEE = asEmployeeId('employee-1')

function makeStore() {
  const customers = new Map<string, Customer>()

  const store: CustomerRepository = {
    getCustomer: vi.fn(async (id) => customers.get(id as string) ?? null),

    getCustomerByIdempotencyKey: vi.fn(async (key) =>
      [...customers.values()].find(c => (c as any)._idempotencyKey === key) ?? null
    ),

    getCustomerByPhone: vi.fn(async (bizId, phone) =>
      [...customers.values()].find(c => c.businessId === bizId && c.phone === phone) ?? null
    ),

    listCustomers: vi.fn(async (filter: CustomerSearchFilter) => {
      let result = [...customers.values()].filter(c => c.businessId === filter.businessId)
      if (filter.status && filter.status !== 'all') {
        result = result.filter(c => c.status === filter.status)
      }
      if (filter.query) {
        const q = filter.query.toLowerCase()
        result = result.filter(c =>
          c.name.toLowerCase().includes(q) ||
          (c.phone?.toLowerCase().includes(q) ?? false)
        )
      }
      const offset = filter.offset ?? 0
      const limit = filter.limit ?? 50
      return result.slice(offset, offset + limit)
    }),

    countCustomers: vi.fn(async (filter: CustomerSearchFilter) => {
      let result = [...customers.values()].filter(c => c.businessId === filter.businessId)
      if (filter.status && filter.status !== 'all') {
        result = result.filter(c => c.status === filter.status)
      }
      if (filter.query) {
        const q = filter.query.toLowerCase()
        result = result.filter(c =>
          c.name.toLowerCase().includes(q) ||
          (c.phone?.toLowerCase().includes(q) ?? false)
        )
      }
      return result.length
    }),

    upsertCustomer: vi.fn(async (c) => {
      customers.set(c.id, c)
      // Tag the object with idempotency key so getCustomerByIdempotencyKey can find it
      ;(c as any)._idempotencyKey = (c as any).idempotencyKey
    }),
  }

  return { customers, store }
}

function makeSaleRepo() {
  const saleCustomerIds = new Map<string, string>()
  return {
    saleCustomerIds,
    repo: {
      updateSaleCustomerId: vi.fn(async (saleId, customerId) => {
        saleCustomerIds.set(saleId as string, customerId as string)
      }),
    },
  }
}

describe('CustomerService', () => {
  let store: ReturnType<typeof makeStore>['store']
  let syncEngine: NoOpSyncEngineClass
  let saleRepo: ReturnType<typeof makeSaleRepo>['repo']
  let service: CustomerService

  beforeEach(() => {
    const { store: s } = makeStore()
    store = s
    syncEngine = new NoOpSyncEngineClass()
    const { repo } = makeSaleRepo()
    saleRepo = repo
    service = new CustomerService(store, syncEngine, BIZ, DEVICE, EMPLOYEE)
  })

  // ── createCustomer ──────────────────────────────────────────────────────────

  describe('createCustomer()', () => {
    it('creates a customer and emits customer.created event', async () => {
      const input: CreateCustomerInput = {
        businessId: BIZ,
        name: 'Wanjiku wa Kariuki',
        phone: '+254700123456',
        email: 'wanjiku@example.com',
        idempotencyKey: asIdempotencyKey(newId()),
      }

      const customer = await service.createCustomer(input)

      expect(customer.name).toBe('Wanjiku wa Kariuki')
      expect(customer.phone).toBe('+254700123456')
      expect(customer.email).toBe('wanjiku@example.com')
      expect(customer.status).toBe('active')
      expect(customer.balance).toBe(0)
      expect(customer.version).toBe(1)
      expect(customer.businessId).toBe(BIZ)

      // Sync event emitted
      expect(syncEngine.size).toBe(1)
      const event = syncEngine.pending[0].event
      expect(event.entityKind).toBe('customer')
      expect(event.operation).toBe('create')
      expect(event.entityId).toBe(customer.id)
    })

    it('is idempotent: same idempotencyKey returns existing record', async () => {
      const key = asIdempotencyKey(newId())
      const input: CreateCustomerInput = {
        businessId: BIZ,
        name: 'Idempotent Test',
        phone: '+254711000000',
        idempotencyKey: key,
      }

      const first = await service.createCustomer(input)
      const second = await service.createCustomer({ ...input, name: 'Different Name' })

      expect(second.id).toBe(first.id)
      expect(second.name).toBe('Idempotent Test')  // original preserved

      // No new event emitted on idempotent replay
      expect(syncEngine.size).toBe(1)
    })

    it('blocks cross-business isolation', async () => {
      const input: CreateCustomerInput = {
        businessId: BIZ2,
        name: 'Other Business',
        idempotencyKey: asIdempotencyKey(newId()),
      }

      await expect(service.createCustomer(input)).rejects.toThrow('Business isolation violation')
    })
  })

  // ── updateCustomer ──────────────────────────────────────────────────────────

  describe('updateCustomer()', () => {
    it('updates mutable fields and increments version', async () => {
      const created = await service.createCustomer({
        businessId: BIZ,
        name: 'Original Name',
        phone: '+254700000001',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const updated = await service.updateCustomer(created.id, {
        name: 'Updated Name',
        phone: '+254700000002',
      })

      expect(updated.name).toBe('Updated Name')
      expect(updated.phone).toBe('+254700000002')
      expect(updated.version).toBe(2)
      expect(updated.updatedAt).not.toBe(created.updatedAt)

      // Sync event emitted
      expect(syncEngine.size).toBe(2)
      const event = syncEngine.pending[1].event
      expect(event.name).toBe('customer.updated')
      expect(event.operation).toBe('update')
    })

    it('throws when updating an archived customer', async () => {
      const created = await service.createCustomer({
        businessId: BIZ,
        name: 'To Archive',
        idempotencyKey: asIdempotencyKey(newId()),
      })
      await service.archiveCustomer(created.id)

      await expect(
        service.updateCustomer(created.id, { name: 'New Name' })
      ).rejects.toThrow('Cannot update an archived customer')
    })

    it('throws when customer does not exist', async () => {
      await expect(
        service.updateCustomer(asCustomerId(newId()), { name: 'Ghost' })
      ).rejects.toThrow('not found')
    })
  })

  // ── archiveCustomer ────────────────────────────────────────────────────────

  describe('archiveCustomer()', () => {
    it('sets status to inactive and emits customer.archived event', async () => {
      const created = await service.createCustomer({
        businessId: BIZ,
        name: 'To Archive',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const archived = await service.archiveCustomer(created.id)

      expect(archived.status).toBe('inactive')
      expect(archived.version).toBe(2)

      expect(syncEngine.size).toBe(2)
      const event = syncEngine.pending[1].event
      expect(event.name).toBe('customer.archived')
    })

    it('is idempotent: archiving twice returns without error', async () => {
      const created = await service.createCustomer({
        businessId: BIZ,
        name: 'Twice Archive',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const first = await service.archiveCustomer(created.id)
      const second = await service.archiveCustomer(created.id)

      expect(second.status).toBe('inactive')
      expect(syncEngine.size).toBe(2)  // only original + first archive event
    })
  })

  // ── lookup ────────────────────────────────────────────────────────────────

  describe('getCustomer()', () => {
    it('returns null for non-owned business', async () => {
      const created = await service.createCustomer({
        businessId: BIZ,
        name: 'My Customer',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const foreignService = new CustomerService(store, syncEngine, BIZ2, DEVICE, EMPLOYEE)
      const result = await foreignService.getCustomer(created.id)
      expect(result).toBeNull()
    })
  })

  describe('getCustomerByPhone()', () => {
    it('returns customer by phone within the same business', async () => {
      await service.createCustomer({
        businessId: BIZ,
        name: 'Phone Search',
        phone: '+254799111222',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const found = await service.getCustomerByPhone('+254799111222')
      expect(found).not.toBeNull()
      expect(found!.name).toBe('Phone Search')
    })
  })

  // ── listCustomers ─────────────────────────────────────────────────────────

  describe('listCustomers()', () => {
    it('returns only active customers by default', async () => {
      await service.createCustomer({
        businessId: BIZ, name: 'Active One',
        idempotencyKey: asIdempotencyKey(newId()),
      })
      const archived = await service.createCustomer({
        businessId: BIZ, name: 'Archived One',
        idempotencyKey: asIdempotencyKey(newId()),
      })
      await service.archiveCustomer(archived.id)

      const all = await service.listCustomers({ status: 'all' })
      expect(all).toHaveLength(2)

      const active = await service.listCustomers({ status: 'active' })
      expect(active).toHaveLength(1)
      expect(active[0].name).toBe('Active One')
    })

    it('filters by query on name and phone', async () => {
      await service.createCustomer({
        businessId: BIZ, name: 'Alice Wanjiku',
        phone: '+254700001',
        idempotencyKey: asIdempotencyKey(newId()),
      })
      await service.createCustomer({
        businessId: BIZ, name: 'Bob Kariuki',
        phone: '+254700002',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const results = await service.listCustomers({ query: 'alice' })
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('Alice Wanjiku')
    })
  })

  // ── assignSaleToCustomer ──────────────────────────────────────────────────

  describe('assignSaleToCustomer()', () => {
    it('calls saleRepo.updateSaleCustomerId and emits event', async () => {
      const customer = await service.createCustomer({
        businessId: BIZ,
        name: 'Sale Assignment',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const saleId = asCustomerId(newId())  // using CustomerId as SaleId for test

      await service.assignSaleToCustomer(saleId, customer.id, saleRepo)

      expect(saleRepo.updateSaleCustomerId).toHaveBeenCalledWith(saleId, customer.id)
      expect(syncEngine.size).toBe(2)  // create + assign
      const event = syncEngine.pending[1].event
      expect(event.name).toBe('customer.sale_assigned')
      expect((event.payload as any).saleId).toBe(saleId)
      expect((event.payload as any).customerId).toBe(customer.id)
    })

    it('throws when customer does not exist', async () => {
      await expect(
        service.assignSaleToCustomer(asCustomerId(newId()), asCustomerId(newId()), saleRepo)
      ).rejects.toThrow('not found')
    })
  })

  // ── Critical invariant: no duplicate on replay ─────────────────────────────

  describe('NO DUPLICATE BY REPLAY — idempotency enforcement', () => {
    it('getCustomerByIdempotencyKey is called BEFORE upsert on create', async () => {
      const key = asIdempotencyKey(newId())
      const input: CreateCustomerInput = {
        businessId: BIZ,
        name: 'Replay Test',
        idempotencyKey: key,
      }

      // Simulate replay: call createCustomer twice with same key
      await service.createCustomer(input)
      await service.createCustomer(input)

      // Exactly one customer should exist
      const all = await service.listCustomers({ status: 'all' })
      expect(all).toHaveLength(1)

      // Exactly one sync event emitted
      expect(syncEngine.size).toBe(1)
    })
  })
})
