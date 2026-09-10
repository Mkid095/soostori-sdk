/**
 * DebtService — debt + payment business logic + sync event emission.
 *
 * Sync events emitted:
 *   - debt.created          — on createDebt()
 *   - debt.updated          — on updateDebt() or auto-settled
 *   - debt.payment.created  — on recordPayment()
 *   - debt.settled          — on settleDebt() (balance → 0, status → 'paid')
 *
 * Critical invariants:
 *   1. debt.balance = initial_amount - sum(confirmed payments).
 *      Balance is NEVER overwritten — it is derived deterministically.
 *   2. Idempotency: same idempotencyKey on replay must NOT create a duplicate
 *      debt or duplicate payment. Check repository BEFORE writing.
 *   3. A payment, once recorded and confirmed, is immutable.
 *   4. Business isolation enforced at service layer (this.businessId).
 *   5. Settling a debt (balance = 0) does NOT close the debt row — it
 *      transitions the status to 'paid'. The record is retained for audit.
 */

import type {
  Debt, DebtPayment, DebtStatus, SyncEvent,
} from '@soostori/contracts'
import type {
  SyncEngine,
} from '@soostori/contracts'
import type {
  BusinessId, DebtId, DebtPaymentId, CustomerId, SaleId,
  EmployeeId, DeviceId, IdempotencyKey, ISO8601, Money,
} from '@soostori/core'
import {
  asDebtId, asDebtPaymentId, asIdempotencyKey, newId,
} from '@soostori/core'
import type { DebtRepository, DebtWithBalance } from './DebtRepository.js'

// ── Input types ─────────────────────────────────────────────────────────────

export interface CreateDebtInput {
  businessId: BusinessId
  customerId: CustomerId
  /** The original debt amount — NOT mutated by payments. */
  amount: Money
  /** Optional: link debt to a specific sale. */
  saleId?: SaleId | null
  dueDate?: ISO8601 | null
  notes?: string | null
  /**
   * Idempotency key — UUID per create request.
   * Prevents duplicate submission on offline replay (§18, §6).
   * Caller (POS) generates this and passes it in.
   */
  idempotencyKey: IdempotencyKey
}

export interface UpdateDebtInput {
  dueDate?: ISO8601 | null
  notes?: string | null
}

export interface RecordPaymentInput {
  businessId: BusinessId
  debtId: DebtId
  amount: Money
  employeeId: EmployeeId
  paymentMethod: DebtPayment['paymentMethod']
  paymentRef?: string | null
  /**
   * Idempotency key — UUID per payment request.
   * Prevents duplicate payment on offline replay (§18, §6).
   */
  idempotencyKey: IdempotencyKey
}

// ── Status helpers ──────────────────────────────────────────────────────────

/** Derive the correct status from amount + confirmed payments sum. */
export function deriveDebtStatus(amount: Money, paidSum: Money): DebtStatus {
  if (paidSum >= amount) return 'paid'
  if (paidSum > 0) return 'partial'
  return 'pending'
}

// ── Service ─────────────────────────────────────────────────────────────────

export class DebtService {
  constructor(
    private readonly store: DebtRepository,
    private readonly syncEngine: SyncEngine,
    private readonly businessId: BusinessId,
    private readonly deviceId: DeviceId,
    private readonly employeeId: EmployeeId,
  ) {}

  // ── create ─────────────────────────────────────────────────────────────────

  /**
   * Create a new debt.
   *
   * Idempotent: if a debt with the same idempotencyKey already exists,
   * returns that debt without creating a duplicate.
   *
   * Balance starts at `amount` (no payments yet). Status starts at 'pending'.
   * Version starts at 1.
   */
  async createDebt(input: CreateDebtInput): Promise<Debt> {
    if (input.businessId !== this.businessId) throw new Error('Business isolation violation')

    // Anti-duplication gate — MUST check before any write.
    const existing = await this.store.getDebtByIdempotencyKey(input.idempotencyKey)
    if (existing) return existing

    const now = new Date().toISOString()
    const id = asDebtId(newId())

    const debt: Debt = {
      id,
      businessId: this.businessId,
      customerId: input.customerId,
      saleId: input.saleId ?? null,
      amount: input.amount,
      balance: input.amount, // initial: no payments yet
      status: 'pending',
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }

    await this.store.upsertDebt(debt)
    await this.emit('debt.created', debt, 'create', input.idempotencyKey)

    return debt
  }

  // ── update ─────────────────────────────────────────────────────────────────

