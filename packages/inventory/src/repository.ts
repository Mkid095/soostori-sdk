/**
 * Inventory repository contract — append-only ledger + cached balances.
 */

import type { StockMovement, StockBalance, StockReservation, StockSummary } from './types'
import type { UUID, ISO8601 } from '@soostori/core'

/** Pagination options — defined locally since core has no equivalent. */
export interface PaginationOptions {
  limit?: number
  offset?: number
}

export interface MovementFilter {
  productId?: UUID
  type?: StockMovement['type']
  startDate?: ISO8601
  endDate?: ISO8601
  actorId?: UUID
}

export interface InventoryRepository {
  // Ledger (append-only)
  getMovement(id: UUID): Promise<StockMovement | null>
  listMovements(filter?: MovementFilter, pagination?: PaginationOptions): Promise<StockMovement[]>
  /** Append a movement — MUST be atomic with balance update. */
  appendMovement(movement: StockMovement): Promise<void>
  /** Check if a movement with this idempotencyKey exists (for replay safety). */
  hasMovementByKey(idempotencyKey: UUID): Promise<boolean>
  /** Get the latest movement for a product (for cursor). */
  getLatestMovement(productId: UUID, productVariantId?: UUID | null): Promise<StockMovement | null>
  /** Compute aggregate summary. */
  getStockSummary(shopId: UUID, productId: UUID): Promise<StockSummary | null>

  // Cached balances
  getBalance(productId: UUID, productVariantId?: UUID | null): Promise<StockBalance | null>
  upsertBalance(balance: StockBalance): Promise<void>

  // Reservations
  createReservation(reservation: StockReservation): Promise<void>
  getReservation(id: UUID): Promise<StockReservation | null>
  getReservationsBySale(saleId: UUID): Promise<StockReservation[]>
  updateReservationStatus(id: UUID, status: StockReservation['status']): Promise<void>
  getActiveReservations(productId: UUID): Promise<StockReservation[]>
}

export class InsufficientStockError extends Error {
  constructor(productId: UUID, available: number, requested: number) {
    super(`Insufficient stock for ${productId}: ${available} available, ${requested} requested`)
    this.name = 'InsufficientStockError'
  }
}
