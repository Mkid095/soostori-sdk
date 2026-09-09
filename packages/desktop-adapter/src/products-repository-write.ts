/**
 * Products write operations — creates, updates, deletes.
 */

import { getDatabase } from './sqlite-database.js'
import { randomUUID } from 'crypto'
import { asProductId, asCategoryId } from '@soostori/core'
import type { Product, Category } from '@soostori/core'
import type { ProductCreateInput, CategoryCreateInput } from './products-repository-types.js'
import type { ProductId, CategoryId } from './products-repository-types.js'
import type { ProductRow, CategoryRow } from './products-repository-mappers.js'
import { rowToProduct, rowToCategory } from './products-repository-mappers.js'

const fieldMap: Array<[keyof Partial<ProductCreateInput>, string]> = [
  ['name', 'name'], ['categoryId', 'category_id'], ['sku', 'sku'],
  ['barcode', 'barcode'], ['description', 'description'],
  ['imageUrl', 'image_url'], ['costPrice', 'cost_price'],
  ['sellingPrice', 'selling_price'], ['discountPrice', 'discount_price'],
  ['unit', 'unit'], ['stockQuantity', 'stock_quantity'],
  ['lowStockThreshold', 'low_stock_threshold'],
  ['trackInventory', 'track_inventory'], ['allowSingleUnitSale', 'allow_single_unit_sale'],
  ['distributorName', 'distributor_name'],
  ['distributorPhone', 'distributor_phone'],
]

export class ProductsWriteRepository {
  async create(data: ProductCreateInput): Promise<Product> {
    const db = getDatabase()
    const id = randomUUID() as unknown as ProductId
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO products (id, category_id, name, sku, barcode, description, image_url,
        cost_price, selling_price, discount_price, unit, stock_quantity,
        low_stock_threshold, track_inventory, has_variants, expiry_date,
        is_active, distributor_name, distributor_phone,
        barcode_generated, allow_single_unit_sale, units_per_package,
        box_buying_price, bulk_selling_price, group_prices,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.categoryId || null, data.name, data.sku || null, data.barcode || null,
      data.description || null, data.imageUrl || null,
      data.costPrice ?? 0, data.sellingPrice,
      data.discountPrice ?? null, data.unit || 'piece', data.stockQuantity ?? 0,
      data.lowStockThreshold ?? 5, data.trackInventory ? 1 : 0, 0,
      null, data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
      data.distributorName || null, data.distributorPhone || null,
      0, data.allowSingleUnitSale !== false ? 1 : 0,
      null, null, null, null, now, now,
    )
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id as string) as ProductRow
    return rowToProduct(row)
  }

  async update(id: ProductId, changes: Partial<ProductCreateInput>): Promise<Product> {
    const db = getDatabase()
    const now = new Date().toISOString()
    const sets: string[] = []; const vals: unknown[] = []
    for (const [sdkKey, dbCol] of fieldMap) {
      const v = changes[sdkKey]
      if (v !== undefined) {
        sets.push(`${dbCol} = ?`)
        if (sdkKey === 'trackInventory' || sdkKey === 'allowSingleUnitSale') {
          vals.push(v ? 1 : 0)
        } else {
          vals.push(v as string | number | null)
        }
      }
    }
    sets.push('updated_at = ?'); vals.push(now, id as string)
    db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id as string) as ProductRow
    return rowToProduct(row)
  }

  async softDelete(id: ProductId): Promise<void> {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare('UPDATE products SET deleted_at = ?, is_active = 0 WHERE id = ?')
      .run(now, id as string)
  }

  async createCategory(data: CategoryCreateInput): Promise<Category> {
    const db = getDatabase()
    const id = randomUUID() as unknown as CategoryId
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO categories (id, name, description, icon, color, display_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, data.name, data.description || null, data.icon || null,
      data.color || '#6366f1', data.displayOrder ?? 0, now, now)
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id as string) as CategoryRow
    return rowToCategory(row)
  }

  async updateCategory(id: CategoryId, changes: Partial<CategoryCreateInput>): Promise<Category> {
    const db = getDatabase()
    const now = new Date().toISOString()
    const catFieldMap: Array<[keyof Partial<CategoryCreateInput>, string]> = [
      ['name', 'name'], ['description', 'description'],
      ['icon', 'icon'], ['color', 'color'], ['displayOrder', 'display_order'],
    ]
    const sets: string[] = []; const vals: unknown[] = []
    for (const [sdkKey, dbCol] of catFieldMap) {
      const v = changes[sdkKey]
      if (v !== undefined) { sets.push(`${dbCol} = ?`); vals.push(v) }
    }
    sets.push('updated_at = ?'); vals.push(now, id as string)
    db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id as string) as CategoryRow
    return rowToCategory(row)
  }
}