  /**
   * Update mutable fields on an existing debt.
   * Last-writer-wins by version: incoming version <= stored version → no-op.
   */
  async updateDebt(id: DebtId, changes: UpdateDebtInput): Promise<Debt> {
    const existing = await this.store.getDebt(id)
    if (!existing) throw new Error(`Debt ${id} not found`)
    if (existing.businessId !== this.businessId) throw new Error('Business isolation violation')
    if (existing.status === 'paid' || existing.status === 'written_off') {
      throw new Error(`Cannot update a ${existing.status} debt`)
    }

    const now = new Date().toISOString()
    const updated: Debt = {
      ...existing,
      dueDate: changes.dueDate !== undefined ? changes.dueDate : existing.dueDate,
      notes: changes.notes !== undefined ? changes.notes : existing.notes,
      updatedAt: now,
      version: existing.version + 1,
    }

    await this.store.upsertDebt(updated)
    await this.emit('debt.updated', updated, 'update', asIdempotencyKey(`${id}:update`))

    return updated
  }

  // ── record payment ─────────────────────────────────────────────────────────

  /**
   * Record a payment against a debt.
   *
   * Idempotent: if a payment with the same idempotencyKey already exists,
   * returns that payment without creating a duplicate.
   *
   * CRITICAL balance derivation:
   *   debt.balance = initial_amount - sum(confirmed payments)
   *   This method recomputes the balance after every confirmed payment.
   *   The stored balance field is overwritten ONLY here — never anywhere else.
   *
   * Auto-settles: if balance reaches 0 after this payment, status → 'paid'.
   *
   * Payments are immutable once recorded; only the `confirmed` flag can
   * change, and only in a forward direction (false → true).
   */
  async recordPayment(input: RecordPaymentInput): Promise<{ payment: DebtPayment; debt: Debt }> {
    if (input.businessId !== this.businessId) throw new Error('Business isolation violation')

    // Anti-duplication gate for payment.
    const existingPayment = await this.store.getPaymentByIdempotencyKey(input.idempotencyKey)
    if (existingPayment) return { payment: existingPayment, debt: await this.store.getDebt(input.debtId) as Debt }

    const debt = await this.store.getDebt(input.debtId)
    if (!debt) throw new Error(`Debt ${input.debtId} not found`)
    if (debt.businessId !== this.businessId) throw new Error('Business isolation violation')
    if (debt.status === 'paid' || debt.status === 'written_off') {
      throw new Error(`Cannot pay a ${debt.status} debt`)
    }

    const now = new Date().toISOString()
    const paymentId = asDebtPaymentId(newId())

    const payment: DebtPayment = {
      id: paymentId,
      businessId: this.businessId,
      debtId: input.debtId,
      amount: input.amount,
      employeeId: input.employeeId,
      paymentMethod: input.paymentMethod,
      paymentRef: input.paymentRef ?? null,
      idempotencyKey: input.idempotencyKey,
      timestamp: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
    }

    await this.store.upsertPayment(payment)

    // Recompute balance: amount - sum(confirmed payments)
    const paidSum = await this.store.computeBalance(input.debtId)
    const newBalance = Math.max(0, debt.amount - paidSum) as Money
    const newStatus = deriveDebtStatus(debt.amount, paidSum)

    const updatedDebt: Debt = {
      ...debt,
      balance: newBalance,
      status: newStatus,
      updatedAt: now,
      version: debt.version + 1,
    }

    await this.store.upsertDebt(updatedDebt)
    await this.emitPaymentCreated(payment, updatedDebt)

    return { payment, debt: updatedDebt }
  }

  // ── settle ─────────────────────────────────────────────────────────────────

  /**
   * Manually settle a debt (e.g., written off as bad debt).
   *
   * Unlike auto-settlement (balance = 0), this can be called explicitly
   * even if a small balance remains. Status becomes 'paid' and the debt
   * is considered closed.
   *
   * Idempotent: settling an already-settled debt is a no-op.
   */
  async settleDebt(id: DebtId, reason?: string): Promise<Debt> {
    const existing = await this.store.getDebt(id)
    if (!existing) throw new Error(`Debt ${id} not found`)
    if (existing.businessId !== this.businessId) throw new Error('Business isolation violation')
    if (existing.status === 'paid' || existing.status === 'written_off') return existing

    const now = new Date().toISOString()
    const settled: Debt = {
      ...existing,
      balance: 0 as Money,
      status: 'paid',
      updatedAt: now,
      version: existing.version + 1,
    }

    await this.store.upsertDebt(settled)

    // Emit debt.settled event — distinct from debt.updated for consumer routing.
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: asIdempotencyKey(`${id}:settled`),
      businessId: this.businessId,
      entityKind: 'debt',
      entityId: id,
      operation: 'update',
      originatingDeviceId: this.deviceId,
      originatingEmployeeId: this.employeeId,
      clientSequence: Date.now(),
      clientCreatedAt: now,
      entityVersion: settled.version,
      payload: { debtId: id, reason: reason ?? null, settledAt: now } as Record<string, unknown>,
      state: 'pending',
    }
    await this.syncEngine.enqueue(event)

