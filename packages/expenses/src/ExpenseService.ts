/**
 * ExpenseService — expense operations + sync event emission.
 *
 * Sync events emitted:
 *   - expense.created  — on createExpense()
 *   - expense.approved — on approveExpense()
 *   - expense.paid     — on markExpensePaid()
 *
 * Critical invariants:
 *   1. Idempotency: same idempotencyKey on replay must NOT create a duplicate.
 *      Check repository BEFORE writing.
 *   2. Business isolation enforced at service layer (this.businessId).
 *   3. Status transitions: pending → approved → paid (one-way per operation).
 *   4. paidAt is set exactly once — when status becomes 'paid'.
 */

import type { Expense, SyncEvent } from '@soostori/contracts'
import type { SyncEngine } from '@soostori/contracts'
import type {
  BusinessId, ExpenseId, RecurringExpenseId,
  EmployeeId, DeviceId, IdempotencyKey, Money,
} from '@soostori/core'
import {
  asExpenseId, asRecurringExpenseId, asIdempotencyKey,
  asSyncEventId, newId,
} from '@soostori/core'
import type {
  ExpenseRepository,
  RecurringExpense,
  RecurringExpenseFrequency,
} from './ExpenseRepository.js'
import type { ExpenseStatus } from '@soostori/contracts'

// ── Input types ─────────────────────────────────────────────────────────────

export interface CreateExpenseInput {
  businessId: BusinessId
  category: string
  amount: Money
  date: string            // YYYY-MM-DD
  vendor?: string | null
  description?: string | null
  /**
   * Idempotency key — UUID per create request.
   * Prevents duplicate submission on offline replay.
   * Caller generates this and passes it in.
   */
  idempotencyKey: IdempotencyKey
}

export interface CreateRecurringExpenseInput {
  businessId: BusinessId
  category: string
  amount: Money
  frequency: RecurringExpenseFrequency
  nextDueDate: string    // YYYY-MM-DD
  idempotencyKey: IdempotencyKey
}

// ── Service ─────────────────────────────────────────────────────────────────

export class ExpenseService {
  constructor(
    private readonly store: ExpenseRepository,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: DeviceId,
    private readonly employeeId: EmployeeId,
  ) {}

  // ── create ─────────────────────────────────────────────────────────────────

  /**
   * Create a new expense.
   *
   * Idempotent: if an expense with the same idempotencyKey already exists,
   * returns that expense without creating a duplicate.
   *
   * Status starts at 'pending'. Version starts at 1.
   */
  async createExpense(input: CreateExpenseInput): Promise<Expense> {
    if (input.businessId !== this.businessId) throw new Error('Business isolation violation')

    // Anti-duplication gate — MUST check before any write.
    const existing = await this.store.getExpenseByIdempotencyKey(input.idempotencyKey)
    if (existing) return existing

    const now = new Date().toISOString()
    const id = asExpenseId(newId())

    const expense: Expense = {
      id,
      businessId: this.businessId,
      categoryName: input.category,
      amount: input.amount,
      employeeId: this.employeeId,
      note: input.description ?? null,
      date: input.date,
      reference: input.vendor ?? null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      version: 1,
    }

    await this.store.upsertExpense(expense)
    await this.emit('expense.created', expense, 'create', input.idempotencyKey)

    return expense
  }

  // ── approve ────────────────────────────────────────────────────────────────

  /**
   * Approve a pending expense.
   *
   * Transitions status: pending → approved.
   * Only pending expenses can be approved.
   */
  async approveExpense(id: ExpenseId): Promise<Expense> {
    const existing = await this.store.getExpense(id)
    if (!existing) throw new Error(`Expense ${id} not found`)
    if (existing.businessId !== this.businessId) throw new Error('Business isolation violation')
    if (existing.status !== 'pending') {
      throw new Error(`Cannot approve expense with status '${existing.status}'`)
    }

    const now = new Date().toISOString()
    const approved: Expense = {
      ...existing,
      status: 'approved',
      updatedAt: now,
      version: existing.version + 1,
    }

    await this.store.upsertExpense(approved)
    await this.emit(
      'expense.approved',
      approved,
      'update',
      asIdempotencyKey(`${id}:approved`),
    )

    return approved
  }

  // ── mark paid ─────────────────────────────────────────────────────────────

