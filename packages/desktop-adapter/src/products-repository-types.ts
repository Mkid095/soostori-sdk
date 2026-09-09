/**
 * ProductsRepository type definitions — shared interfaces for the repository module.
 */

import type { ProductId, CategoryId, ProductVariantId, ISO8601, Money } from '@soostori/core'
export type { ProductId, CategoryId, ProductVariantId, ISO8601, Money }

/** Full product insert input — includes Desktop-extended fields not in SDK Product. */
export interface ProductCreateInput {
  name: string
  categoryId?: string | null
  sku?: string | null
  barcode?: string | null
  description?: string | null
  imageUrl?: string | null
  costPrice?: Money
  sellingPrice: Money
  discountPrice?: Money | null
  unit?: string
  stockQuantity?: number
  lowStockThreshold?: number
  trackInventory?: boolean
  hasVariants?: boolean
  allowSingleUnitSale?: boolean
  distributorName?: string | null
  distributorPhone?: string | null
  isActive?: boolean
  [key: string]: unknown
}

/** Full category insert input. */
export interface CategoryCreateInput {
  name: string
  description?: string | null
  icon?: string | null
  color?: string
  displayOrder?: number
  isActive?: boolean
}

/** Local ProductVariant — mirrors @soostori/business/products ProductVariant */
export interface ProductVariant {
  id: ProductVariantId
  productId: ProductId
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
