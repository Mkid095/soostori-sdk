/**
 * TransactionHandle implementation over better-sqlite3.
 * Implements @soostori/storage's TransactionHandle interface.
 */

import { getDatabase } from './sqlite-database.js'
import type { TransactionHandle } from '@soostori/storage'
import type { UUID } from '@soostori/core'

export class SqliteTransactionHandle implements TransactionHandle {
  // better-sqlite3 is synchronous; all operations are sync underneath.
  // SqliteTransactionHandle wraps sync calls as Promises to satisfy async SDK interface.

  async insert<T>(table: string, data: T): Promise<T> {
    const db = getDatabase()
    const cols = Object.keys(data as Record<string, unknown>).filter(k => k !== 'id')
    const vals = cols.map(k => (data as Record<string, unknown>)[k])
    const placeholders = cols.map(() => '?').join(', ')
    const id = (data as Record<string, unknown>).id as string
    db.prepare(`INSERT INTO ${table} (id, ${cols.join(', ')}) VALUES (?, ${placeholders})`).run(id, ...vals)
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
    return row as T
  }

  async update<T>(table: string, id: UUID, changes: Partial<T>): Promise<T> {
    const db = getDatabase()
    const fields = Object.keys(changes as Record<string, unknown>)
    const vals = fields.map(k => (changes as Record<string, unknown>)[k])
    const setClause = fields.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...vals, id)
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id)
    return row as T
  }

  async delete(table: string, id: UUID): Promise<void> {
    getDatabase().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
  }

  async raw(sql: string, params?: unknown[]): Promise<unknown[]> {
    return getDatabase().prepare(sql).all(...(params ?? []))
  }
}
