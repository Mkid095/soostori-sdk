/**
 * Product domain — extracted from Desktop's `products` table schema.
 *
 * Fields mirror Desktop exactly so contracts don't drift from implementation.
 */

import type { Money, ISO8601, UUID, CategoryId, ShopId } from '@soostori/core'

/** Product unit of measure. */
export type ProductUnit = 'piece' | 'kg' | 'g' | 'l' | 'ml' | 'pack' | 'box' | 'carton' | 'bottle' | 'bag'

/** Group/bundle price tier. */
export interface GroupPrice {
  quantity: number  // buy N for price
  price: Money     // total price for N
}

/** Canonical product — matches Desktop's `products` table fields. */
export interface Product {
  id: UUID
  shopId: UUID
  categoryId: UUID | null
  name: string
  sku: string | null
  barcode: string | null
  description: string | null
  imageUrl: string | null

  /** Cost price (per single unit). */
  costPrice: Money
  /** Default selling price (per single unit). */
  sellingPrice: Money
  /** Optional promo/discount price. */
  discountPrice: Money | null
  /** Default unit. */
  unit: ProductUnit

  /** Current stock count — canonical source of truth. */
  stockQuantity: number
  /** Cached fast-read stock (synced from inventory_transactions). */
  currentStock: number
  /** Low-stock alert threshold. */
  lowStockThreshold: number

  /** Whether stock changes should be tracked. */
  trackInventory: boolean
  /** Whether this product has variants. */
  hasVariants: boolean
  /** Whether customers can buy single units (vs boxes only). */
  allowSingleUnitSale: boolean

  /** Group/bundle prices — JSON string in local DB. */
  groupPrices: GroupPrice[] | null
  /** How many units in a package/box (for bulk selling). */
  unitsPerPackage: number | null
  /** Box/carton buying price (cost per box). */
  boxBuyingPrice: Money | null
  /** Bulk selling price (per box when buying whole box). */
  bulkSellingPrice: Money | null

  /** Supplier info (distributor). */
  distributorName: string | null
  distributorPhone: string | null

  /** Soft delete flag. */
  isActive: boolean
  deletedAt: ISO8601 | null
  expiryDate: ISO8601 | null

  createdAt: ISO8601
  updatedAt: ISO8601
}

/** Product category. */
export interface Category {
  id: CategoryId
  shopId: ShopId
  name: string
  description: string | null
  icon: string | null
  color: string
  displayOrder: number
  isActive: boolean
  createdAt: ISO8601
  updatedAt: ISO8601
}

/** Product variant — for businesses that sell size/color variants. */
export interface ProductVariant {
  id: UUID
  productId: UUID
  name: string
  sku: string | null
  barcode: string | null
  costPrice: Money | null
  sellingPrice: Money | null
  stockQuantity: number
  metadata: Record<string, unknown> | null
  createdAt: ISO8601
  updatedAt: ISO8601
}
