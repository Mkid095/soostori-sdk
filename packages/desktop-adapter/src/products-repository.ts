/**
 * Products repository — implements @soostori/products ProductRepository over Desktop products table.
 *
 * Broken into focused modules:
 *   products-repository-read     — queries (findById, findMany, findByBarcode, categories)
 *   products-repository-write    — mutations (create, update, softDelete, categories)
 *   products-repository-stock    — stock adjustments (increment, decrement, set)
 *   products-repository-variants — variant CRUD
 *   products-repository-mappers  — row→domain type converters
 *   products-repository-types   — shared interfaces
 */

export type { ProductCreateInput, CategoryCreateInput, ProductVariant } from './products-repository-types'
export type { ProductId, CategoryId, ProductVariantId, ISO8601, Money } from './products-repository-types'

import { ProductsReadRepository } from './products-repository-read'
import { ProductsWriteRepository } from './products-repository-write'
import { ProductsStockRepository } from './products-repository-stock'
import { ProductsVariantRepository } from './products-repository-variants'
import type { Product, Category } from '@soostori/core'
import type { ProductId, CategoryId } from './products-repository-types'
import type { ProductVariant } from './products-repository-types'
import type { UUID } from '@soostori/core'

export class ProductsRepository {
  private read = new ProductsReadRepository()
  private write = new ProductsWriteRepository()
  private stock = new ProductsStockRepository()
  private variants = new ProductsVariantRepository()

  findById = this.read.findById.bind(this.read)
  findMany = this.read.findMany.bind(this.read)
  findByBarcode = this.read.findByBarcode.bind(this.read)
  findCategoryById = this.read.findCategoryById.bind(this.read)
  findCategories = this.read.findCategories.bind(this.read)

  create = this.write.create.bind(this.write)
  update = this.write.update.bind(this.write)
  softDelete = this.write.softDelete.bind(this.write)
  createCategory = this.write.createCategory.bind(this.write)
  updateCategory = this.write.updateCategory.bind(this.write)

  /** Overridden to inject inventory ledger meta — called by SalesService.commit(). */
  async decrementStock(productId: ProductId, quantity: number): Promise<void> {
    return this.stock.decrementStock(productId, quantity, ProductsRepository._currentSaleMeta)
  }

  incrementStock = this.stock.incrementStock.bind(this.stock)
  setStock = this.stock.setStock.bind(this.stock)

  findVariants = this.variants.findVariants.bind(this.variants)
  createVariant = this.variants.createVariant.bind(this.variants)

  /** Set sale context before calling commit(). Used by the orchestrator. */
  static setSaleMeta(meta: { saleId?: string; userId?: string; deviceId?: string; shopId?: string }): void {
    ProductsRepository._currentSaleMeta = meta
  }

  private static _currentSaleMeta = {}
}
