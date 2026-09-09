/**
 * Inventory ledger — single source of truth for stock quantity.
 *
 * The `StockMovementLedger` is the deterministic, replay-safe API.
 * Every operation produces an immutable movement + updates the balance.
 *
 * Replay safety: if a movement with the same idempotencyKey already exists,
 * the operation is a no-op (returns the existing movement).
 */

import type { InventoryRepository } from './repository.js'
import type { StockMovement, StockBalance, StockReservation } from './types.js'
import { InsufficientStockError } from './repository.js'
import type { UUID, ISO8601 } from '@soostori/core'
import { newId } from '@soostori/core'

export class StockMovementLedger {
  constructor(
    private readonly repo: InventoryRepository,
    private readonly shopId: UUID,
    private readonly deviceId: UUID,
  ) {}

  /**
   * Apply a stock movement.
   * Idempotent: same idempotencyKey under same conditions = no-op.
   */
  async apply(args: {
    productId: UUID
    productVariantId?: UUID | null
    type: StockMovement['type']
    quantity: number  // signed delta
    referenceId?: string
    referenceType?: StockMovement['referenceType']
    reason?: string
    actorType: StockMovement['actorType']
    actorId?: UUID
    idempotencyKey?: UUID
  }): Promise<StockMovement> {
    const key = args.idempotencyKey ?? (newId() as UUID)
    if (await this.repo.hasMovementByKey(key)) {
      // Replay: return existing movement
      const existing = (await this.repo.listMovements()).find(m => m.idempotencyKey === key)
      if (existing) return existing
    }

    // Get current balance
    const balance = await this.repo.getBalance(args.productId, args.productVariantId ?? null)
    const currentQty = balance?.quantity ?? 0
    const newQty = currentQty + args.quantity

    if (newQty < 0 && (args.type === 'sold' || args.type === 'adjusted' || args.type === 'transferred')) {
      throw new InsufficientStockError(args.productId, currentQty, Math.abs(args.quantity))
    }

    const lastMovement = await this.repo.getLatestMovement(args.productId, args.productVariantId ?? null)
    const newSequence = (lastMovement?.sequence ?? 0) + 1
    const now = new Date().toISOString()

    const movement: StockMovement = {
      id: newId() as UUID,
      shopId: this.shopId,
      productId: args.productId,
      productVariantId: args.productVariantId ?? null,
      type: args.type,
      quantity: args.quantity,
      balanceAfter: newQty,
      referenceId: args.referenceId ?? null,
      referenceType: args.referenceType ?? null,
      reason: args.reason ?? null,
      actorType: args.actorType,
      actorId: args.actorId ?? null,
      deviceId: this.deviceId,
      timestamp: now,
      sequence: newSequence,
      idempotencyKey: key,
      syncedAt: null,
    }

    await this.repo.appendMovement(movement)
    await this.repo.upsertBalance({
      productId: args.productId,
      shopId: this.shopId,
      productVariantId: args.productVariantId ?? null,
      quantity: newQty,
      reservedQuantity: balance?.reservedQuantity ?? 0,
      lastSequence: newSequence,
      updatedAt: now,
    })

    return movement
  }

  /** Reserve stock for a pending sale. Returns false if insufficient. */
  async reserve(args: {
    saleId: UUID
    productId: UUID
    quantity: number
    ttlSeconds?: number
  }): Promise<{ reserved: boolean; reservationId?: UUID }> {
    const balance = await this.repo.getBalance(args.productId)
    if (!balance) return { reserved: false }
    const activeReservations = await this.repo.getActiveReservations(args.productId)
    const totalReserved = activeReservations.reduce((s, r) => s + r.quantity, 0)
    const available = balance.quantity - totalReserved

    if (available < args.quantity) {
      return { reserved: false }
    }

    const reservationId = newId() as UUID
    const now = new Date().toISOString()
    const ttl = args.ttlSeconds ?? 300  // 5 min default
    const reservation: StockReservation = {
      id: reservationId,
      saleId: args.saleId,
      productId: args.productId,
      quantity: args.quantity,
      status: 'active',
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      createdAt: now,
    }
    await this.repo.createReservation(reservation)

    // Increment reservedQuantity in balance
    await this.repo.upsertBalance({
      ...balance,
      reservedQuantity: totalReserved + args.quantity,
      updatedAt: now,
    })

    return { reserved: true, reservationId }
  }

  /** Commit a reservation — convert it to a real stock movement. */
  async commitReservation(reservationId: UUID, args: { actorType: StockMovement['actorType']; actorId?: UUID }): Promise<StockMovement> {
    const reservation = await this.repo.getReservation(reservationId)
    if (!reservation) throw new Error(`Reservation ${reservationId} not found`)
    await this.repo.updateReservationStatus(reservationId, 'committed')
    return this.apply({
      productId: reservation.productId,
      type: 'sold',
      quantity: -reservation.quantity,
      referenceId: reservation.saleId,
      referenceType: 'sale',
      actorType: args.actorType,
      actorId: args.actorId,
      reason: 'sale_committed',
    })
  }

  /** Release a reservation (sale cancelled). */
  async releaseReservation(reservationId: UUID): Promise<void> {
    const reservation = await this.repo.getReservation(reservationId)
    if (!reservation) return
    await this.repo.updateReservationStatus(reservationId, 'released')
    const balance = await this.repo.getBalance(reservation.productId)
    if (balance) {
      await this.repo.upsertBalance({
        ...balance,
        reservedQuantity: Math.max(0, balance.reservedQuantity - reservation.quantity),
        updatedAt: new Date().toISOString(),
      })
    }
  }

  /** Get current quantity for a product. */
  async getQuantity(productId: UUID): Promise<number> {
    const balance = await this.repo.getBalance(productId)
    return balance?.quantity ?? 0
  }

  /** Get the ledger history for a product. */
  async getHistory(productId: UUID, pagination?: import('./repository.js').PaginationOptions): Promise<StockMovement[]> {
    return this.repo.listMovements({ productId }, pagination)
  }
}
