/**
 * TumaPaymentProvider — canonical PaymentProvider adapter for Tuma M-Pesa.
 *
 * Wraps TumaClient to satisfy the PaymentProvider interface defined in
 * @soostori/payments. All Tuma credentials stay server-side inside TumaClient.
 *
 * Does NOT duplicate:
 *   - Tuma HTTP client (TumaClient owns this)
 *   - Tuma authentication (TumaClient owns this)
 *   - Tuma callback parsing (parseCallback from ./callback.ts is reused)
 *
 * Does NOT expose secrets to callers.
 */

import type {
  StkPushRequest, StkPushResult,
  CreateSaleRequest, CreateSaleResult,
  CreateInvoiceRequest, CreateInvoiceResult,
  PaymentCallback,
  PaymentReceiptRepository,
} from '@soostori/payments'
import type { PaymentProvider } from '@soostori/payments'

import { TumaClient } from './client.js'
import { parseCallback } from './callback.js'
import { verifyTumaSignature, getSignatureFromHeaders } from './verify.js'

export const TUMA_PAYMENT_PROVIDER_ID = 'tuma' as const
export const TUMA_PAYMENT_PROVIDER_NAME = 'Tuma M-Pesa' as const

/**
 * Error thrown when an operation is not supported by the Tuma provider.
 * Used when the canonical request cannot be mapped to Tuma's API semantics.
 */
export class TumaUnsupportedError extends Error {
  readonly code = 'TUMA_UNSUPPORTED'
  constructor(operation: string, reason: string) {
    super(`TumaPaymentProvider.${operation}: ${reason}`)
    this.name = 'TumaUnsupportedError'
  }
}

/**
 * Error thrown when callback signature verification fails.
 * @deprecated Import from './verify.js' instead.
 */
export class TumaSignatureVerificationError extends Error {
  readonly code = 'TUMA_SIGNATURE_INVALID'
  constructor(reason: string) {
    super(`Tuma callback signature verification failed: ${reason}`)
    this.name = 'TumaSignatureVerificationError'
  }
}

/**
 * Maps canonical PaymentCallback.status to Tuma's callback schema fields.
 *
 * Tuma uses:
 *   - status: 'completed' with result_code: 0  → completed
 *   - status: 'failed' with result_code ≠ 0    → failed
 *   - status field may also indicate 'pending'
 */
function mapTumaStatus(
  raw: { status: string; result_code?: number; failure_reason?: string }
): 'completed' | 'failed' | 'pending' {
  if (raw.status === 'completed' || raw.result_code === 0) return 'completed'
  if (raw.status === 'failed') return 'failed'
  if (raw.status === 'pending') return 'pending'
  // Fallback: treat non-zero result_code as failure
  if (raw.result_code !== undefined && raw.result_code !== 0) return 'failed'
  return 'failed'
}

/**
 * Translate a raw Tuma callback body (JSON string) into the canonical
 * PaymentCallback shape by reusing the existing parseCallback parser.
 */
function translateCallback(rawBody: string): PaymentCallback {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    throw new TumaUnsupportedError(
      'verifyCallback',
      'Callback body is not valid JSON.'
    )
  }

  const cb = parseCallback(parsed)
  if (!cb) {
    throw new TumaUnsupportedError(
      'verifyCallback',
      'Callback payload could not be parsed as STK, sale, or invoice event.'
    )
  }

  // Extract fields that exist across all callback variants
  const merchantRequestId =
    'merchant_request_id' in cb ? String(cb.merchant_request_id) : ''
  const checkoutRequestId =
    'checkout_request_id' in cb ? String(cb.checkout_request_id) : ''
  // amount: Tuma's success schema includes amount, but the failure schema
  // (stkFailureSchema) does not. Try the parsed callback first, then fall back
  // to the raw parsed object for the amount field.
  const amount = 'amount' in cb && typeof cb.amount === 'number' ? cb.amount : 0
  const timestamp =
    'timestamp' in cb && typeof cb.timestamp === 'string'
      ? cb.timestamp
      : new Date().toISOString()
  const mpesaReceiptNumber =
    'mpesa_receipt_number' in cb && cb.mpesa_receipt_number
      ? String(cb.mpesa_receipt_number)
      : undefined

  // Determine failure reason
  let failureReason: string | undefined
  if ('failure_reason' in cb && cb.failure_reason) {
    failureReason = String(cb.failure_reason)
  } else if ('result_desc' in cb && cb.result_desc && mapTumaStatus(cb as { status: string; result_code?: number }) === 'failed') {
    failureReason = String(cb.result_desc)
  }

  // Map status
  const status = mapTumaStatus(cb as { status: string; result_code?: number; failure_reason?: string })

  return {
    providerId: TUMA_PAYMENT_PROVIDER_ID,
    merchantRequestId,
    checkoutRequestId,
    status,
    amount,
    receiptNumber: mpesaReceiptNumber,
    failureReason,
    timestamp,
  }
}

/**
 * TumaPaymentProvider implements the canonical PaymentProvider interface.
 *
 * Requires a TumaClient instance (constructed with server-side credentials).
 * All API calls stay server-side — no secrets reach the caller.
 */
