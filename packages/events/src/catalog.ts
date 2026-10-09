/**
 * Canonical Soostori event catalog.
 *
 * Single source of truth for every event name in the system. Every sync,
 * notification, audit, and analytics consumer subscribes to this catalog.
 *
 * Categories:
 *   - sale.*     — sales lifecycle
 *   - stock.*    — inventory mutations
 *   - product.*  — catalog mutations
 *   - customer.* — customer mutations
 *   - debt.*     — credit account events
 *   - device.*   — device identity & lifecycle
 *   - sync.*     — synchronization events
 *   - subscription.* — billing lifecycle
 *   - auth.*     — authentication events
 *   - audit.*    — security audit
 *   - system.*   — platform-level events
 */

export const EVENT_CATEGORIES = [
  'sale', 'stock', 'product', 'category', 'customer', 'debt', 'supplier',
  'device', 'sync', 'subscription', 'auth', 'audit', 'system',
] as const
export type EventCategory = typeof EVENT_CATEGORIES[number]

// ── Sale events (SALE_PENDING + SALE_CONFIRMED/REJECTED) ────────────────────

export const SALE_PENDING = 'sale.pending'
export const SALE_CONFIRMED = 'sale.confirmed'
export const SALE_REJECTED = 'sale.rejected'
export const SALE_REFUNDED = 'sale.refunded'
export const SALE_COMPLETED = 'sale.completed'

// ── Stock events ────────────────────────────────────────────────────────────

export const STOCK_RECEIVED = 'stock.received'
export const STOCK_ADJUSTED = 'stock.adjusted'
export const STOCK_TRANSFERRED = 'stock.transferred'
export const STOCK_RESERVED = 'stock.reserved'  // when primary device approves a sale
export const STOCK_RELEASED = 'stock.released'  // when sale is cancelled
export const LOW_STOCK_DETECTED = 'stock.low'

// ── Product/catalog events ───────────────────────────────────────────────────

export const PRODUCT_CREATED = 'product.created'
export const PRODUCT_UPDATED = 'product.updated'
export const PRODUCT_DELETED = 'product.deleted'
export const CATEGORY_CREATED = 'category.created'
export const CATEGORY_UPDATED = 'category.updated'
export const PRICE_CHANGED = 'product.price_changed'

// ── Customer events ──────────────────────────────────────────────────────────

export const CUSTOMER_CREATED = 'customer.created'
export const CUSTOMER_UPDATED = 'customer.updated'
export const CUSTOMER_FLAGGED = 'customer.flagged'  // cross-shop risk warning

// ── Debt events ─────────────────────────────────────────────────────────────

export const DEBT_CREATED = 'debt.created'
export const DEBT_PAYMENT_RECORDED = 'debt.payment_recorded'
export const DEBT_PAYMENT_REMINDER = 'debt.payment_reminder'
export const DEBT_WRITTEN_OFF = 'debt.written_off'

// ── Supplier events ──────────────────────────────────────────────────────────

export const SUPPLIER_CREATED = 'supplier.created'
export const SUPPLIER_UPDATED = 'supplier.updated'

// ── Device events ────────────────────────────────────────────────────────────

export const DEVICE_REGISTERED = 'device.registered'
export const DEVICE_ONLINE = 'device.online'
export const DEVICE_OFFLINE = 'device.offline'
export const DEVICE_REVOKED = 'device.revoked'
export const DEVICE_ENROLLED = 'device.enrolled'
export const DEVICE_APPROVED = 'device.approved'
export const DEVICE_PRIMARY_TRANSFERRED = 'device.primary_transferred'
/** @deprecated Use DEVICE_LAN_HOST_CHANGED — renamed for lan_host terminology */
export const DEVICE_LAN_HOST_CHANGED = 'device.lan_host_changed'
export const HOST_TRANSFER = 'device.host_transfer'
export const PRIMARY_DEVICE_ELECTED = 'device.primary_elected'
export const PRIMARY_DEVICE_LOST = 'device.primary_lost'
export const HEARTBEAT_ACK = 'device.heartbeat_ack'

// ── Sync events ─────────────────────────────────────────────────────────────

export const SYNC_PUSHED = 'sync.pushed'
export const SYNC_PULLED = 'sync.pulled'
export const SYNC_CONFLICT = 'sync.conflict'
export const SYNC_SNAPSHOT_DOWNLOADED = 'sync.snapshot_downloaded'

// ── Subscription events ──────────────────────────────────────────────────────

