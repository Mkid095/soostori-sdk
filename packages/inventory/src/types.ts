/**
 * Inventory types — stock movement ledger + cached balance.
 *
 * Design:
 *   - StockMovement is the IMMUTABLE ledger record (append-only).
 *   - StockBalance is a DERIVED cache of current stock for fast reads.
 *   - Every stock-affecting operation must produce a StockMovement.
 *   - The balance is recomputable by summing movements.
 *
 * Why a ledger rather than updating a column?
 *   - Audit: every change has a reason and an actor.
 *   - Sync: replay-deterministic — the same movements produce the same balance.
 *   - Debugging: "why is stock 5?" can be answered from the ledger.
 *   - Multi-device: each device's contribution is explicit.
 */

import type { ISO8601, UUID } from '@soostori/core'

/** Type of stock movement — what caused the quantity change. */
export type StockMovementType =
  | 'received'      // stock received from supplier
  | 'sold'          // deducted on a sale
  | 'refunded'      // returned on a refund
  | 'returned'      // customer return
  | 'adjusted'      // manual adjustment (count, damage, theft, correction)
  | 'transferred'   // moved between locations/bins
  | 'reserved'      // locked for pending sale (doesn't reduce available yet)
  | 'released'      // reservation expired/cancelled

/** Single immutable ledger entry. */
export interface StockMovement {
  id: UUID
  shopId: UUID
  productId: UUID
  /** Variant ID if this is a variant movement (optional). */
  productVariantId: UUID | null
  type: StockMovementType
  /** Signed quantity change — positive = increase, negative = decrease. */
  quantity: number
  /** Stock balance AFTER this movement — for fast cursor traversal. */
  balanceAfter: number
  /** Optional reference (e.g., saleId, purchaseOrderId, transferId). */
  referenceId: string | null
  /** Optional reference type discriminator. */
  referenceType?: 'sale' | 'purchase_order' | 'transfer' | 'adjustment' | null
  /** Why this movement was made. */
  reason: string | null
  /** Who/what performed this movement. */
  actorType: 'user' | 'employee' | 'system' | 'supplier_api'
  actorId: UUID | null
  /** Which device produced this movement (for sync). */
  deviceId: UUID
  timestamp: ISO8601
  /** Sequence number — monotonic per product for ordering. */
  sequence: number
  /** Idempotency key for safe replay. */
  idempotencyKey: UUID
  /** Sync metadata — has this been pushed to cloud/LAN yet. */
  syncedAt: ISO8601 | null
}

/** Cached current balance per product — derived from movements. */
export interface StockBalance {
  productId: UUID
  shopId: UUID
  productVariantId: UUID | null
  /** Current quantity — equals last movement's `balanceAfter`. */
  quantity: number
  /** Quantity reserved (locked for pending sales). */
  reservedQuantity: number
  /** Last movement sequence number for fast cursor. */
  lastSequence: number
  updatedAt: ISO8601
}

/** Stock reservation — locks stock for pending sale without committing. */
export interface StockReservation {
  id: UUID
  saleId: UUID
  productId: UUID
  quantity: number
  status: 'active' | 'committed' | 'released' | 'expired'
  /** When this reservation expires if not committed. */
  expiresAt: ISO8601
  createdAt: ISO8601
}

/** Ledger summary — what was sold, what was received, etc. */
export interface StockSummary {
  productId: UUID
  productName: string
  shopId: UUID
  currentQuantity: number
  totalReceived: number
  totalSold: number
  totalAdjusted: number
  totalTransferred: number
  lastMovementAt: ISO8601 | null
}
