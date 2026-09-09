/**
 * Products stock operations — increment, decrement, set.
 *
 * CRITICAL: These mutations append to the canonical inventory_transactions ledger.
 * The products.current_stock column is the cached balance only.
 *
 * Concurrency safety: decrementStock uses a conditional UPDATE with a WHERE clause
 * (current_stock >= ?) so the stock check is ATOMIC in SQLite — no TOCTOU race.
 * If no rows are updated, insufficient stock.
 */

import { randomUUID } from 'crypto'
import { getDatabase } from './sqlite-database.js'
import type { ProductId } from './products-repository-types.js'

export class ProductsStockRepository {
  async decrementStock(
    productId: ProductId,
    quantity: number,
    meta: { saleId?: string; userId?: string; deviceId?: string; shopId?: string } = {},
  ): Promise<void> {
    const db = getDatabase()
    const now = new Date().toISOString()

    // Atomic conditional UPDATE — check AND mutation in ONE SQLite statement.
    // If current_stock < quantity, 0 rows are updated → insufficient stock.
    const info = db.prepare(
      'UPDATE products SET current_stock = current_stock - ?, stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ? AND current_stock >= ?',
    ).run(quantity, quantity, now, productId as string, quantity)

    if (info.changes === 0) {
      // Either product not found OR insufficient stock — determine which
      const product = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(productId as string) as { current_stock: number } | undefined
      if (!product) throw new Error(`Product ${productId} not found`)
      throw new Error(
        `Insufficient stock: ${product.current_stock} available, ${quantity} requested`,
      )
    }

    // Read the new balance after atomic decrement
    const updated = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(productId as string) as { current_stock: number }

    // Append canonical inventory ledger entry
    db.prepare(`
      INSERT INTO inventory_transactions
        (id, shop_id, product_id, device_id, user_id, event_type, quantity, balance_after, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'sale', ?, ?, 'confirmed', ?)
    `).run(
      randomUUID(),
      meta.shopId ?? null,
      productId as string,
      meta.deviceId ?? null,
      meta.userId ?? null,
      -quantity,
      updated.current_stock,
      now,
    )
  }

  async incrementStock(
    productId: ProductId,
    quantity: number,
    meta: { reason?: string; referenceId?: string; userId?: string; deviceId?: string; shopId?: string } = {},
  ): Promise<void> {
    const db = getDatabase()
    const now = new Date().toISOString()

    // Atomic increment — safe because stock can only increase
    db.prepare(
      'UPDATE products SET current_stock = current_stock + ?, stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?',
    ).run(quantity, quantity, now, productId as string)

    // Read new balance after increment
    const product = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(productId as string) as { current_stock: number } | undefined
    if (!product) throw new Error(`Product ${productId} not found`)

    db.prepare(`
      INSERT INTO inventory_transactions
        (id, shop_id, product_id, device_id, user_id, event_type, quantity, balance_after, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'received', ?, ?, 'confirmed', ?)
    `).run(
      randomUUID(),
      meta.shopId ?? null,
      productId as string,
      meta.deviceId ?? null,
      meta.userId ?? null,
      quantity,
      product.current_stock,
      now,
    )
  }

  async setStock(productId: ProductId, newQuantity: number): Promise<void> {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE products SET current_stock = ?, stock_quantity = ?, updated_at = ? WHERE id = ?',
    ).run(newQuantity, newQuantity, now, productId as string)
  }
}