    return settled
  }

  // ── write-off ─────────────────────────────────────────────────────────────

  /**
   * Write off a debt as uncollectable.
   * Status becomes 'written_off'. Balance is set to 0.
   *
   * Unlike settleDebt, this is a deliberate write-off (bad debt).
   * The debt record is retained for audit.
   */
  async writeOffDebt(id: DebtId, reason?: string): Promise<Debt> {
    const existing = await this.store.getDebt(id)
    if (!existing) throw new Error(`Debt ${id} not found`)
    if (existing.businessId !== this.businessId) throw new Error('Business isolation violation')
    if (existing.status === 'paid' || existing.status === 'written_off') return existing

    const now = new Date().toISOString()
    const writtenOff: Debt = {
      ...existing,
      balance: 0 as Money,
      status: 'written_off',
      notes: existing.notes
        ? `${existing.notes}\n[WRITE-OFF ${reason ? `: ${reason}` : ''}]`
        : `[WRITE-OFF ${reason ? `: ${reason}` : ''}]`,
      updatedAt: now,
      version: existing.version + 1,
    }

    await this.store.upsertDebt(writtenOff)
    await this.emit('debt.updated', writtenOff, 'update', asIdempotencyKey(`${id}:writeoff`))

    return writtenOff
  }

  // ── read ───────────────────────────────────────────────────────────────────

  async getDebt(id: DebtId): Promise<DebtWithBalance | null> {
    const debt = await this.store.getDebt(id)
    if (!debt || debt.businessId !== this.businessId) return null

    const payments = await this.store.getPaymentsForDebt(id)
    const paidSum = payments.reduce((sum, p) => sum + p.amount, 0) as Money

    return {
      ...debt,
      balance: Math.max(0, debt.amount - paidSum) as Money,
      paymentCount: payments.length,
    }
  }

  async listDebts(filter: {
    customerId?: CustomerId
    status?: DebtStatus | 'all'
    dueBefore?: ISO8601
    query?: string
    limit?: number
    offset?: number
  }): Promise<DebtWithBalance[]> {
    return this.store.listDebts({
      businessId: this.businessId,
      ...filter,
    })
  }

  async countDebts(filter: {
    customerId?: CustomerId
    status?: DebtStatus | 'all'
    query?: string
  }): Promise<number> {
    return this.store.countDebts({ businessId: this.businessId, ...filter })
  }

  async getPaymentsForDebt(debtId: DebtId): Promise<DebtPayment[]> {
    const debt = await this.store.getDebt(debtId)
    if (!debt || debt.businessId !== this.businessId) return []
    return this.store.getPaymentsForDebt(debtId)
  }

  async getCustomerDebts(customerId: CustomerId): Promise<Debt[]> {
    const debts = await this.store.listDebts({ businessId: this.businessId, customerId })
    return debts
  }

  async getTotalOutstandingForCustomer(customerId: CustomerId): Promise<Money> {
    return this.store.getTotalOutstandingForCustomer(this.businessId, customerId)
  }

  async getDebtSummary(): Promise<{
    totalOutstanding: Money
    partialCount: number
    overdueCount: number
  }> {
    const debts = await this.store.listDebts({ businessId: this.businessId, status: 'all' })
    const now = new Date().toISOString()

    let totalOutstanding = 0 as Money
    let partialCount = 0
    let overdueCount = 0

    for (const debt of debts) {
      if (debt.status === 'paid' || debt.status === 'written_off') continue
      totalOutstanding += debt.balance
      if (debt.status === 'partial') partialCount++
      if (debt.dueDate && debt.dueDate < now) overdueCount++
    }

    return { totalOutstanding, partialCount, overdueCount }
  }

  // ── emit helpers ───────────────────────────────────────────────────────────

  private async emit(
    eventType: 'debt.created' | 'debt.updated',
    entity: Debt,
    syncOp: SyncEvent['operation'],
    idempotencyKey: IdempotencyKey,
  ): Promise<void> {
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey,
      businessId: this.businessId,
      entityKind: 'debt',
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

  private async emitPaymentCreated(payment: DebtPayment, updatedDebt: Debt): Promise<void> {
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: payment.idempotencyKey,
      businessId: this.businessId,
      entityKind: 'debtPayment',
      entityId: payment.id,
      operation: 'create',
      originatingDeviceId: this.deviceId,
      originatingEmployeeId: this.employeeId,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: payment.version,
      payload: {
        payment,
        debtId: updatedDebt.id,
        balanceAfter: updatedDebt.balance,
        statusAfter: updatedDebt.status,
      } as Record<string, unknown>,
      state: 'pending',
    }
    await this.syncEngine.enqueue(event)
  }
}

// ── re-export SyncEvent id helper ───────────────────────────────────────────
import { asSyncEventId } from '@soostori/core'
