/**
 * Row mappers — Desktop DB rows → SDK domain types.
 *
 * shopId is read from ProductsRepository._currentSaleMeta at mapp time.
 * The orchestrator calls ProductsRepository.setSaleMeta({ shopId }) before any
 * sale operation; the mapper extracts it here.
 */

import type { Product, Category } from '@soostori/core'
import { asProductId, asCategoryId, asShopId } from '@soostori/core'
import type { ISO8601, Money, ShopId } from '@soostori/core'
import type { ProductVariant } from './products-repository-types.js'

// Shared mutable context — written by ProductsRepository.setSaleMeta, read by mappers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _currentMeta: { shopId?: string; saleId?: string; userId?: string; deviceId?: string } = {}

export function setCurrentMeta(meta: { shopId?: string; saleId?: string; userId?: string; deviceId?: string }): void {
  _currentMeta = meta
}

function currentShopId(): ShopId {
  if (!_currentMeta.shopId) throw new Error('shopId not set — call setCurrentMeta({ shopId }) before row mapping')
  return asShopId(_currentMeta.shopId)
}

/** Desktop categories row — internal to the adapter, not part of SDK contract. */
export interface CategoryRow {
  id: string; name: string; description: string | null; icon: string | null;
  color: string; display_order: number; is_active: number;
  created_at: string; updated_at: string;
}

export interface ProductRow {
  id: string; category_id: string | null; name: string; sku: string | null;
  barcode: string | null; description: string | null; image_url: string | null;
  cost_price: number; selling_price: number; discount_price: number | null;
  unit: string; stock_quantity: number; current_stock: number;
  low_stock_threshold: number; track_inventory: number; has_variants: number;
  parent_variant_id: string | null; expiry_date: string | null; metadata: string | null;
  is_active: number; created_at: string; updated_at: string; deleted_at: string | null;
  distributor_name: string | null; distributor_phone: string | null;
  barcode_generated: number; allow_single_unit_sale: number;
  units_per_package: number | null; box_buying_price: number | null;
  bulk_selling_price: number | null; group_prices: string | null;
}

export interface VariantRow {
  id: string; product_id: string; name: string; sku: string | null;
  barcode: string | null; cost_price: number | null; selling_price: number | null;
  stock_quantity: number; metadata: string | null;
  created_at: string; updated_at: string;
}

export function rowToProduct(row: ProductRow): Product {
  return {
    id: asProductId(row.id),
    shopId: currentShopId(),
    categoryId: row.category_id ? asCategoryId(row.category_id) : null,
    name: row.name,
    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    description: row.description ?? null,
    costPrice: (row.cost_price ?? 0) as Money,
    sellingPrice: row.selling_price as Money,
    groupPrices: row.group_prices ?? null,
    isGroup: row.has_variants === 1,
    unitsPerPackage: row.units_per_package ?? 1,
    stockQuantity: row.stock_quantity ?? 0,
    currentStock: row.current_stock ?? 0,
    lowStockThreshold: row.low_stock_threshold ?? 5,
    trackInventory: row.track_inventory === 1,
    allowSingleUnitSale: row.allow_single_unit_sale === 1,
    distributorName: row.distributor_name ?? null,
    distributorPhone: row.distributor_phone ?? null,
    image: row.image_url ?? null,
    isActive: row.is_active === 1,
    createdAt: row.created_at as ISO8601,
    updatedAt: row.updated_at as ISO8601,
  }
}

export function rowToCategory(row: CategoryRow): Category {
  return {
    id: asCategoryId(row.id),
    shopId: currentShopId(),
    name: row.name,
    description: row.description ?? null,
    color: row.color,
    isActive: row.is_active === 1,
    createdAt: row.created_at as ISO8601,
    updatedAt: row.updated_at as ISO8601,
  }
}

export function rowToVariant(row: VariantRow): ProductVariant {
  return {
    // Variant IDs use a distinct brand — bypass cast required (was as unknown as before)
    id: asProductId(row.id) as unknown as ProductVariant['id'],
    productId: asProductId(row.product_id) as unknown as ProductVariant['productId'],
    name: row.name,
    sku: row.sku ?? null,
    barcode: row.barcode ?? null,
    costPrice: row.cost_price as Money ?? null,
    sellingPrice: row.selling_price as Money ?? null,
    stockQuantity: row.stock_quantity ?? 0,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    createdAt: row.created_at as ISO8601,
    updatedAt: row.updated_at as ISO8601,
  }
}
