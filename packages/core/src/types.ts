/**
 * Canonical domain types — single source of truth across all apps.
 * These types are derived from the FIDScript cloud schema and MUST NOT
 * diverge from it.
 */

import type {
  UserId, ShopId, EmployeeId, DeviceId,
  ProductId, CategoryId, CustomerId, SaleId, PlanId, SubscriptionId,
  InvitationId, SyncEventId,
} from './ids.js'

// ── Timestamp / value types ────────────────────────────────────────────────────

/** ISO 8601 timestamp string. All timestamps in Soostori use this format. */
export type ISO8601 = string

/** Money amount in minor units (cents). All monetary fields use this. */
export type Money = number

/** URL-safe string identifier (UUID v4 unless documented otherwise). */
export type UUID = string

// ── Enums ─────────────────────────────────────────────────────────────────────

export type UserType = 'owner' | 'manager' | 'attendant'

export type EmployeeRole = 'owner' | 'manager' | 'cashier' | 'attendant'

export type DeviceType = 'desktop' | 'mobile'

export type SubscriptionStatus = 'active' | 'past_due' | 'expired' | 'cancelled' | 'trialing'

export type BillingCycle = 'monthly' | 'yearly'

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export type SyncOperation = 'create' | 'update' | 'delete'

export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'transfer' | 'debt'

export type DeviceStatus = 'pending' | 'authorized' | 'revoked' | 'offline'

// ── Core entities ────────────────────────────────────────────────────────────

export interface User {
  id: UserId
  email: string
  imageURL?: string | null
  type: UserType
}

export interface Shop {
  id: ShopId
  name: string
  slug: string
  taxRate: number
  plan: string
  /** Derived from active subscription — for fast UI display. */
  subscriptionExpiry: ISO8601 | null
  status: 'active' | 'inactive' | 'suspended'
}

export interface Employee {
  id: EmployeeId
  shopId: ShopId
  name: string
  email?: string | null
  phone?: string | null
  role: EmployeeRole
  /** Optional fine-grained permission flags. */
  permissions?: Record<string, boolean> | null
  /**
   * Links this employee record to the FIDScript $users.id.
   * Required for cloud authentication — this is how we connect an Employee
   * to their Google/email cloud identity.
   * Present in live FIDScript schema (confirmed via /instant-self).
   */
  cloudId: string
  status: 'active' | 'inactive'
  createdBy?: UserId | null
  invitedBy?: UserId | null
}

export interface Device {
  id: DeviceId
  shopId: ShopId
  deviceName: string
  deviceType: DeviceType
  status: 'pending' | 'authorized' | 'revoked' | 'offline'
  isLanHost: boolean
  authorizedAt: ISO8601 | null
  lastSeenAt: ISO8601 | null
  /**
   * True once a local PIN has been enrolled on this device.
   * Written by the backend via consumeEnrollmentToken.
   * PENDING: requires FIDScript schema addition of devices.hasPin.
   */
  hasPin?: boolean
  /**
   * When the PIN was first set on this device.
   * Written by the backend via consumeEnrollmentToken.
   * PENDING: requires FIDScript schema addition of devices.pinSetupAt.
   */
  pinSetupAt?: ISO8601 | null
}

