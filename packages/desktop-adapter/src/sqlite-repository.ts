/**
 * SQLite repository base — implements @soostori/storage Repository<T> over better-sqlite3.
 * All domain repositories extend this. No business logic lives here.
 */

import { getDatabase } from './sqlite-database.js'
import { SqliteTransactionHandle } from './sqlite-transaction.js'
import type { Repository, TransactionHandle } from '@soostori/storage'
import type { UUID } from '@soostori/core'

export abstract class SqliteRepository<T extends { id: UUID }> implements Repository<T> {
  protected abstract tableName(): string

  async findById(id: UUID): Promise<T | null> {
    const row = getDatabase().prepare(`SELECT * FROM ${this.tableName()} WHERE id = ?`).get(id) as T | undefined
    return row ?? null
  }

  async findMany(filter: Record<string, unknown> = {}): Promise<T[]> {
    if (Object.keys(filter).length === 0) {
      return getDatabase().prepare(`SELECT * FROM ${this.tableName()}`).all() as T[]
    }
    const cols = Object.keys(filter)
    const where = cols.map(c => `${c} = ?`).join(' AND ')
    const vals = cols.map(c => filter[c])
    return getDatabase().prepare(`SELECT * FROM ${this.tableName()} WHERE ${where}`).all(...vals) as T[]
  }

  async create(data: T): Promise<T> {
    const db = getDatabase()
    const cols = Object.keys(data as Record<string, unknown>).filter(k => k !== 'id')
    const vals = cols.map(k => (data as Record<string, unknown>)[k])
    const placeholders = cols.map(() => '?').join(', ')
    db.prepare(`INSERT INTO ${this.tableName()} (id, ${cols.join(', ')}) VALUES (?, ${placeholders})`).run(data.id, ...vals)
    return data
  }

  async update(id: UUID, changes: Partial<T>): Promise<T> {
    const db = getDatabase()
    const fields = Object.keys(changes as Record<string, unknown>)
    const vals = fields.map(k => (changes as Record<string, unknown>)[k])
    const setClause = fields.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE ${this.tableName()} SET ${setClause} WHERE id = ?`).run(...vals, id)
    return db.prepare(`SELECT * FROM ${this.tableName()} WHERE id = ?`).get(id) as T
  }

  async delete(id: UUID): Promise<void> {
    getDatabase().prepare(`DELETE FROM ${this.tableName()} WHERE id = ?`).run(id)
  }

  async transaction<R>(fn: (tx: TransactionHandle) => Promise<R>): Promise<R> {
    const db = getDatabase()
    return new Promise<R>((resolve, reject) => {
      try {
        db.transaction(() => {
          const handle: TransactionHandle = new SqliteTransactionHandle()
          const result = fn(handle)
          if (result && typeof (result as Promise<R>).then === 'function') {
            (result as Promise<R>).then(resolve).catch(reject)
          } else {
            resolve(result as R)
          }
        })()
      } catch (e) {
        reject(e)
      }
    })
  }
}
