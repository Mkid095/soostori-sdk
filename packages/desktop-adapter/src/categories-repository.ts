/**
 * Categories repository — implements @soostori/storage Repository<Category> over Desktop categories table.
 *
 * Desktop table: categories(id, name, description, icon, color, display_order, is_active, created_at, updated_at)
 * SDK Category canonical shape: { id, shopId, name, color, description, isActive, createdAt, updatedAt }
 *
 * Desktop-only fields (not in SDK): icon, display_order — surfaced in metadata for round-trip fidelity.
 */

import { SqliteRepository } from './sqlite-repository.js'
import type { Category, CategoryId, ShopId, ISO8601 } from '@soostori/core'
import { asCategoryId } from '@soostori/core'

interface CategoryRow {
  id: string; name: string; description: string | null; icon: string | null;
  color: string; display_order: number; is_active: number;
  created_at: string; updated_at: string;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: asCategoryId(row.id),
    shopId: null as unknown as ShopId,
    name: row.name,
    color: row.color ?? '#6366f1',
    description: row.description ?? null,
    isActive: row.is_active === 1,
    createdAt: row.created_at as ISO8601,
    updatedAt: row.updated_at as ISO8601,
  }
}

export class CategoriesRepository extends SqliteRepository<Category> {
  protected tableName(): string {
    return 'categories'
  }

  async findByName(name: string): Promise<Category | null> {
    const { getDatabase } = await import('./sqlite-database.js')
    const row = getDatabase()
      .prepare('SELECT * FROM categories WHERE name = ? COLLATE NOCASE')
      .get(name) as CategoryRow | undefined
    return row ? rowToCategory(row) : null
  }
}