export const SUBSCRIPTION_PAYMENT_CONFIRMED = 'subscription.payment_confirmed'
export const SUBSCRIPTION_TRIAL_STARTED = 'subscription.trial_started'
export const SUBSCRIPTION_EXPIRED = 'subscription.expired'
export const SUBSCRIPTION_EXPIRING_SOON = 'subscription.expiring_soon'
export const SUBSCRIPTION_RENEWED = 'subscription.renewed'
export const SUBSCRIPTION_CANCELLED = 'subscription.cancelled'
export const CONVERSION_RECORDED = 'subscription.conversion_recorded'
export const COMMISSION_GENERATED = 'subscription.commission_generated'

// ── Auth events ─────────────────────────────────────────────────────────────

export const AUTH_LOGIN = 'auth.login'
export const AUTH_LOGOUT = 'auth.logout'
export const AUTH_FAILED = 'auth.failed'
export const INVITATION_CREATED = 'auth.invitation_created'
export const INVITATION_ACCEPTED = 'auth.invitation_accepted'
export const MEMBERSHIP_INVITED = 'membership.invited'
export const MEMBERSHIP_REVOKED = 'membership.revoked'

// ── Audit events ────────────────────────────────────────────────────────────

export const AUDIT_USER_ACTION = 'audit.user_action'
export const AUDIT_PERMISSION_DENIED = 'audit.permission_denied'
export const AUDIT_DATA_EXPORTED = 'audit.data_exported'
export const AUDIT_DATA_DELETED = 'audit.data_deleted'

// ── System events ───────────────────────────────────────────────────────────

export const SYSTEM_BACKUP_COMPLETED = 'system.backup_completed'
export const SYSTEM_ERROR = 'system.error'

// ── Business events ────────────────────────────────────────────────────────

export const BUSINESS_CREATED = 'business.created'
export const BUSINESS_UPDATED = 'business.updated'

// ── Employee / membership events ──────────────────────────────────────────────

export const EMPLOYEE_INVITED    = 'employee.invited'
export const EMPLOYEE_ACCEPTED  = 'employee.accepted'
export const EMPLOYEE_ROLE_CHANGED = 'employee.role_changed'
export const EMPLOYEE_REVOKED   = 'employee.revoked'

// ── Team events ───────────────────────────────────────────────────────────────

export const TEAM_INVITATION_CREATED    = 'team.invitation.created'
export const TEAM_INVITATION_ACCEPTED  = 'team.invitation.accepted'
export const TEAM_INVITATION_EXPIRED   = 'team.invitation.expired'
export const TEAM_INVITATION_REVOKED   = 'team.invitation.revoked'
export const TEAM_MEMBER_REMOVED        = 'team.member.removed'
export const TEAM_MEMBER_ROLE_CHANGED   = 'team.member.role_changed'
export const TEAM_MEMBER_PERMISSION_CHANGED = 'team.member.permission_changed'

// ── Commission lifecycle events ───────────────────────────────────────────────

/**
 * Commission status uses a closed vocabulary:
 *   accrued   — earning recorded, awaiting payout window
 *   payable   — payout window opened, recipient can receive payment
 *   paid      — funds disbursed
 *   reversed  — earning cancelled (dispute, refund, etc.)
 */
export const COMMISSION_ACCRUED   = 'commission.accrued'
export const COMMISSION_PAYABLE  = 'commission.payable'
export const COMMISSION_PAID     = 'commission.paid'
export const COMMISSION_REVERSED = 'commission.reversed'

// ── Partner events (Phase 18) ───────────────────────────────────────────────

export const PARTNER_APPLICATION_SUBMITTED = 'partner.application_submitted'
export const PARTNER_APPROVED              = 'partner.approved'
export const PARTNER_REJECTED              = 'partner.rejected'
export const PARTNER_ENROLLED              = 'partner.enrolled'
export const CONVERSION_QUALIFIED          = 'conversion.qualified'
export const COMMISSION_CREATED            = 'commission.created'

// ── Withdrawal lifecycle events ───────────────────────────────────────────────

export const WITHDRAWAL_REQUESTED   = 'withdrawal.requested'
export const WITHDRAWAL_APPROVED   = 'withdrawal.approved'
export const WITHDRAWAL_REJECTED   = 'withdrawal.rejected'
export const WITHDRAWAL_PROCESSING = 'withdrawal.processing'
export const WITHDRAWAL_PAID      = 'withdrawal.paid'
export const WITHDRAWAL_CANCELLED  = 'withdrawal.cancelled'

// ── Salesperson lifecycle events ──────────────────────────────────────────────

export const SALESPERSON_TRAINING_COMPLETED = 'salesperson.training_completed'
export const SALESPERSON_MEETING_SCHEDULED  = 'salesperson.meeting_scheduled'
export const SALESPERSON_MEETING_COMPLETED  = 'salesperson.meeting_completed'

