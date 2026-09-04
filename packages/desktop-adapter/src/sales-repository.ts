/**
 * Sales repository — implements SalesRepository contract over Desktop sales table.
 *
 * Desktop table: sales(id, shop_id, user_id, device_id, customer_id, customer_name,
 *   customer_phone, subtotal, discount_amount, tax_amount, total_amount, paid_amount,
 *   payment_method, type, status, note, created_at, updated_at)
 *
 * Desktop sale_items table: sale_items(id, sale_id, product_id, variation_name,
 *   product_name, quantity, unit_price, discount, total_price, created_at)
 *
 * Types match @soostori/sales canonical shapes exactly.
 */

import { randomUUID } from 'crypto'
import { getDatabase } from './sqlite-database'
import type { SaleId, ShopId, UserId, DeviceId, CustomerId, ISO8601, Money, UUID } from '@soostori/core'
import { asSaleId, asShopId } from '@soostori/core'

// ── Local type definitions (canonical @soostori/sales shapes) ──────────────────

export type SaleType = 'retail' | 'wholesale'
export type SaleStatus = 'pending' | 'confirmed' | 'rejected' | 'completed' | 'refunded' | 'cancelled'
export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'transfer' | 'debt'

export interface Sale {
  id: SaleId
  shopId: ShopId
  userId: UserId
  deviceId: DeviceId
  type: SaleType
  status: SaleStatus
  authorizedBy: UUID | null
  subtotal: Money
  discountAmount: Money
  taxAmount: Money
  totalAmount: Money
  paidAmount: Money
  paymentMethod: PaymentMethod
  note: string | null
  customerId: CustomerId | null
  customerName: string | null
  customerIdNumber: string | null
  itemsSummary: string | null
  createdAt: ISO8601
  updatedAt: ISO8601
  confirmedAt: ISO8601 | null
}

export interface SaleItem {
  id: SaleId
  saleId: SaleId
  productId: UUID | null
  productName: string
  variationName: string | null
  quantity: number
  unitPrice: Money
  discount: Money
  totalPrice: Money
}

export interface HeldSale {
  id: UUID
  shopId: ShopId
  name: string | null
  cartItems: string
  paymentMethod: PaymentMethod
  createdAt: ISO8601
  userId: UserId
}

// ── Row types ────────────────────────────────────────────────────────────────

interface SaleRow {
  id: string; shop_id: string; user_id: string; device_id: string;
  customer_id: string | null; customer_name: string | null; customer_phone: string | null;
  subtotal: number; discount_amount: number; tax_amount: number;
  total_amount: number; paid_amount: number; payment_method: string;
  type: string; status: string; note: string | null;
  created_at: string; updated_at: string;
}

interface SaleItemRow {
  id: string; sale_id: string; product_id: string | null;
  variation_name: string | null; product_name: string;
  quantity: number; unit_price: number; discount: number; total_price: number;
  created_at: string;
}

// ── Row mappers ──────────────────────────────────────────────────────────

function rowToSale(row: SaleRow): Sale {
  return {
    id: asSaleId(row.id),
    shopId: asShopId(row.shop_id) as Sale['shopId'],
    userId: row.user_id as UserId,
    deviceId: row.device_id as DeviceId,
    type: row.type as Sale['type'],
    status: row.status as Sale['status'],
    authorizedBy: null,
    subtotal: row.subtotal as Money,
    discountAmount: row.discount_amount as Money,
    taxAmount: row.tax_amount as Money,
    totalAmount: row.total_amount as Money,
    paidAmount: row.paid_amount as Money,
    paymentMethod: row.payment_method as Sale['paymentMethod'],
    note: row.note ?? null,
    customerId: (row.customer_id ?? null) as Sale['customerId'],
    customerName: row.customer_name ?? null,
    customerIdNumber: row.customer_phone ?? null,
    itemsSummary: null,
    createdAt: row.created_at as ISO8601,
    updatedAt: row.updated_at as ISO8601,
    confirmedAt: null,
  }
}

// ── Repository implementation ───────────────────────────────────────────────

export class DesktopSalesRepository {
  private tableName = 'sales'

