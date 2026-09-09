/**
 * Business repository — maps Desktop shops table to canonical business types.
 *
 * Desktop schema: shops(id, name, currency, owner_id, created_at, slug, tax_rate, plan, subscription_expiry, status)
 *
 * The canonical Business type (from @soostori/core) is used directly here.
 * This adapter is a Phase 9.1 scaffold — richer business/person/membership
 * contracts from @soostori/business are deferred to Phase 9.2.
 */

import { getDatabase } from './sqlite-database.js'
import type { UUID, ShopId } from '@soostori/core'
import { asShopId } from '@soostori/core'

/** Canonical Shop type (aliased from core's expanded types). */
export interface DesktopShop {
  id: ShopId
  name: string
  slug: string
  taxRate: number
  plan: string
  subscriptionExpiry: string | null
  status: 'active' | 'inactive' | 'suspended'
  currency: string
  createdAt: string
  updatedAt: string
  ownerPersonId: UUID
}

interface ShopRow {
  id: string; name: string; slug: string | null; currency: string;
  owner_id: string | null; tax_rate: number; plan: string;
  subscription_expiry: string | null; status: string; created_at: string;
}

function rowToShop(row: ShopRow): DesktopShop {
  return {
    id: asShopId(row.id),
    name: row.name,
    slug: row.slug ?? row.name.toLowerCase().replace(/\s+/g, '-'),
    taxRate: row.tax_rate,
    plan: row.plan,
    subscriptionExpiry: row.subscription_expiry,
    status: (row.status ?? 'active') as DesktopShop['status'],
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.created_at,
    ownerPersonId: (row.owner_id ?? row.id) as UUID,
  }
}

export class DesktopBusinessRepository {
  async findShop(id: UUID): Promise<DesktopShop | null> {
    const row = getDatabase().prepare('SELECT * FROM shops WHERE id = ?').get(id) as ShopRow | undefined
    return row ? rowToShop(row) : null
  }

  async findAllShops(): Promise<DesktopShop[]> {
    const rows = getDatabase().prepare('SELECT * FROM shops').all() as ShopRow[]
    return rows.map(rowToShop)
  }

  async updateShop(id: UUID, changes: Partial<DesktopShop>): Promise<DesktopShop> {
    const db = getDatabase()
    const map: Record<string, string> = {
      name: 'name', slug: 'slug', taxRate: 'tax_rate',
      plan: 'plan', subscriptionExpiry: 'subscription_expiry', status: 'status',
    }
    const sets: string[] = []; const vals: unknown[] = []
    for (const [k, dbCol] of Object.entries(map)) {
      const v = changes[k as keyof DesktopShop]
      if (v !== undefined) { sets.push(`${dbCol} = ?`); vals.push(v) }
    }
    if (sets.length > 0) db.prepare(`UPDATE shops SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id)
    const row = db.prepare('SELECT * FROM shops WHERE id = ?').get(id) as ShopRow
    return rowToShop(row)
  }

  async getActiveShop(_deviceId: UUID): Promise<DesktopShop | null> {
    const row = getDatabase().prepare('SELECT * FROM shops LIMIT 1').get() as ShopRow | undefined
    return row ? rowToShop(row) : null
  }
}