// ── Aggregated event names ──────────────────────────────────────────────────

export const ALL_EVENTS = [
  // Sale
  SALE_PENDING, SALE_CONFIRMED, SALE_REJECTED, SALE_REFUNDED, SALE_COMPLETED,
  // Stock
  STOCK_RECEIVED, STOCK_ADJUSTED, STOCK_TRANSFERRED, STOCK_RESERVED, STOCK_RELEASED, LOW_STOCK_DETECTED,
  // Product/catalog
  PRODUCT_CREATED, PRODUCT_UPDATED, PRODUCT_DELETED, CATEGORY_CREATED, CATEGORY_UPDATED, PRICE_CHANGED,
  // Customer
  CUSTOMER_CREATED, CUSTOMER_UPDATED, CUSTOMER_FLAGGED,
  // Debt
  DEBT_CREATED, DEBT_PAYMENT_RECORDED, DEBT_PAYMENT_REMINDER, DEBT_WRITTEN_OFF,
  // Supplier
  SUPPLIER_CREATED, SUPPLIER_UPDATED,
  // Device
  DEVICE_REGISTERED, DEVICE_ONLINE, DEVICE_OFFLINE, DEVICE_REVOKED,
  DEVICE_ENROLLED, DEVICE_APPROVED, DEVICE_PRIMARY_TRANSFERRED,
  DEVICE_LAN_HOST_CHANGED,
  HOST_TRANSFER,
  PRIMARY_DEVICE_ELECTED, PRIMARY_DEVICE_LOST, HEARTBEAT_ACK,
  // Sync
  SYNC_PUSHED, SYNC_PULLED, SYNC_CONFLICT, SYNC_SNAPSHOT_DOWNLOADED,
  // Subscription
  SUBSCRIPTION_PAYMENT_CONFIRMED, SUBSCRIPTION_TRIAL_STARTED, SUBSCRIPTION_EXPIRED,
  SUBSCRIPTION_EXPIRING_SOON, SUBSCRIPTION_RENEWED, SUBSCRIPTION_CANCELLED,
  CONVERSION_RECORDED, COMMISSION_GENERATED,
  // Auth
  AUTH_LOGIN, AUTH_LOGOUT, AUTH_FAILED, INVITATION_CREATED, INVITATION_ACCEPTED,
  MEMBERSHIP_INVITED, MEMBERSHIP_REVOKED,
  // Audit
  AUDIT_USER_ACTION, AUDIT_PERMISSION_DENIED, AUDIT_DATA_EXPORTED, AUDIT_DATA_DELETED,
  // System
  SYSTEM_BACKUP_COMPLETED, SYSTEM_ERROR,
  // Business
  BUSINESS_CREATED, BUSINESS_UPDATED,
  // Employee
  EMPLOYEE_INVITED, EMPLOYEE_ACCEPTED, EMPLOYEE_ROLE_CHANGED, EMPLOYEE_REVOKED,
  // Team
  TEAM_INVITATION_CREATED, TEAM_INVITATION_ACCEPTED, TEAM_INVITATION_EXPIRED,
  TEAM_INVITATION_REVOKED, TEAM_MEMBER_REMOVED, TEAM_MEMBER_ROLE_CHANGED,
  TEAM_MEMBER_PERMISSION_CHANGED,
  // Partner
  PARTNER_APPLICATION_SUBMITTED, PARTNER_APPROVED, PARTNER_REJECTED,
  PARTNER_ENROLLED, CONVERSION_QUALIFIED, COMMISSION_CREATED,
  // Commission lifecycle
  COMMISSION_ACCRUED, COMMISSION_PAYABLE, COMMISSION_PAID, COMMISSION_REVERSED,
  // Withdrawal
  WITHDRAWAL_REQUESTED, WITHDRAWAL_APPROVED, WITHDRAWAL_REJECTED,
  WITHDRAWAL_PROCESSING, WITHDRAWAL_PAID, WITHDRAWAL_CANCELLED,
  // Salesperson
  SALESPERSON_TRAINING_COMPLETED, SALESPERSON_MEETING_SCHEDULED,
  SALESPERSON_MEETING_COMPLETED,
] as const

export type SoostoriEventName = typeof ALL_EVENTS[number]

export function isSoostoriEvent(name: string): name is SoostoriEventName {
  return (ALL_EVENTS as readonly string[]).includes(name)
}

export function eventCategory(name: SoostoriEventName): EventCategory {
  return name.split('.')[0] as EventCategory
}
