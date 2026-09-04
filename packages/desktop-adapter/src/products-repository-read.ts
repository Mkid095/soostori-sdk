/**
 * Products read operations — queries only, no side effects.
 */

import { getDatabase } from './sqlite-database'
import { asProductId, asCategoryId } from '@soostori/core'
import type { Product, Category } from '@soostori/core'
import type { ProductId, CategoryId } from './products-repository-types'
import type { ProductRow, CategoryRow } from './products-repository-mappers'
import { rowToProduct, rowToCategory } from './products-repository-mappers'

export class ProductsReadRepository {
  async findById(id: ProductId): Promise<Product | null> {
    const row = getDatabase()
      .prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL')
      .get(id as string) as ProductRow | undefined
    return row ? rowToProduct(row) : null
  }

  async findMany(filter?: {
    categoryId?: CategoryId
    search?: string
    activeOnly?: boolean
  }): Promise<Product[]> {
    const db = getDatabase()
    const conditions = ['deleted_at IS NULL']
    const values: (string | number)[] = []
    if (filter?.categoryId) {
      conditions.push('category_id = ?')
      values.push(filter.categoryId as string)
    }
    if (filter?.search) {
      conditions.push('(name LIKE ? OR barcode LIKE ? OR sku LIKE ?)')
      const term = `%${filter.search}%`
      values.push(term, term, term)
    }
    if (filter?.activeOnly) conditions.push('is_active = 1')
    const where = `WHERE ${conditions.join(' AND ')}`
    const rows = db.prepare(`SELECT * FROM products ${where}`).all(...values) as ProductRow[]
    return rows.map(rowToProduct)
  }

  async findByBarcode(barcode: string): Promise<Product | null> {
    const row = getDatabase()
      .prepare('SELECT * FROM products WHERE barcode = ? AND deleted_at IS NULL AND is_active = 1')
      .get(barcode) as ProductRow | undefined
    return row ? rowToProduct(row) : null
  }

  async findCategoryById(id: CategoryId): Promise<Category | null> {
    const row = getDatabase()
      .prepare('SELECT * FROM categories WHERE id = ?')
      .get(id as string) as CategoryRow | undefined
    return row ? rowToCategory(row) : null
  }

  async findCategories(): Promise<Category[]> {
    const rows = getDatabase()
      .prepare('SELECT * FROM categories ORDER BY display_order, name')
      .all() as CategoryRow[]
    return rows.map(rowToCategory)
  }
}
