/**
 * Customers repository — implements @soostori/storage Repository<Customer> over Desktop customers table.
 *
 * Desktop table: customers(id, name, phone, email, address, notes, is_active, id_number, created_at, updated_at)
 * SDK Customer canonical shape: { id, shopId, name, phone, email, idNumber, address, notes, isActive, createdAt, updatedAt }
 *
 * Note: Desktop customers table has no shop_id column. shopId is set to null in mapped entities.
 * Soft-delete is used (is_active flag) rather than hard delete.
 */

import { getDatabase } from './sqlite-database.js'
import type { Customer, CustomerId, ShopId, ISO8601 } from '@soostori/core'
import { asCustomerId } from '@soostori/core'

interface CustomerRow {
  id: string; name: string; phone: string | null; email: string | null;
  address: string | null; notes: string | null; is_active: number;
  id_number: string | null; created_at: string; updated_at: string;
}

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: asCustomerId(row.id),
    shopId: null as unknown as ShopId,
    name: row.name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    idNumber: row.id_number ?? null,
    address: row.address ?? null,
    notes: row.notes ?? null,
    isActive: row.is_active === 1,
    createdAt: row.created_at as ISO8601,
    updatedAt: row.updated_at as ISO8601,
  }
}

export class CustomersRepository {
  async findById(id: CustomerId): Promise<Customer | null> {
    const row = getDatabase()
      .prepare('SELECT * FROM customers WHERE id = ?')
      .get(id as string) as CustomerRow | undefined
    return row ? rowToCustomer(row) : null
  }

  async findMany(filter: { isActive?: boolean } = {}): Promise<Customer[]> {
    const rows = filter.isActive === false
      ? getDatabase().prepare('SELECT * FROM customers WHERE is_active = 0').all() as CustomerRow[]
      : getDatabase().prepare('SELECT * FROM customers WHERE is_active = 1 ORDER BY name ASC').all() as CustomerRow[]
    return rows.map(rowToCustomer)
  }

  async create(data: Omit<Customer, 'shopId' | 'createdAt' | 'updatedAt'>): Promise<Customer> {
    const db = getDatabase()
    const now = new Date().toISOString()
    const id = data.id ?? asCustomerId(crypto.randomUUID())
    db.prepare(`
      INSERT INTO customers (id, name, phone, email, address, notes, id_number, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id as string,
      data.name,
      data.phone ?? null,
      data.email ?? null,
      data.address ?? null,
      data.notes ?? null,
      data.idNumber ?? null,
      now,
      now,
    )
    return (await this.findById(id))!
  }

  async update(id: CustomerId, changes: Partial<Omit<Customer, 'id' | 'shopId' | 'createdAt' | 'updatedAt'>>): Promise<Customer> {
    const db = getDatabase()
    const now = new Date().toISOString()
    const fields: string[] = []
    const values: (string | null)[] = []
    if (changes.name !== undefined) { fields.push('name = ?'); values.push(changes.name) }
    if (changes.phone !== undefined) { fields.push('phone = ?'); values.push(changes.phone ?? null) }
    if (changes.email !== undefined) { fields.push('email = ?'); values.push(changes.email ?? null) }
    if (changes.address !== undefined) { fields.push('address = ?'); values.push(changes.address ?? null) }
    if (changes.notes !== undefined) { fields.push('notes = ?'); values.push(changes.notes ?? null) }
    if (changes.idNumber !== undefined) { fields.push('id_number = ?'); values.push(changes.idNumber ?? null) }
    if (changes.isActive !== undefined) { fields.push('is_active = ?'); values.push(changes.isActive ? '1' : '0') }
    fields.push('updated_at = ?'); values.push(now); values.push(id as string)
    db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return (await this.findById(id))!
  }

  async softDelete(id: CustomerId): Promise<void> {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE customers SET is_active = 0, updated_at = ? WHERE id = ?').run(now, id as string)
  }
}
