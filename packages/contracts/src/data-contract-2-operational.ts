/**
 * Canonical entity contract — Part 2: Device / Invitation / Product / Category / StockMovement.
 *
 * §10–§11, §26, §43–§44 of the Soostori vision.
 */

import type {
  BusinessId, DeviceId, EmployeeId, InvitationId, ProductId, CategoryId,
  StockMovementId, UserId, IdempotencyKey,
  ISO8601, Money,
} from '@soostori/core'

// ── Device (§43–§44) ───────────────────────────────────────────────────────────
/**
 * Device — operational device belonging to a Business.
 *
 * Authorization lifecycle:
 *   pending → authorized → revoked | offline
 * Has PIN lifecycle: notEnrolled ↔ enrolled (controlled by hasPin / pinSetupAt).
 */
export interface Device {
  id: DeviceId
  businessId: BusinessId
  deviceName: string
  deviceType: 'desktop' | 'mobile'
  status: 'pending' | 'authorized' | 'revoked' | 'offline'
  /** Desktop-only: true if this device hosts the LAN and is stock-authoritative. */
  isLanHost?: boolean
  /** Cloud flag: device has a local PIN enrolled. */
  hasPin?: boolean
  /** ISO8601: when the PIN was first set on this device. */
  pinSetupAt?: ISO8601 | null
  authorizedAt: ISO8601 | null
  lastSeenAt: ISO8601 | null
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── Invitation (§26) ───────────────────────────────────────────────────────────
/**
 * Invitation — employee onboarding flow.
 *
 * Lifecycle: pending → accepted | expired | revoked.
 * Single-use: `usedAt` set on first successful join.
 */
export interface Invitation {
  id: InvitationId
  businessId: BusinessId
  email?: string | null
  phone?: string | null
  employeeRole: 'owner' | 'manager' | 'cashier' | 'attendant'
  /** 6-digit join code — unique per business. */
  code: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expiresAt: ISO8601
  createdAt: ISO8601
  createdBy?: UserId | null
  usedAt?: ISO8601 | null
  version: number
}

// ── Product (§10) ──────────────────────────────────────────────────────────────
/**
 * Product — sellable item.
 *
 * Stock authority: `currentStock` is updated via StockMovement events.
 * Primary Device (§12) is the canonical writer for inventory changes.
 */
export interface Product {
  id: ProductId
  businessId: BusinessId
  name: string
  barcode?: string | null
  sku?: string | null
  categoryId?: CategoryId | null
  description?: string | null
  costPrice: Money
  sellingPrice: Money
  /** Optional bulk/group price tier. */
  groupPrices?: unknown | null
  isGroup: boolean
  unitsPerPackage: number
  /** Cached fast-read stock (denormalized from StockMovement). */
  stockQuantity: number
  currentStock: number
  lowStockThreshold: number
  trackInventory: boolean
  allowSingleUnitSale: boolean
  distributorName?: string | null
  distributorPhone?: string | null
  image?: string | null
  isActive: boolean
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── Category (§10) ─────────────────────────────────────────────────────────────
/**
 * Category — Product grouping. Soft-deletable via `isActive`.
 */
export interface Category {
  id: CategoryId
  businessId: BusinessId
  name: string
  color: string
  description?: string | null
  isActive: boolean
  createdAt: ISO8601
  updatedAt: ISO8601
  version: number
}

// ── StockMovement (§11) — append-only ledger ──────────────────────────────────
/**
 * StockMovement — append-only inventory ledger row.
 * Never updated or hard-deleted; corrections are new rows.
 *
 * Authority: Primary Device (per §12) applies stock movements on a per-business basis.
 *
 * Sync identity: `idempotencyKey` MUST be unique per (deviceId, productId, operation)
 * so re-apply is a no-op (§6 of brief).
 */
export type StockMovementOperation =
  | 'openingStock' | 'purchase' | 'sale' | 'return' | 'adjustment' | 'damage' | 'transfer' | 'correction'

export interface StockMovement {
  id: StockMovementId
  businessId: BusinessId
  productId: ProductId
  /** Authoritative quantity delta; positive = inflow, negative = outflow. */
  quantity: number
  operation: StockMovementOperation
  deviceId: DeviceId
  userId: UserId
  /** Per (deviceId, productId, operation) — see §6 idempotency. */
  idempotencyKey: IdempotencyKey
  /** When the movement physically occurred (client clock). */
  timestamp: ISO8601
  notes?: string | null
  createdAt: ISO8601
  /** Entity version — increments on creation only (append-only). */
  version: number
}
