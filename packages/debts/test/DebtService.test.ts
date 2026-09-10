import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DebtService, type CreateDebtInput, type RecordPaymentInput } from '../src/DebtService'
import type { DebtRepository } from '../src/DebtRepository'
import type { Debt, DebtPayment } from '@soostori/contracts'
import { NoOpSyncEngineClass } from '@soostori/contracts'
import {
  newId,
  asBusinessId,
  asCustomerId,
  asDebtId,
  asDeviceId,
  asEmployeeId,
  asIdempotencyKey,
  asSaleId,
} from '@soostori/core'

const BIZ = asBusinessId('biz-1')
const BIZ2 = asBusinessId('biz-other')
const DEVICE = asDeviceId('device-1')
const EMPLOYEE = asEmployeeId('employee-1')

function makeStore() {
  const debts = new Map<string, Debt>()
  const payments = new Map<string, DebtPayment>()

  const store: DebtRepository = {
    getDebt: vi.fn(async (id) => debts.get(id as string) ?? null),

    getDebtByIdempotencyKey: vi.fn(async (key) =>
      [...debts.values()].find(d => (d as any)._idempotencyKey === key) ?? null
    ),

    listDebts: vi.fn(async ({ businessId, status }) => {
      let result = [...debts.values()].filter(d => d.businessId === businessId)
      if (status && status !== 'all') {
        result = result.filter(d => d.status === status)
      }
      return result.map(d => ({
        ...d,
        paymentCount: [...payments.values()].filter(p => p.debtId === d.id).length,
      }))
    }),

    countDebts: vi.fn(async ({ businessId, status }) => {
      let result = [...debts.values()].filter(d => d.businessId === businessId)
      if (status && status !== 'all') result = result.filter(d => d.status === status)
      return result.length
    }),

    getTotalOutstandingForCustomer: vi.fn(async (businessId, customerId) => {
      return [...debts.values()]
        .filter(d => d.businessId === businessId && d.customerId === customerId && d.status !== 'paid' && d.status !== 'written_off')
        .reduce((sum, d) => sum + d.balance, 0)
    }),

    upsertDebt: vi.fn(async (d) => {
      debts.set(d.id, d)
      ;(d as any)._idempotencyKey = (d as any).idempotencyKey
    }),

    getPayment: vi.fn(async (id) => payments.get(id as string) ?? null),

    getPaymentByIdempotencyKey: vi.fn(async (key) =>
      [...payments.values()].find(p => p.idempotencyKey === key) ?? null
    ),

    getPaymentsForDebt: vi.fn(async (debtId) =>
      [...payments.values()].filter(p => p.debtId === debtId)
    ),

    listPayments: vi.fn(async ({ debtId }) =>
      [...payments.values()].filter(p => !debtId || p.debtId === debtId)
    ),

    upsertPayment: vi.fn(async (p) => {
      payments.set(p.id, p)
    }),

    computeBalance: vi.fn(async (debtId) =>
      [...payments.values()].filter(p => p.debtId === debtId).reduce((s, p) => s + p.amount, 0)
    ),
  }

  return { debts, payments, store }
}

