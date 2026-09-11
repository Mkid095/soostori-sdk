/**
 * PaymentReceipt — canonical receipt record for any payment provider.
 *
 * Provider-agnostic. Used by all three apps (Web, Desktop, Mobile) for
 * storage and sync. Complements the Tuma STK push callback parser.
 */

import type { BusinessId, ISO8601, Money } from '@soostori/core'

// ── Core types ────────────────────────────────────────────────────────────────

export type PaymentReceiptId = string & { readonly __brand: 'PaymentReceiptId' }
export type PaymentProviderType = 'tuma' | 'payhero' | 'pesapal' | 'other'
export type PaymentReceiptStatus = 'pending' | 'completed' | 'failed' | 'cancelled'
export type Currency = string  // ISO 4217 code e.g. 'KES'

export interface PaymentReceipt {
  readonly id: PaymentReceiptId
  readonly shopId: BusinessId
  /** Payment gateway or provider. */
  readonly provider: PaymentProviderType
  /** Provider's own transaction reference (e.g. M-Pesa receipt number). */
  readonly providerReference: string
  /** STK push checkout request ID (Tuma). */
  readonly checkoutRequestId: string
  readonly status: PaymentReceiptStatus
  readonly amount: Money
  readonly currency: Currency
  /** Customer phone number used for the payment (if available). */
  readonly customerPhone: string | null
  /** Why a payment failed (if applicable). */
  readonly failureReason: string | null
  /** When payment was confirmed (null if pending/failed). */
  readonly paidAt: ISO8601 | null
  readonly createdAt: ISO8601
}

// ── Repository contract ───────────────────────────────────────────────────────

export interface PaymentReceiptRepository {
  /**
   * Persist a receipt. Idempotent — re-saving a receipt with the same id
   * updates the existing record.
   */
  save(receipt: PaymentReceipt): Promise<void>

  /**
   * Find a receipt by its checkout request ID (Tuma STK push correlation).
   */
  findByCheckoutRequestId(id: string): Promise<PaymentReceipt | null>

  /**
   * Find a receipt by the provider's own reference (e.g. M-Pesa receipt number).
   */
  findByProviderReference(ref: string): Promise<PaymentReceipt | null>

  /**
   * List all receipts for a shop within a billing period.
   */
  listByShop(shopId: BusinessId, period: { from: ISO8601; to: ISO8601 }): Promise<PaymentReceipt[]>
}
