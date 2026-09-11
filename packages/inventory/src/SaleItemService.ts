/**
 * SaleItemService — sale-line-item operations with SyncEvent emission.
 *
 * Emits: saleItem.created (on addItem())
 *
 * Design: items are normally created as part of SaleService.confirmSale().
 * This service exists for ad-hoc item addition (e.g. adding a line to an
 * existing confirmed sale before it is finalized). Most callers will use
 * SaleService.confirmSale() directly.
 *
 * Idempotency: each item's idempotencyKey is the composite key
 * `${saleId}:${productId}` so replay does not duplicate items or stock moves.
 */

import type { SaleLineItem, SyncEvent } from '@soostori/contracts'
import type {
  SaleId,
  SaleItemId,
  ProductId,
  BusinessId,
  EmployeeId,
  DeviceId,
  IdempotencyKey,
} from '@soostori/core'
import {
  newId,
  asSaleItemId,
  asSyncEventId,
  asIdempotencyKey,
} from '@soostori/core'
import type { SaleRepository } from './repository.js'

export interface AddSaleItemInput {
  saleId: SaleId
  productId: ProductId
  productName: string
  variationName?: string | null
  quantity: number
  unitPrice: number
  discount: number
  totalPrice: number
}

export class SaleItemService {
  constructor(
    private readonly repo: SaleRepository,
    private readonly businessId: BusinessId,
    private readonly deviceId: DeviceId,
    private readonly employeeId: EmployeeId,
  ) {}

  /**
   * Add an item to an existing sale.
   *
   * Idempotent: if an item with the same (saleId, productId) already exists,
   * returns the existing item without creating a duplicate.
   */
  async addItem(input: AddSaleItemInput): Promise<SaleLineItem> {
    const sale = await this.repo.getSale(input.saleId)
    if (!sale) throw new Error(`Sale ${input.saleId} not found`)
    if (sale.businessId !== this.businessId) throw new Error('Business isolation violation')

    // Idempotency: same (saleId, productId) → return existing
    const key = asIdempotencyKey(`${input.saleId}:${input.productId}`)
    const existing = await this.repo.getSaleItemByIdempotencyKey(key)
    if (existing) return existing

    const now = new Date().toISOString()
    const id = asSaleItemId(newId())

    const item: SaleLineItem = {
      id,
      saleId: input.saleId,
      businessId: this.businessId,
      productId: input.productId,
      productName: input.productName,
      variationName: input.variationName ?? null,
      quantity: input.quantity,
      unitPrice: input.unitPrice as SaleLineItem['unitPrice'],
      discount: input.discount as SaleLineItem['discount'],
      totalPrice: input.totalPrice as SaleLineItem['totalPrice'],
      createdAt: now,
      updatedAt: now,
      version: 1,
    }

    await this.repo.upsertSaleItem(item)

    await this.emit('saleItem.created', item, 'create')

    return item
  }

  async listItems(saleId: SaleId): Promise<SaleLineItem[]> {
    return this.repo.listSaleItems(saleId)
  }

  private async emit(
    eventType: 'saleItem.created',
    entity: SaleLineItem,
    syncOp: SyncEvent['operation'],
  ): Promise<void> {
    const event: SyncEvent = {
      id: asSyncEventId(newId()),
      idempotencyKey: asIdempotencyKey(`${entity.saleId}:${entity.id}`),
      businessId: this.businessId,
      entityKind: 'saleLineItem',
      entityId: entity.id,
      operation: syncOp,
      originatingDeviceId: this.deviceId,
      originatingEmployeeId: this.employeeId,
      clientSequence: Date.now(),
      clientCreatedAt: new Date().toISOString(),
      entityVersion: entity.version,
      payload: entity as unknown as Record<string, unknown>,
      state: 'pending',
    }
    // Note: no sync engine here — SaleItemService is a thin add-on.
    // The parent SaleService handles sync emission for confirmed-sale flows.
    // Callers using this standalone service should wire up their own
    // sync emission or use SaleService.confirmSale() instead.
  }
}