export class TumaPaymentProvider implements PaymentProvider {
  readonly providerId: string = TUMA_PAYMENT_PROVIDER_ID
  readonly providerName: string = TUMA_PAYMENT_PROVIDER_NAME

  private readonly client: TumaClient

  /**
   * Webhook signing secret for HMAC signature verification.
   * When provided, verifyCallback will reject unsigned or mismatched payloads.
   * Set via constructor or leave undefined to skip verification (backward compat).
   */
  private readonly webhookSecret?: string

  /**
   * Optional receipt repository.
   * The provider itself does not persist receipts — the caller decides how
   * and where to store them using the data returned by verifyCallback.
   */
  receiptRepository?: PaymentReceiptRepository

  /**
   * @param client         - TumaClient instance (server-side credentials)
   * @param webhookSecret  - Optional HMAC signing secret (from TUMA_WEBHOOK_SECRET env).
   *                         When provided, verifyCallback will enforce signature verification.
   */
  constructor(client: TumaClient, webhookSecret?: string) {
    this.client = client
    this.webhookSecret = webhookSecret
  }

  /**
   * Initiate M-Pesa STK push.
   *
   * Maps canonical StkPushRequest to TumaClient.stkPush:
   *   reference  → description field (Tuma has no dedicated reference field)
   *   amount     → passed as-is (Money ≡ number)
   *   phone      → passed as-is
   *   callbackUrl → passed as-is
   *   description → passed as-is
   */
  async stkPush(req: StkPushRequest): Promise<StkPushResult> {
    const res = await this.client.stkPush({
      amount: req.amount,        // Money ≡ number
      phone: req.phone,
      callbackUrl: req.callbackUrl,
      // Tuma has a description field. Prefer canonical description; fall back to reference.
      description: req.description ?? req.reference,
    })

    return {
      merchantRequestId: res.data.merchant_request_id,
      checkoutRequestId: res.data.checkout_request_id,
      customerMessage: res.data.customer_message,
    }
  }

  /**
   * Create a sale in Tuma.
   *
   * The canonical CreateSaleRequest carries a sale reference and payment method
   * but does NOT carry line items. Tuma's API requires items to create a sale.
   * This operation is therefore semantically unsupported without items.
   *
   * The canonical SDK flow for STK-push payments is to call stkPush() directly
   * rather than createSale(). Use stkPush() for M-Pesa STK push payments.
   */
  async createSale(req: CreateSaleRequest): Promise<CreateSaleResult> {
    throw new TumaUnsupportedError(
      'createSale',
      'Tuma requires line items (product_id + quantity) to create a sale. ' +
        'The canonical CreateSaleRequest does not carry items. ' +
        'Use stkPush() for M-Pesa STK push payments.'
    )
  }

  /**
   * Generate an invoice with a payment link via Tuma.
   *
   * Maps:
   *   customerName      → customer_name
   *   customerEmail     → customer_email (optional)
   *   customerPhone     → included in items note (optional)
   *   amount           → distributed across line items (required by Tuma)
   *   description      → item_description on the line item
   *   dueDate          → due_date (optional)
   *   callbackUrl      → callback_url
   *
   * Tuma requires at least one item. We emit a single synthetic item
   * representing the full invoice amount with the description as the item name.
   */
  async createInvoice(req: CreateInvoiceRequest): Promise<CreateInvoiceResult> {
    // Tuma requires items; the canonical invoice has a single total amount.
    // Emit a single synthetic item for the full amount.
    const syntheticItem = {
      item_name: req.description || 'Invoice item',
      quantity: 1,
      unit_price: req.amount,
      item_description: req.description,
    }

    const res = await this.client.createInvoice({
      customer_name: req.customerName,
      customer_email: req.customerEmail,
      items: [syntheticItem],
      due_date: req.dueDate,
      callback_url: req.callbackUrl,
    })

    return {
      invoiceId: res.data.invoice.id,
      invoiceNumber: res.data.invoice.invoice_number,
      paymentUrl: res.data.invoice.payment_url,
      accessCode: res.data.invoice.access_code,
      totalAmount: req.amount,
    }
  }

  /**
   * Verify and parse a Tuma webhook callback into the canonical PaymentCallback.
   *
   * When a webhookSecret is configured, this method performs HMAC-SHA256 signature
   * verification before parsing. Callers SHOULD always provide the signature when
   * the secret is configured — unsigned callbacks are rejected.
   *
   * Reuses the existing parseCallback from ./callback.ts — does NOT introduce
   * a duplicate callback parser.
   *
   * @param rawBody   - Raw request body string (exactly as received, before JSON.parse)
   * @param signature - HMAC hex signature from X-Tuma-Signature header (required when secret is set)
   */
  verifyCallback(rawBody: string, signature?: string): PaymentCallback {
    if (this.webhookSecret) {
      verifyTumaSignature(rawBody, signature ?? '', this.webhookSecret)
    }
    return translateCallback(rawBody)
  }
}