  async findById(id: SaleId): Promise<Sale | null> {
    const row = getDatabase()
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id as string) as SaleRow | undefined
    return row ? rowToSale(row) : null
  }

  async findMany(filter?: {
    status?: Sale['status']
    startDate?: ISO8601
    endDate?: ISO8601
    customerId?: string
    userId?: string
    deviceId?: string
    paymentMethod?: Sale['paymentMethod']
  }): Promise<Sale[]> {
    const db = getDatabase()
    const conditions: string[] = []
    const values: unknown[] = []
    if (filter?.status) { conditions.push('status = ?'); values.push(filter.status) }
    if (filter?.userId) { conditions.push('user_id = ?'); values.push(filter.userId) }
    if (filter?.deviceId) { conditions.push('device_id = ?'); values.push(filter.deviceId) }
    if (filter?.paymentMethod) { conditions.push('payment_method = ?'); values.push(filter.paymentMethod) }
    if (filter?.startDate) { conditions.push('created_at >= ?'); values.push(filter.startDate) }
    if (filter?.endDate) { conditions.push('created_at <= ?'); values.push(filter.endDate) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = db.prepare(`SELECT * FROM ${this.tableName} ${where} ORDER BY created_at DESC`)
      .all(...values) as SaleRow[]
    return rows.map(rowToSale)
  }

  async create(sale: Sale, items: SaleItem[]): Promise<Sale> {
    // Idempotent: if this saleId already exists, return it without re-inserting.
    const existing = await this.findById(sale.id)
    if (existing) return existing

    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO sales (id, shop_id, user_id, device_id, customer_id, customer_name, customer_phone,
        subtotal, discount_amount, tax_amount, total_amount, paid_amount, payment_method, type, status,
        note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sale.id as string,
      sale.shopId as string,
      sale.userId as string,
      sale.deviceId as string,
      sale.customerId as string | null,
      sale.customerName,
      null,
      sale.subtotal,
      sale.discountAmount,
      sale.taxAmount,
      sale.totalAmount,
      sale.paidAmount,
      sale.paymentMethod,
      sale.type,
      sale.status,
      sale.note,
      sale.createdAt ?? now,
      sale.updatedAt ?? now,
    )

    const insertItem = db.prepare(`
      INSERT INTO sale_items (id, sale_id, product_id, variation_name, product_name, quantity, unit_price, discount, total_price, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const item of items) {
      insertItem.run(
        item.id as string,
        sale.id as string,
        item.productId as string | null,
        item.variationName,
        item.productName,
        item.quantity,
        item.unitPrice,
        item.discount,
        item.totalPrice,
        now,
      )
    }

    return sale
  }

  async update(id: SaleId, changes: Partial<Sale>): Promise<Sale> {
    const db = getDatabase()
    const fields = Object.keys(changes as Record<string, unknown>)
    const vals = fields.map(k => (changes as Record<string, unknown>)[k])
    const setClause = fields.map(f => `${f} = ?`).join(', ')
    db.prepare(`UPDATE ${this.tableName} SET ${setClause}, updated_at = ? WHERE id = ?`)
      .run(...vals, new Date().toISOString(), id as string)
    return (await this.findById(id))!
  }

  async findItemsBySaleId(saleId: SaleId): Promise<SaleItem[]> {
    const rows = getDatabase()
      .prepare('SELECT * FROM sale_items WHERE sale_id = ?')
      .all(saleId as string) as SaleItemRow[]
    return rows.map(r => ({
      id: asSaleId(r.id),
      saleId: asSaleId(r.sale_id),
      productId: (r.product_id ?? null) as SaleItem['productId'],
      productName: r.product_name,
      variationName: r.variation_name ?? null,
      quantity: r.quantity,
      unitPrice: r.unit_price as Money,
      discount: r.discount as Money,
      totalPrice: r.total_price as Money,
    }))
  }

  async findHeldSales(_shopId: ShopId): Promise<HeldSale[]> {
    const rows = getDatabase()
      .prepare('SELECT * FROM held_sales ORDER BY created_at DESC')
      .all() as Array<{
        id: string; shop_id: string; name: string | null; cart_items: string;
        payment_method: string; created_at: string; user_id: string
      }>
    return rows.map(r => ({
      id: r.id as UUID,
      shopId: r.shop_id as ShopId,
      name: r.name,
      cartItems: r.cart_items,
      paymentMethod: r.payment_method as PaymentMethod,
      createdAt: r.created_at as ISO8601,
      userId: r.user_id as UserId,
    }))
  }

  async createHeldSale(data: {
    id: UUID
    shopId: ShopId
    name: string | null
    cartItems: string
    paymentMethod: PaymentMethod
    userId: UserId
  }): Promise<HeldSale> {
    const db = getDatabase()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO held_sales (id, shop_id, name, cart_items, payment_method, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(data.id, data.shopId, data.name ?? null, data.cartItems, data.paymentMethod, data.userId, now)
    return { ...data, createdAt: now }
  }

  async deleteHeldSale(id: UUID): Promise<void> {
    getDatabase().prepare('DELETE FROM held_sales WHERE id = ?').run(id)
  }

  async totals(_filter?: {
    status?: Sale['status']
    startDate?: ISO8601
    endDate?: ISO8601
  }): Promise<{ count: number; total: Money; byPaymentMethod: Record<string, Money> }> {
    return { count: 0, total: 0 as Money, byPaymentMethod: {} }
  }
}
