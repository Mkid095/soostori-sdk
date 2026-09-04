/**
 * Inventory repository — implements @soostori/inventory InventoryRepository over Desktop SQLite.
 *
 * The `inventory_transactions` table IS the canonical ledger (append-only).
 * `products.current_stock` is the cached balance — updated by the repository.
 *
 * Desktop legacy tables (stock_movements, stock_adjustment_log) are NOT used by this
 * adapter — they are deprecated in favor of inventory_transactions.
 */

import { getDatabase } from './sqlite-database'
import type { InventoryRepository, MovementFilter } from '@soostori/inventory'
import type { StockMovement, StockBalance, StockReservation, StockSummary } from '@soostori/inventory'
import type { UUID, ISO8601 } from '@soostori/core'
import { randomUUID } from 'crypto'

interface InvTxRow {
  id: string; shop_id: string; product_id: string; device_id: string;
  user_id: string; event_type: string; quantity: number; balance_after: number;
  status: string; payload: string | null; sequence_number: number;
  idempotency_key: string | null; created_at: string;
}

function rowToMovement(row: InvTxRow): StockMovement {
  return {
    id: row.id as UUID,
    shopId: row.shop_id as UUID,
    productId: row.product_id as UUID,
    productVariantId: null,
    type: row.event_type as StockMovement['type'],
    quantity: row.quantity,
    balanceAfter: row.balance_after,
    referenceId: row.payload ? JSON.parse(row.payload).referenceId ?? null : null,
    referenceType: row.payload ? JSON.parse(row.payload).referenceType ?? null : null,
    reason: row.payload ? JSON.parse(row.payload).reason ?? null : null,
    actorType: 'employee',
    actorId: row.user_id as UUID,
    deviceId: row.device_id as UUID,
    timestamp: row.created_at as ISO8601,
    sequence: row.sequence_number,
    idempotencyKey: (row.idempotency_key ?? randomUUID()) as UUID,
    syncedAt: null,
  }
}

export class DesktopInventoryRepository implements InventoryRepository {
  async getMovement(id: UUID): Promise<StockMovement | null> {
    const row = getDatabase().prepare('SELECT * FROM inventory_transactions WHERE id = ?').get(id) as InvTxRow | undefined
    return row ? rowToMovement(row) : null
  }

  async listMovements(filter?: MovementFilter, pagination?: { limit?: number; offset?: number }): Promise<StockMovement[]> {
    const db = getDatabase()
    let sql = 'SELECT * FROM inventory_transactions WHERE 1=1'
    const params: unknown[] = []
    if (filter?.productId) { sql += ' AND product_id = ?'; params.push(filter.productId) }
    if (filter?.type) { sql += ' AND event_type = ?'; params.push(filter.type) }
    sql += ' ORDER BY created_at DESC'
    if (pagination?.limit) { sql += ' LIMIT ?'; params.push(pagination.limit) }
    if (pagination?.offset) { sql += ' OFFSET ?'; params.push(pagination.offset) }
    const rows = db.prepare(sql).all(...params) as InvTxRow[]
    return rows.map(rowToMovement)
  }

  async appendMovement(movement: StockMovement): Promise<void> {
    const db = getDatabase()
    db.prepare(`
      INSERT INTO inventory_transactions
        (id, shop_id, product_id, device_id, user_id, event_type, quantity, balance_after, status, payload, sequence_number, idempotency_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      movement.id, movement.shopId, movement.productId, movement.deviceId,
      movement.actorId ?? null, movement.type, movement.quantity,
      movement.balanceAfter, 'confirmed',
      movement.reason || movement.referenceId ? JSON.stringify({ reason: movement.reason, referenceId: movement.referenceId, referenceType: movement.referenceType }) : null,
      movement.sequence, movement.idempotencyKey as string, movement.timestamp,
    )
    // Update cached balance on products
    db.prepare('UPDATE products SET current_stock = ?, updated_at = ? WHERE id = ?')
      .run(movement.balanceAfter, movement.timestamp, movement.productId)
  }

  async hasMovementByKey(idempotencyKey: UUID): Promise<boolean> {
    const row = getDatabase().prepare(
      'SELECT 1 FROM inventory_transactions WHERE idempotency_key = ? LIMIT 1',
    ).get(idempotencyKey as string)
    return row !== undefined
  }

  async getLatestMovement(productId: UUID, _productVariantId?: UUID | null): Promise<StockMovement | null> {
    const row = getDatabase().prepare(
      'SELECT * FROM inventory_transactions WHERE product_id = ? ORDER BY sequence_number DESC LIMIT 1',
    ).get(productId) as InvTxRow | undefined
    return row ? rowToMovement(row) : null
  }

  async getStockSummary(shopId: UUID, productId: UUID): Promise<StockSummary | null> {
    const db = getDatabase()
    const product = db.prepare('SELECT name FROM products WHERE id = ?').get(productId) as { name: string } | undefined
    if (!product) return null
    const last = await this.getLatestMovement(productId)
    const sold = db.prepare(
      "SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_transactions WHERE product_id = ? AND event_type = 'sold'",
    ).get(productId) as { total: number }
    const received = db.prepare(
      "SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_transactions WHERE product_id = ? AND event_type = 'received'",
    ).get(productId) as { total: number }
    const adjusted = db.prepare(
      "SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_transactions WHERE product_id = ? AND event_type = 'adjusted'",
    ).get(productId) as { total: number }
    return {
      productId, shopId,
      productName: product.name,
      currentQuantity: last?.balanceAfter ?? 0,
      totalReceived: received.total,
      totalSold: Math.abs(sold.total),
      totalAdjusted: adjusted.total,
      totalTransferred: 0,
      lastMovementAt: last?.timestamp ?? null,
    }
  }

  async getBalance(productId: UUID, _productVariantId?: UUID | null): Promise<StockBalance | null> {
    const db = getDatabase()
    const product = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(productId) as { current_stock: number } | undefined
    if (!product) return null
    const last = await this.getLatestMovement(productId)
    return {
      productId,
      shopId: last?.shopId ?? ('' as unknown as UUID),
      productVariantId: null,
      quantity: product.current_stock,
      reservedQuantity: 0,
      lastSequence: last?.sequence ?? 0,
      updatedAt: last?.timestamp ?? (new Date().toISOString() as ISO8601),
    }
  }

  async upsertBalance(_balance: StockBalance): Promise<void> {
    // Balance is updated by appendMovement — no separate upsert needed
  }

  // Reservation stubs — not used by Desktop in Phase 9.2
  async createReservation(_r: StockReservation): Promise<void> { /* no-op */ }
  async getReservation(_id: UUID): Promise<StockReservation | null> { return null }
  async getReservationsBySale(_saleId: UUID): Promise<StockReservation[]> { return [] }
  async updateReservationStatus(_id: UUID, _s: StockReservation['status']): Promise<void> { /* no-op */ }
  async getActiveReservations(_productId: UUID): Promise<StockReservation[]> { return [] }
}