describe('DebtService', () => {
  let store: ReturnType<typeof makeStore>['store']
  let syncEngine: NoOpSyncEngineClass
  let service: DebtService

  beforeEach(() => {
    const { store: s } = makeStore()
    store = s
    syncEngine = new NoOpSyncEngineClass()
    service = new DebtService(store, syncEngine, BIZ, DEVICE, EMPLOYEE)
  })

  // ── createDebt ───────────────────────────────────────────────────────────────

  describe('createDebt()', () => {
    it('creates a debt with correct fields', async () => {
      const customerId = asCustomerId(newId())
      const saleId = asSaleId(newId())
      const input: CreateDebtInput = {
        businessId: BIZ,
        customerId,
        amount: 50000 as any,
        saleId,
        dueDate: '2025-12-31',
        notes: 'Test note',
        idempotencyKey: asIdempotencyKey(newId()),
      }

      const debt = await service.createDebt(input)

      expect(debt.businessId).toBe(BIZ)
      expect(debt.customerId).toBe(customerId)
      expect(debt.amount).toBe(50000)
      expect(debt.balance).toBe(50000)
      expect(debt.status).toBe('pending')
      expect(debt.dueDate).toBe('2025-12-31')
      expect(debt.notes).toBe('Test note')
      expect(debt.version).toBe(1)
    })

    it('emits debt.created SyncEvent', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 10000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      expect(syncEngine.size).toBe(1)
      const event = syncEngine.pending[0].event
      expect(event.entityKind).toBe('debt')
      expect(event.operation).toBe('create')
      expect(event.entityId).toBe(debt.id)
    })

    it('is idempotent: same idempotencyKey returns existing debt', async () => {
      const key = asIdempotencyKey(newId())
      const customerId = asCustomerId(newId())

      const first = await service.createDebt({
        businessId: BIZ, customerId,
        amount: 20000 as any, idempotencyKey: key,
      })
      const second = await service.createDebt({
        businessId: BIZ, customerId,
        amount: 99999 as any, idempotencyKey: key,
      })

      expect(second.id).toBe(first.id)
      expect(syncEngine.size).toBe(1)
    })

    it('blocks cross-business isolation', async () => {
      await expect(service.createDebt({
        businessId: BIZ2,
        customerId: asCustomerId(newId()),
        amount: 10000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })).rejects.toThrow('Business isolation violation')
    })
  })

  // ── recordPayment ──────────────────────────────────────────────────────────

  describe('recordPayment()', () => {
    async function makeDebt(amount = 50000) {
      return service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: amount as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })
    }

    it('partial payment: outstanding decreases, status becomes partial', async () => {
      const debt = await makeDebt(50000)

      const { debt: updated, payment } = await service.recordPayment({
        debtId: debt.id,
        amount: 20000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      expect(updated.balance).toBe(30000)
      expect(updated.status).toBe('partial')
      expect(updated.version).toBe(2)
      expect(payment.amount).toBe(20000)
    })

    it('full payment: status becomes paid, balance is zero', async () => {
      const debt = await makeDebt(50000)

      const { debt: updated } = await service.recordPayment({
        debtId: debt.id,
        amount: 50000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'mobile_money',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      expect(updated.balance).toBe(0)
      expect(updated.status).toBe('paid')
    })

    it('emits debt.payment.created SyncEvent', async () => {
      const debt = await makeDebt(50000)
      await service.recordPayment({
        debtId: debt.id,
        amount: 10000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      expect(syncEngine.size).toBe(2) // create + payment
      const event = syncEngine.pending[1].event
      expect(event.entityKind).toBe('debtPayment')
      expect(event.operation).toBe('create')
      expect((event.payload as any).payment.amount).toBe(10000)
    })

    it('is idempotent on payment idempotencyKey', async () => {
      const debt = await makeDebt(50000)
      const key = asIdempotencyKey(newId())

      const first = await service.recordPayment({
        debtId: debt.id,
        amount: 10000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: key,
      })

      const second = await service.recordPayment({
        debtId: debt.id,
        amount: 99999 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'card',
        idempotencyKey: key,
      })

      expect(second.payment.id).toBe(first.payment.id)
      expect(syncEngine.size).toBe(2) // only one payment event emitted
    })

    it('throws when debt does not exist', async () => {
      await expect(service.recordPayment({
        debtId: asDebtId(newId()),
        amount: 10000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: asIdempotencyKey(newId()),
      })).rejects.toThrow('not found')
    })

    it('throws when debt is already paid', async () => {
      const debt = await makeDebt(50000)
      await service.recordPayment({
        debtId: debt.id,
        amount: 50000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: asIdempotencyKey(newId()),
      })
      await expect(service.recordPayment({
        debtId: debt.id,
        amount: 1000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: asIdempotencyKey(newId()),
      })).rejects.toThrow('Cannot pay a paid debt')
    })
  })

  // ── settleDebt ──────────────────────────────────────────────────────────────

  describe('settleDebt()', () => {
    it('sets balance to 0 and status to paid', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 30000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const settled = await service.settleDebt(debt.id)

      expect(settled.balance).toBe(0)
      expect(settled.status).toBe('paid')
      expect(settled.version).toBe(2)
    })

    it('emits debt.settled SyncEvent', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 15000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })
      await service.settleDebt(debt.id)

      const event = syncEngine.pending[1].event
      expect(event.entityKind).toBe('debt')
      expect(event.operation).toBe('update')
      expect((event.payload as any).settledAt).toBeTruthy()
    })

    it('is idempotent: settling twice does not error', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 25000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const first = await service.settleDebt(debt.id)
      const second = await service.settleDebt(debt.id)

      expect(second.status).toBe('paid')
      expect(syncEngine.size).toBe(2)
    })

    it('throws when debt does not exist', async () => {
      await expect(service.settleDebt(asDebtId(newId()))).rejects.toThrow('not found')
    })
  })

  // ── writeOffDebt ─────────────────────────────────────────────────────────────

  describe('writeOffDebt()', () => {
    it('sets balance to 0 and status to written_off', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 30000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const writtenOff = await service.writeOffDebt(debt.id, 'customer vanished')

      expect(writtenOff.balance).toBe(0)
      expect(writtenOff.status).toBe('written_off')
      expect(writtenOff.notes).toContain('WRITE-OFF')
    })

    it('is idempotent: write-off twice returns existing', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 25000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const first = await service.writeOffDebt(debt.id)
      const second = await service.writeOffDebt(debt.id)

      expect(second.status).toBe('written_off')
    })
  })

  // ── updateDebt ─────────────────────────────────────────────────────────────

  describe('updateDebt()', () => {
    it('updates dueDate and notes', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 30000 as any,
        notes: 'original',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const updated = await service.updateDebt(debt.id, {
        dueDate: '2026-06-30',
        notes: 'updated note',
      })

      expect(updated.dueDate).toBe('2026-06-30')
      expect(updated.notes).toBe('updated note')
      expect(updated.version).toBe(2)
    })

    it('throws when updating a paid debt', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 30000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })
      await service.settleDebt(debt.id)

      await expect(service.updateDebt(debt.id, { notes: 'x' })).rejects.toThrow('Cannot update a paid debt')
    })
  })

  // ── listDebts ───────────────────────────────────────────────────────────────

  describe('listDebts()', () => {
    it('returns only debts for the service businessId', async () => {
      const customerId = asCustomerId(newId())

      const debt1 = await service.createDebt({
        businessId: BIZ, customerId,
        amount: 10000 as any, idempotencyKey: asIdempotencyKey(newId()),
      })
      // Create debt via foreign service (different businessId, same store)
      const foreignSvc = new DebtService(store, syncEngine, BIZ2, DEVICE, EMPLOYEE)
      await foreignSvc.createDebt({
        businessId: BIZ2, customerId,
        amount: 99999 as any, idempotencyKey: asIdempotencyKey(newId()),
      })

      const listed = await service.listDebts({})
      expect(listed.map(d => d.id)).toContain(debt1.id)
      expect(listed.every(d => d.businessId === BIZ)).toBe(true)
    })

    it('filters by status', async () => {
      const customerId = asCustomerId(newId())
      const debt = await service.createDebt({
        businessId: BIZ, customerId,
        amount: 50000 as any, idempotencyKey: asIdempotencyKey(newId()),
      })
      await service.recordPayment({
        debtId: debt.id,
        amount: 25000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const partial = await service.listDebts({ status: 'partial' })
      expect(partial).toHaveLength(1)
      expect(partial[0].status).toBe('partial')
    })
  })

  // ── getCustomerDebts ───────────────────────────────────────────────────────

  describe('getCustomerDebts()', () => {
    it('returns all debts for a customer', async () => {
      const customerId = asCustomerId(newId())

      const debt1 = await service.createDebt({
        businessId: BIZ, customerId,
        amount: 50000 as any, idempotencyKey: asIdempotencyKey(newId()),
      })
      const debt2 = await service.createDebt({
        businessId: BIZ, customerId,
        amount: 20000 as any, idempotencyKey: asIdempotencyKey(newId()),
      })

      const debts = await service.getCustomerDebts(customerId)
      const ids = debts.map(d => d.id)
      expect(ids).toContain(debt1.id)
      expect(ids).toContain(debt2.id)
    })
  })

  // ── getDebtSummary ─────────────────────────────────────────────────────────

  describe('getDebtSummary()', () => {
    it('returns correct totalOutstanding, overdueCount, partialCount', async () => {
      const c1 = asCustomerId(newId())
      const c2 = asCustomerId(newId())

      // Paid debt — excluded from outstanding
      const paidDebt = await service.createDebt({
        businessId: BIZ, customerId: c1,
        amount: 50000 as any, idempotencyKey: asIdempotencyKey(newId()),
      })
      await service.settleDebt(paidDebt.id)

      // Partial debt: 30k - 15k = 15k outstanding
      const partialDebt = await service.createDebt({
        businessId: BIZ, customerId: c1,
        amount: 30000 as any, idempotencyKey: asIdempotencyKey(newId()),
      })
      await service.recordPayment({
        debtId: partialDebt.id,
        amount: 15000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      // Overdue debt: past due date
      const overdueDebt = await service.createDebt({
        businessId: BIZ, customerId: c2,
        amount: 20000 as any,
        dueDate: '2020-01-01',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const summary = await service.getDebtSummary()

      expect(summary.totalOutstanding).toBe(35000) // 15000 partial + 20000 overdue
      expect(summary.partialCount).toBe(1)
      expect(summary.overdueCount).toBe(1)
    })
  })

  // ── BUSINESS ISOLATION ─────────────────────────────────────────────────────

  describe('BUSINESS ISOLATION', () => {
    it('getDebt hides debts from other businesses', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 10000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const foreignSvc = new DebtService(store, syncEngine, BIZ2, DEVICE, EMPLOYEE)
      const result = await foreignSvc.getDebt(debt.id)
      expect(result).toBeNull()
    })

    it('recordPayment blocks cross-business', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 10000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const foreignSvc = new DebtService(store, syncEngine, BIZ2, DEVICE, EMPLOYEE)
      await expect(foreignSvc.recordPayment({
        debtId: debt.id,
        amount: 5000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: asIdempotencyKey(newId()),
      })).rejects.toThrow('Business isolation violation')
    })

    it('settleDebt blocks cross-business', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 10000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const foreignSvc = new DebtService(store, syncEngine, BIZ2, DEVICE, EMPLOYEE)
      await expect(foreignSvc.settleDebt(debt.id)).rejects.toThrow('Business isolation violation')
    })
  })

  // ── Balance derivation invariant ───────────────────────────────────────────

  describe('balance derivation', () => {
    it('balance = amount - sum(payments) after multiple payments', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 100000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      await service.recordPayment({
        debtId: debt.id,
        amount: 30000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: asIdempotencyKey(newId()),
      })
      await service.recordPayment({
        debtId: debt.id,
        amount: 25000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'mobile_money',
        idempotencyKey: asIdempotencyKey(newId()),
      })

      const final = await service.getDebt(debt.id)
      expect(final!.balance).toBe(45000) // 100000 - 30000 - 25000
      expect(final!.status).toBe('partial')
    })

    it('balance is never overwritten except through recordPayment', async () => {
      const debt = await service.createDebt({
        businessId: BIZ,
        customerId: asCustomerId(newId()),
        amount: 50000 as any,
        idempotencyKey: asIdempotencyKey(newId()),
      })

      // Manually updating the debt should not affect balance
      await service.updateDebt(debt.id, { notes: 'updated manually' })
      const afterUpdate = await service.getDebt(debt.id)
      expect(afterUpdate!.balance).toBe(50000) // unchanged

      // Only recordPayment changes the balance
      await service.recordPayment({
        debtId: debt.id,
        amount: 10000 as any,
        employeeId: EMPLOYEE,
        paymentMethod: 'cash',
        idempotencyKey: asIdempotencyKey(newId()),
      })
      const afterPayment = await service.getDebt(debt.id)
      expect(afterPayment!.balance).toBe(40000)
    })
  })
})