  /**
   * Mark an approved expense as paid.
   *
   * Transitions status: approved → paid.
   * Sets paidAt to the current timestamp.
   * Only approved expenses can be marked paid.
   */
  async markExpensePaid(id: ExpenseId): Promise<Expense> {
    const existing = await this.store.getExpense(id)
    if (!existing) throw new Error(`Expense ${id} not found`)
    if (existing.businessId !== this.businessId) throw new Error('Business isolation violation')
    if (existing.status !== 'approved') {
      throw new Error(`Cannot mark expense with status '${existing.status}' as paid`)
    }

    const now = new Date().toISOString()
    const paid: Expense = {
      ...existing,
      status: 'paid',
      paidAt: now,
      updatedAt: now,
      version: existing.version + 1,
    }

    await this.store.upsertExpense(paid)
    await this.emit('expense.paid', paid, 'update', asIdempotencyKey(`${id}:paid`))

    return paid
  }

  // ── list ──────────────────────────────────────────────────────────────────

  /**
   * List expenses for this business.
   * Optionally filter by month (YYYY-MM prefix match on date field).
   */
  async listExpenses(businessId: BusinessId, month?: string): Promise<Expense[]> {
    if (businessId !== this.businessId) throw new Error('Business isolation violation')
    return this.store.listExpenses({ businessId: this.businessId, month })
  }

  // ── summary ───────────────────────────────────────────────────────────────

  /**
   * Get a summary of expenses for a given month.
   * Returns total, breakdown by category, and count of pending items.
   */
  async getExpenseSummary(businessId: BusinessId, month: string): Promise<{
    total: Money
    byCategory: Record<string, Money>
    pendingCount: number
  }> {
    if (businessId !== this.businessId) throw new Error('Business isolation violation')

    const expenses = await this.store.listExpenses({ businessId: this.businessId, month })

    let total = 0 as Money
    const byCategory: Record<string, Money> = {}
    let pendingCount = 0

    for (const expense of expenses) {
      total += expense.amount
      byCategory[expense.categoryName] = (byCategory[expense.categoryName] ?? 0 + expense.amount) as Money
      if (expense.status === 'pending') pendingCount++
    }

    return { total, byCategory, pendingCount }
  }

  // ── recurring ─────────────────────────────────────────────────────────────

  /**
   * Create a new recurring expense template.
   *
   * Idempotent: if a recurring expense with the same idempotencyKey exists,
   * returns that entry without creating a duplicate.
   */
  async createRecurringExpense(input: CreateRecurringExpenseInput): Promise<RecurringExpense> {
    if (input.businessId !== this.businessId) throw new Error('Business isolation violation')

    const existing = await this.store.getExpenseByIdempotencyKey(input.idempotencyKey)
    if (existing) {
      // Cast is safe because the repository returns Expense for idempotency keys,
      // but we use a separate store namespace for recurring in a real impl.
      // Here we treat it as returning the same type — adjust in production.
      return existing as unknown as RecurringExpense
    }

    const now = new Date().toISOString()
    const id = asRecurringExpenseId(newId())

    const recurring: RecurringExpense = {
      id,
      businessId: this.businessId,
      categoryName: input.category,
      amount: input.amount,
      frequency: input.frequency,
      nextDueDate: input.nextDueDate,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }

    await this.store.upsertRecurringExpense(recurring)

    // Emit sync event for the recurring expense
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: input.idempotencyKey,
      businessId: this.businessId,
      entityKind: 'expense',
      entityId: id,
      operation: 'create',
      originatingDeviceId: this.deviceId,
      originatingEmployeeId: this.employeeId,
      clientSequence: Date.now(),
      clientCreatedAt: now,
      entityVersion: 1,
      payload: recurring as unknown as Record<string, unknown>,
      state: 'pending',
    }
    await this.syncEngine.enqueue(event)

    return recurring
  }

  /**
   * List recurring expenses for this business.
   */
  async listRecurringExpenses(businessId: BusinessId): Promise<RecurringExpense[]> {
    if (businessId !== this.businessId) throw new Error('Business isolation violation')
    return this.store.listRecurringExpenses({ businessId: this.businessId })
  }

  // ── emit ────────────────────────────────────────────────────────────────────

  private async emit(
    eventType: 'expense.created' | 'expense.approved' | 'expense.paid',
    entity: Expense,
    syncOp: SyncEvent['operation'],
    idempotencyKey: IdempotencyKey,
  ): Promise<void> {
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey,
      businessId: this.businessId,
      entityKind: 'expense',
      entityId: entity.id,
      operation: syncOp,
      originatingDeviceId: this.deviceId,
      originatingEmployeeId: this.employeeId,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: entity.version,
      payload: entity as unknown as Record<string, unknown>,
      state: 'pending',
    }
    await this.syncEngine.enqueue(event)
  }
}
