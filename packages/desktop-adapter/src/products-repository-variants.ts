/**
 * Product variant operations.
 */

import { getDatabase } from './sqlite-database.js'
import { randomUUID } from 'crypto'
import type { ProductVariant } from './products-repository-types.js'
import type { ProductVariantId, ProductId } from './products-repository-types.js'
import type { VariantRow } from './products-repository-mappers.js'
import { rowToVariant } from './products-repository-mappers.js'

export class ProductsVariantRepository {
  async findVariants(productId: ProductId): Promise<ProductVariant[]> {
    const rows = getDatabase()
      .prepare('SELECT * FROM product_variants WHERE product_id = ?')
      .all(productId as string) as VariantRow[]
    return rows.map(rowToVariant)
  }

  async createVariant(data: {
    productId: import('@soostori/core').UUID
    name: string
    sku?: string | null
    barcode?: string | null
    costPrice?: import('@soostori/core').Money | null
    sellingPrice?: import('@soostori/core').Money | null
    stockQuantity?: number
    metadata?: Record<string, unknown> | null
  }): Promise<ProductVariant> {
    const db = getDatabase()
    const id = randomUUID() as unknown as ProductVariantId
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO product_variants (id, product_id, name, sku, barcode, cost_price, selling_price, stock_quantity, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.productId, data.name,
      data.sku || null, data.barcode || null,
      data.costPrice ?? null, data.sellingPrice ?? null,
      data.stockQuantity ?? 0,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now, now,
    )
    const row = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(id as string) as VariantRow
    return rowToVariant(row)
  }
}
