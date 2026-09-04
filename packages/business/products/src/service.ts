/**
 * Product service — business logic on top of repository.
 *
 * The service emits Soostori events when products change. UI/notifications/audit
 * subscribe via the event bus.
 *
 * Stock mutations are NOT atomic-safe across devices — they go through
 * the Primary Device for distributed safety. See @soostori/lan.
 */

import type { Product } from './types'
import type { ProductRepository } from './repository'
import type { UUID, Money } from '@soostori/core'
import {
  createEvent, PRODUCT_CREATED, PRODUCT_UPDATED, PRODUCT_DELETED,
  PRICE_CHANGED,
} from '@soostori/events'
import { getEventBus } from '@soostori/events'

export class ProductService {
  constructor(
    private readonly repo: ProductRepository,
    private readonly shopId: UUID,
    private readonly deviceId: UUID,
    private readonly userId?: UUID,
  ) {}

  async create(data: Parameters<ProductRepository['create']>[0]): Promise<Product> {
    const product = await this.repo.create(data)
    await getEventBus().publish(createEvent({
      name: PRODUCT_CREATED,
      shopId: this.shopId,
      deviceId: this.deviceId,
      userId: this.userId,
      entityId: product.id,
      entity: 'product',
      payload: { productId: product.id, name: product.name },
    }))
    return product
  }

  async update(id: UUID, changes: Parameters<ProductRepository['update']>[1]): Promise<Product> {
    const before = await this.repo.findById(id)
    if (!before) throw new Error(`Product ${id} not found`)
    const product = await this.repo.update(id, changes)

    await getEventBus().publish(createEvent({
      name: PRODUCT_UPDATED,
      shopId: this.shopId,
      deviceId: this.deviceId,
      userId: this.userId,
      entityId: product.id,
      entity: 'product',
      payload: { productId: product.id, changes },
    }))

    // Detect price change as separate event
    if (before.sellingPrice !== product.sellingPrice) {
      await getEventBus().publish(createEvent({
        name: PRICE_CHANGED,
        shopId: this.shopId,
        deviceId: this.deviceId,
        entityId: product.id,
        entity: 'product',
        payload: { productId: product.id, oldPrice: before.sellingPrice, newPrice: product.sellingPrice },
      }))
    }

    return product
  }

  async delete(id: UUID): Promise<void> {
    await this.repo.softDelete(id)
    await getEventBus().publish(createEvent({
      name: PRODUCT_DELETED,
      shopId: this.shopId,
      deviceId: this.deviceId,
      entityId: id,
      entity: 'product',
      payload: { productId: id },
    }))
  }

  async findByBarcode(barcode: string): Promise<Product | null> {
    return this.repo.findByBarcode(barcode)
  }

  async findMany(filter?: Parameters<ProductRepository['findMany']>[0]) {
    return this.repo.findMany(filter)
  }

  async decrementStock(productId: UUID, quantity: number): Promise<void> {
    await this.repo.decrementStock(productId, quantity)
    await this.repo.findById(productId).then(p => {
      if (p && p.lowStockThreshold > 0 && p.currentStock <= p.lowStockThreshold) {
        // Event already emitted via STOCK_ADJUSTED handler in inventory
      }
    })
  }
}
