/**
 * Debts repository — implements debt management over Desktop debts + debt_payments tables.
 * Desktop: debts(id, customer_id, sale_id, amount, amount_paid, status, due_date, notes, created_at, updated_at)
 *          debt_payments(id, debt_id, amount, payment_method, reference, notes, created_at)
 */

import { getDatabase } from './sqlite-database.js'
import type { DebtId, DebtPaymentId, CustomerId, SaleId, ISO8601 } from '@soostori/core'
import { newId, asDebtId } from '@soostori/core'

export type DebtStatus = 'pending' | 'partial' | 'paid'
export interface Debt { id: DebtId; customerId: CustomerId | null; saleId: SaleId | null; amount: number; amountPaid: number; status: DebtStatus; dueDate: string | null; notes: string | null; createdAt: ISO8601; updatedAt: ISO8601 }
export interface DebtPayment { id: DebtPaymentId; debtId: DebtId; amount: number; paymentMethod: string; reference: string | null; notes: string | null; createdAt: ISO8601 }

type DebtRow = { id: string; customer_id: string | null; sale_id: string | null; amount: number; amount_paid: number; status: string; due_date: string | null; notes: string | null; created_at: string; updated_at: string }
type PaymentRow = { id: string; debt_id: string; amount: number; payment_method: string; reference: string | null; notes: string | null; created_at: string }

const toDebt = (r: DebtRow): Debt => ({ id: r.id as DebtId, customerId: r.customer_id as CustomerId | null, saleId: r.sale_id as SaleId | null, amount: r.amount, amountPaid: r.amount_paid, status: r.status as DebtStatus, dueDate: r.due_date, notes: r.notes, createdAt: r.created_at as ISO8601, updatedAt: r.updated_at as ISO8601 })
const toPayment = (r: PaymentRow): DebtPayment => ({ id: r.id as DebtPaymentId, debtId: r.debt_id as DebtId, amount: r.amount, paymentMethod: r.payment_method, reference: r.reference, notes: r.notes, createdAt: r.created_at as ISO8601 })

export class DebtsRepository {
  async findById(id: DebtId): Promise<Debt | null> {
    const row = getDatabase().prepare('SELECT * FROM debts WHERE id = ?').get(id as string) as DebtRow | undefined
    return row ? toDebt(row) : null
  }

  async findMany(filter: { customerId?: string; status?: DebtStatus } = {}): Promise<Debt[]> {
    const db = getDatabase()
    const conditions: string[] = []
    const values: unknown[] = []
    if (filter.customerId) { conditions.push('customer_id = ?'); values.push(filter.customerId) }
    if (filter.status) { conditions.push('status = ?'); values.push(filter.status) }
    const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : ''
    const rows = (values.length ? db.prepare('SELECT * FROM debts' + where + ' ORDER BY created_at DESC').all(...values) : db.prepare('SELECT * FROM debts' + where + ' ORDER BY created_at DESC').all()) as DebtRow[]
    return rows.map(toDebt)
  }

  async createDebt(data: { customerId?: string; saleId?: string; amount: number; dueDate?: string; notes?: string }): Promise<Debt> {
    const db = getDatabase()
    const now = new Date().toISOString()
    const id = newId()
    db.prepare(`INSERT INTO debts (id, customer_id, sale_id, amount, amount_paid, status, due_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'pending', ?, ?, ?, ?)`).run(id, data.customerId ?? null, data.saleId ?? null, data.amount, data.dueDate ?? null, data.notes ?? null, now, now)
    return (await this.findById(asDebtId(id)))!
  }

  async recordPayment(debtId: DebtId, amount: number, paymentMethod: string, reference?: string, notes?: string): Promise<{ debt: Debt; payment: DebtPayment }> {
    const db = getDatabase()
    const now = new Date().toISOString()
    const debt = await this.findById(debtId)
    if (!debt) throw new Error('Debt not found')
    const newPaid = debt.amountPaid + amount
    const newStatus: DebtStatus = newPaid >= debt.amount ? 'paid' : 'partial'
    db.prepare('UPDATE debts SET amount_paid = ?, status = ?, updated_at = ? WHERE id = ?').run(newPaid, newStatus, now, debtId as string)
    const paymentId = asDebtId(newId())
    db.prepare('INSERT INTO debt_payments (id, debt_id, amount, payment_method, reference, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(paymentId, debtId as string, amount, paymentMethod, reference ?? null, notes ?? null, now)
    const updatedDebt = await this.findById(debtId)
    const paymentRow = db.prepare('SELECT * FROM debt_payments WHERE id = ?').get(paymentId) as PaymentRow
    return { debt: updatedDebt!, payment: toPayment(paymentRow) }
  }

  async findPayments(debtId: DebtId): Promise<DebtPayment[]> {
    return (getDatabase().prepare('SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY created_at DESC').all(debtId as string) as PaymentRow[]).map(toPayment)
  }
}
