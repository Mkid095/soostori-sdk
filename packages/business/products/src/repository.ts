/**
 * Product repository contract.
 *
 * This is a SDK-level abstraction. Each platform (Desktop, Mobile) provides
 * its own implementation backed by their local SQLite store.
 *
 * The repository pattern keeps domain logic separate from storage so the
 * SDK isn't tied to SQLite.
 */

import type { Product, ProductVariant } from './types.js'
import type { Money, ISO8601 } from '@soostori/core'
import type { Category } from '@soostori/core'
import type { UUID } from '@soostori/core'

export interface ProductFilter {
  categoryId?: UUID
  search?: string
  activeOnly?: boolean
  lowStockOnly?: boolean
}

export interface PaginationOptions {
  limit?: number
  offset?: number
}

/** Repository contract — platform implementations must satisfy this. */
export interface ProductRepository {
  // Products
  findById(id: UUID): Promise<Product | null>
  findByBarcode(barcode: string): Promise<Product | null>
  findMany(filter?: ProductFilter, pagination?: PaginationOptions): Promise<Product[]>
  create(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'currentStock'>): Promise<Product>
  update(id: UUID, changes: Partial<Product>): Promise<Product>
  softDelete(id: UUID): Promise<void>

  // Categories
  findCategoryById(id: UUID): Promise<Category | null>
  findCategories(): Promise<Category[]>
  createCategory(data: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<Category>
  updateCategory(id: UUID, changes: Partial<Category>): Promise<Category>

  // Variants
  findVariants(productId: UUID): Promise<ProductVariant[]>
  createVariant(data: Omit<ProductVariant, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProductVariant>

  // Stock operations
  /** Atomic stock decrement — throws if insufficient. */
  decrementStock(productId: UUID, quantity: number): Promise<void>
  /** Atomic stock increment. */
  incrementStock(productId: UUID, quantity: number): Promise<void>
  /** Set absolute stock value (used for adjustments). */
  setStock(productId: UUID, newQuantity: number, reason: string): Promise<void>
}

/** Errors that repositories should throw. */
export class ProductNotFoundError extends Error {
  constructor(id: UUID) {
    super(`Product ${id} not found`)
    this.name = 'ProductNotFoundError'
  }
}

export class InsufficientStockError extends Error {
  constructor(productId: UUID, available: number, requested: number) {
    super(`Insufficient stock for ${productId}: ${available} available, ${requested} requested`)
    this.name = 'InsufficientStockError'
  }
}
