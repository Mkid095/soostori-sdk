/**
 * Payments abstraction — canonical contract across providers.
 *
 * @soostori/tuma is one implementation. Other providers (Stripe, PesaPal, etc.)
 * can be added as additional implementations.
 */

import type { ISO8601, UUID, Money } from '@soostori/core'

/** Payment method on a transaction. */
export type PaymentMethod = 'stk_push' | 'cash' | 'card' | 'bank_transfer' | 'invoice_link'

/** Provider-agnostic STK Push request. */
export interface StkPushRequest {
  amount: Money
  phone: string           // E.164 or local format (provider-specific)
  reference: string       // Human-readable reference
  description?: string
  /** URL to receive async callback when customer confirms/cancels. */
  callbackUrl: string
}

export interface StkPushResult {
  /** Provider's request ID — used for status polling. */
  merchantRequestId: string
  checkoutRequestId: string
  /** Human-readable status (e.g., "Request accepted for processing"). */
  customerMessage: string
}

/** Provider-agnostic payment callback. */
export interface PaymentCallback {
  providerId: string
  merchantRequestId: string
  checkoutRequestId: string
  /** 'completed' | 'failed' | 'pending' */
  status: 'completed' | 'failed' | 'pending'
  amount: Money
  /** Provider's transaction reference (e.g., M-Pesa receipt number). */
  receiptNumber?: string
  failureReason?: string
  timestamp: ISO8601
}

/** Sales/payment integration request. */
export interface CreateSaleRequest {
  reference: string  // External order ID
  amount: Money
  customerPhone?: string
  customerName?: string
  paymentMethod: PaymentMethod
  callbackUrl: string
}

export interface CreateSaleResult {
  /** Provider's sale ID. */
  saleId: string
  merchantRequestId: string
  checkoutRequestId: string
  totalAmount: Money
}

/** Provider-agnostic invoice link. */
export interface CreateInvoiceRequest {
  customerName: string
  customerEmail?: string
  customerPhone?: string
  amount: Money
  description: string
  /** When the invoice is due (ISO 8601 date string). */
  dueDate: ISO8601
  callbackUrl: string
}

export interface CreateInvoiceResult {
  invoiceId: string
  invoiceNumber: string
  /** URL the customer can visit to pay. */
  paymentUrl: string
  accessCode: string
  totalAmount: Money
}
