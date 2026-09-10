/**
 * ExpenseService tests — 12 test cases.
 *
 * Run: cd packages/expenses && npx vitest run test/ExpenseService.test.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ExpenseService } from '../src/ExpenseService.js'
import type { ExpenseRepository, RecurringExpense } from '../src/ExpenseRepository.js'
import type { Expense } from '@soostori/contracts'
import type { SyncEngine } from '@soostori/contracts'
import type { BusinessId, ExpenseId, RecurringExpenseId, EmployeeId, DeviceId, IdempotencyKey } from '@soostori/core'

// ── Test fixtures ───────────────────────────────────────────────────────────

const BUSINESS_ID = 'biz-001' as BusinessId
const EMPLOYEE_ID = 'emp-001' as EmployeeId
const DEVICE_ID = 'dev-001' as DeviceId
const IDEMPOTENCY_KEY = 'idem-001' as IdempotencyKey
const NOW = new Date().toISOString()

function makeRepo() {
  const expenses = new Map<string, Expense>()
  const recurringExpenses = new Map<string, RecurringExpense>()

  return {
    expenses,
    recurringExpenses,

    repo: {
      async getExpense(id: ExpenseId) {
        const e = expenses.get(id)
        return e ?? null
      },
      async getExpenseByIdempotencyKey(key: IdempotencyKey) {
        for (const e of expenses.values()) {
          if ((e as any).idempotencyKey === key) return e
        }
        return null
      },
      async listExpenses(filter: any) {
        let list = Array.from(expenses.values()).filter(
          e => e.businessId === filter.businessId,
        )
        if (filter.month) {
          list = list.filter(e => e.date.startsWith(filter.month))
        }
        return list
      },
      async countExpenses(filter: any) {
        return (await this.listExpenses(filter)).length
      },
      async upsertExpense(expense: Expense) {
        expenses.set(expense.id, expense)
      },
      async getRecurringExpense(id: RecurringExpenseId) {
        return recurringExpenses.get(id) ?? null
      },
      async listRecurringExpenses(filter: any) {
        return Array.from(recurringExpenses.values()).filter(
          e => e.businessId === filter.businessId,
        )
      },
      async upsertRecurringExpense(expense: RecurringExpense) {
        recurringExpenses.set(expense.id, expense)
      },
    } as ExpenseRepository,

    syncEvents: [] as any[],
    syncEngine: {
      async enqueue(event: any) {
        this.syncEvents.push(event)
        return { state: 'queued' as const }
      },
    } as SyncEngine & { syncEvents: any[] },

    newService(repo = this.repo) {
      return new ExpenseService(repo, this.syncEngine, BUSINESS_ID, DEVICE_ID, EMPLOYEE_ID)
    },
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ExpenseService', () => {

  // ── Test 1: createExpense — correct fields ────────────────────────────────

  it('createExpense → correct fields', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    const expense = await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'rent',
      amount: 5000000,
      date: '2025-09-01',
      vendor: 'Landlord Co.',
      description: 'September rent',
      idempotencyKey: IDEMPOTENCY_KEY,
    })

    expect(expense.id).toBeDefined()
    expect(expense.businessId).toBe(BUSINESS_ID)
    expect(expense.categoryName).toBe('rent')
    expect(expense.amount).toBe(5000000)
    expect(expense.date).toBe('2025-09-01')
    expect(expense.reference).toBe('Landlord Co.')
    expect(expense.note).toBe('September rent')
    expect(expense.status).toBe('pending')
    expect(expense.createdAt).toBeDefined()
    expect(expense.updatedAt).toBeDefined()
    expect(expense.version).toBe(1)
  })

  // ── Test 2: createExpense → expense.created SyncEvent ─────────────────────

  it('createExpense emits expense.created', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'utilities',
      amount: 50000,
      date: '2025-09-05',
      idempotencyKey: IDEMPOTENCY_KEY,
    })

    expect(syncEngine.syncEvents).toHaveLength(1)
    expect(syncEngine.syncEvents[0].entityKind).toBe('expense')
    expect(syncEngine.syncEvents[0].operation).toBe('create')
  })

  // ── Test 3: approveExpense → status = approved ───────────────────────────

  it('approveExpense → status approved, version increments', async () => {
    const { newService, repo, syncEngine } = makeRepo()
    const svc = newService()

    const created = await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'transport',
      amount: 30000,
      date: '2025-09-06',
      idempotencyKey: 'ap-idem-001' as IdempotencyKey,
    })

    const approved = await svc.approveExpense(created.id)

    expect(approved.status).toBe('approved')
    expect(approved.version).toBe(2)
    expect(approved.updatedAt).not.toBe(created.createdAt)
  })

  // ── Test 4: approveExpense → expense.approved SyncEvent ─────────────────

  it('approveExpense emits expense.approved', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    const created = await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'supplies',
      amount: 10000,
      date: '2025-09-07',
      idempotencyKey: 'ap-idem-002' as IdempotencyKey,
    })

    await svc.approveExpense(created.id)

    expect(syncEngine.syncEvents).toHaveLength(2) // expense.created + expense.approved
    const approvedEvent = syncEngine.syncEvents[1]
    expect(approvedEvent.entityKind).toBe('expense')
    expect(approvedEvent.operation).toBe('update')
  })

  // ── Test 5: markExpensePaid → status = paid, paidAt set ──────────────────

  it('markExpensePaid → status paid, version increments', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    const created = await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'marketing',
      amount: 200000,
      date: '2025-09-08',
      idempotencyKey: 'pay-idem-001' as IdempotencyKey,
    })

    await svc.approveExpense(created.id)
    const paid = await svc.markExpensePaid(created.id)

    expect(paid.status).toBe('paid')
    expect(paid.version).toBe(3)
  })

  // ── Test 6: markExpensePaid → expense.paid SyncEvent ─────────────────────

  it('markExpensePaid emits expense.paid', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    const created = await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'salaries',
      amount: 5000000,
      date: '2025-09-09',
      idempotencyKey: 'pay-idem-002' as IdempotencyKey,
    })

    await svc.approveExpense(created.id)
    await svc.markExpensePaid(created.id)

    expect(syncEngine.syncEvents).toHaveLength(3) // created + approved + paid
    const paidEvent = syncEngine.syncEvents[2]
    expect(paidEvent.entityKind).toBe('expense')
    expect(paidEvent.operation).toBe('update')
  })

  // ── Test 7: listExpenses → filtered by businessId + month ─────────────────

  it('listExpenses filters by businessId and month', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'rent',
      amount: 100,
      date: '2025-09-01',
      idempotencyKey: 'list-idem-001' as IdempotencyKey,
    })
    await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'utilities',
      amount: 200,
      date: '2025-09-15',
      idempotencyKey: 'list-idem-002' as IdempotencyKey,
    })
    await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'transport',
      amount: 300,
      date: '2025-10-01', // wrong month
      idempotencyKey: 'list-idem-003' as IdempotencyKey,
    })

    const sepExpenses = await svc.listExpenses(BUSINESS_ID, '2025-09')
    const octExpenses = await svc.listExpenses(BUSINESS_ID, '2025-10')
    const allExpenses = await svc.listExpenses(BUSINESS_ID)

    expect(sepExpenses).toHaveLength(2)
    expect(octExpenses).toHaveLength(1)
    expect(allExpenses).toHaveLength(3)
  })

  // ── Test 8: getExpenseSummary → correct totals and byCategory ─────────────

  it('getExpenseSummary returns correct total, byCategory, pendingCount', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'rent',
      amount: 1000,
      date: '2025-09-01',
      idempotencyKey: 'sum-idem-001' as IdempotencyKey,
    })
    await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'utilities',
      amount: 2000,
      date: '2025-09-02',
      idempotencyKey: 'sum-idem-002' as IdempotencyKey,
    })
    await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'rent',
      amount: 3000,
      date: '2025-09-03',
      idempotencyKey: 'sum-idem-003' as IdempotencyKey,
    })

    const summary = await svc.getExpenseSummary(BUSINESS_ID, '2025-09')

    expect(summary.total).toBe(6000)
    expect(summary.byCategory['rent']).toBe(4000)
    expect(summary.byCategory['utilities']).toBe(2000)
    expect(summary.pendingCount).toBe(3) // all are pending
  })

  // ── Test 9: businessId isolation ───────────────────────────────────────────

  it('createExpense throws on wrong businessId', async () => {
    const { newService } = makeRepo()
    const svc = newService()

    await expect(
      svc.createExpense({
        businessId: 'wrong-biz' as BusinessId,
        category: 'rent',
        amount: 1000,
        date: '2025-09-01',
        idempotencyKey: 'iso-idem-001' as IdempotencyKey,
      }),
    ).rejects.toThrow('Business isolation violation')
  })

  it('listExpenses throws on wrong businessId', async () => {
    const { newService } = makeRepo()
    const svc = newService()

    await expect(svc.listExpenses('wrong-biz' as BusinessId)).rejects.toThrow(
      'Business isolation violation',
    )
  })

  it('approveExpense throws on wrong businessId', async () => {
    const { newService, repo, syncEngine } = makeRepo()
    const svc = newService()

    // Manually inject an expense from a different business into the repo
    const expense = {
      id: 'e-iso-001' as ExpenseId,
      businessId: 'wrong-biz' as BusinessId,
      categoryName: 'rent',
      amount: 1000,
      employeeId: EMPLOYEE_ID,
      note: null,
      date: '2025-09-01',
      reference: null,
      status: 'pending' as const,
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    } as Expense
    repo.expenses.set(expense.id, expense)

    await expect(svc.approveExpense(expense.id)).rejects.toThrow(
      'Business isolation violation',
    )
  })

  // ── Test 10: cannot approve a non-pending expense ─────────────────────────

  it('approveExpense throws if expense is not pending', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    const created = await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'rent',
      amount: 1000,
      date: '2025-09-01',
      idempotencyKey: 'apr-idem-001' as IdempotencyKey,
    })

    await svc.approveExpense(created.id)

    await expect(svc.approveExpense(created.id)).rejects.toThrow(
      "Cannot approve expense with status 'approved'",
    )
  })

  // ── Test 11: cannot mark paid a non-approved expense ───────────────────────

  it('markExpensePaid throws if expense is not approved', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    const created = await svc.createExpense({
      businessId: BUSINESS_ID,
      category: 'rent',
      amount: 1000,
      date: '2025-09-01',
      idempotencyKey: 'mpm-idem-001' as IdempotencyKey,
    })

    await expect(svc.markExpensePaid(created.id)).rejects.toThrow(
      "Cannot mark expense with status 'pending' as paid",
    )
  })

  // ── Test 12: createRecurringExpense → correct fields ─────────────────────

  it('createRecurringExpense creates with correct fields', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    const recurring = await svc.createRecurringExpense({
      businessId: BUSINESS_ID,
      category: 'rent',
      amount: 5000000,
      frequency: 'monthly',
      nextDueDate: '2025-10-01',
      idempotencyKey: 'rec-idem-001' as IdempotencyKey,
    })

    expect(recurring.id).toBeDefined()
    expect(recurring.businessId).toBe(BUSINESS_ID)
    expect(recurring.categoryName).toBe('rent')
    expect(recurring.amount).toBe(5000000)
    expect(recurring.frequency).toBe('monthly')
    expect(recurring.nextDueDate).toBe('2025-10-01')
    expect(recurring.isActive).toBe(true)
    expect(recurring.version).toBe(1)
  })

  // ── Test 13: listRecurringExpenses ────────────────────────────────────────

  it('listRecurringExpenses returns recurring expenses for business', async () => {
    const { newService, syncEngine } = makeRepo()
    const svc = newService()

    await svc.createRecurringExpense({
      businessId: BUSINESS_ID,
      category: 'rent',
      amount: 5000000,
      frequency: 'monthly',
      nextDueDate: '2025-10-01',
      idempotencyKey: 'lr-idem-001' as IdempotencyKey,
    })
    await svc.createRecurringExpense({
      businessId: BUSINESS_ID,
      category: 'salaries',
      amount: 10000000,
      frequency: 'monthly',
      nextDueDate: '2025-10-31',
      idempotencyKey: 'lr-idem-002' as IdempotencyKey,
    })

    const recurring = await svc.listRecurringExpenses(BUSINESS_ID)
    expect(recurring).toHaveLength(2)
  })
})