export interface Invitation {
  id: InvitationId
  shopId: ShopId
  email?: string | null
  phone?: string | null
  employeeRole: EmployeeRole
  /** 6-digit join code. */
  code: string
  status: InvitationStatus
  expiresAt: ISO8601
  createdAt: ISO8601
  createdBy?: UserId | null
  usedAt?: ISO8601 | null
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

export interface Plan {
  id: PlanId
  key: string
  name: string
  priceMonthly: Money
  priceYearly: Money
  deviceLimit: number
  features: Record<string, unknown>
}

export interface Subscription {
  id: SubscriptionId
  shopId: ShopId
  planId: PlanId
  /** Denormalized plan key for fast lookups. */
  planKey: string
  status: SubscriptionStatus
  billingCycle: BillingCycle
  amountPaid: Money
  currentPeriodStart: ISO8601
  currentPeriodEnd: ISO8601
  deviceLimit: number
}

export interface SubscriptionEntitlement {
  shopId: ShopId
  status: SubscriptionStatus
  plan: string
  expiresAt: ISO8601
  /** When this entitlement was verified against cloud. */
  verifiedAt: ISO8601
  serverTime: ISO8601
  /** Maximum staleness allowed before re-verification required. */
  nextVerificationDeadline: ISO8601
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthSession {
  userId: UserId
  shopId: ShopId
  employeeId: EmployeeId
  deviceId: DeviceId
  email: string
  /** ISO timestamp when session was created. */
  createdAt: ISO8601
  /** ISO timestamp when session expires. */
  expiresAt: ISO8601
}

// ── Operational entities (also represented locally in SQLite) ─────────────────

export interface Product {
  id: ProductId
  shopId: ShopId
  name: string
  barcode?: string | null
  sku?: string | null
  categoryId?: CategoryId | null
  categoryName?: string | null
  description?: string | null
  costPrice: Money
  sellingPrice: Money
  /** JSON-encoded array of groupprice objects. */
  groupPrices?: string | null
  isGroup: boolean
  unitsPerPackage: number
  stockQuantity: number
  /** Cached from inventory_transactions — fast read for POS. */
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
}

export interface Category {
  id: CategoryId
  shopId: ShopId
  name: string
  color: string
  description?: string | null
  isActive: boolean
  createdAt: ISO8601
  updatedAt: ISO8601
}

export interface Customer {
  id: CustomerId
  shopId: ShopId
  name: string
  phone?: string | null
  email?: string | null
  idNumber?: string | null
  address?: string | null
  notes?: string | null
  isActive: boolean
  createdAt: ISO8601
  updatedAt: ISO8601
}

export interface Sale {
  id: SaleId
  shopId: ShopId
  userId: UserId
  deviceId: DeviceId
  type: 'retail' | 'wholesale'
  status: 'pending' | 'confirmed' | 'rejected'
  subtotal: Money
  discountAmount: Money
  taxAmount: Money
  totalAmount: Money
  paidAmount: Money
  paymentMethod: PaymentMethod
  note?: string | null
  customerId?: CustomerId | null
  customerName?: string | null
  customerPhone?: string | null
  itemsSummary?: string | null
  createdAt: ISO8601
  updatedAt: ISO8601
}

export interface Expense {
  id: string
  shopId: ShopId
  categoryId?: string | null
  categoryName?: string | null
  amount: Money
  description?: string | null
  reference?: string | null
  date: string  // YYYY-MM-DD
  createdAt: ISO8601
  updatedAt: ISO8601
}

// ── Sync ─────────────────────────────────────────────────────────────────────

export interface SyncEvent {
  id: SyncEventId
  shopId: ShopId
  deviceId: DeviceId
  entity: string
  entityId: string
  operation: SyncOperation
  payload: Record<string, unknown>
  /**
   * Monotonic sequence number — present in FIDScript but NOT unique.
   * NOT for idempotency. Replace with idempotencyKey (planned) for deduplication.
   */
  sequenceNumber: number
  /**
   * Cloud-side sync timestamp — set when event is confirmed in FIDScript.
   * Optional in FIDScript schema.
   */
  syncedAt?: ISO8601
  /**
   * PLANNED — UUID v4 per event: prevents duplicate processing on replay/reconnect.
   * Add to FIDScript schema: syncEvents { idempotencyKey: string (unique: true) }
   */
  idempotencyKey?: UUID
}

export interface SyncCursor {
  deviceId: DeviceId
  shopId: ShopId
  lastSeq: number
  lastSyncAt: ISO8601
}

export interface SyncStatus {
  id: string
  shopId: ShopId
  lastSyncAt: ISO8601
  pendingEvents: number
  deviceCount: number
  activeDeviceCount: number
}

export interface BackupSnapshot {
  id: string
  shopId: ShopId
  version: number
  snapshotId: string
  expiresAt?: ISO8601 | null
  recordCounts: Record<string, number>
  sizeBytes: number
}
