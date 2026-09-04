/**
 * Tuma callback parsing — webhook payloads received on the callback URL.
 */

import { z } from 'zod'

// ── STK Push callback ────────────────────────────────────────────────────────
// Note: Tuma webhook payloads don't always include result_code (especially in
// newer API versions or partial responses), so we use z.union instead of
// discriminatedUnion to avoid runtime validation failures.

const stkSuccessSchema = z.object({
  status: z.literal('completed'),
  merchant_request_id: z.string(),
  checkout_request_id: z.string(),
  result_code: z.literal(0).optional(),
  result_desc: z.string(),
  timestamp: z.string(),
  mpesa_receipt_number: z.string(),
  amount: z.number(),
})

const stkFailureSchema = z.object({
  status: z.literal('failed'),
  merchant_request_id: z.string(),
  checkout_request_id: z.string(),
  result_code: z.number(),
  result_desc: z.string(),
  timestamp: z.string(),
  failure_reason: z.string(),
})

export const stkCallbackSchema = z.union([stkSuccessSchema, stkFailureSchema])
export type StkCallback = z.infer<typeof stkCallbackSchema>

// ── Sales callback ────────────────────────────────────────────────────────────

export const salesCallbackSchema = z.object({
  type: z.literal('sale'),
  status: z.enum(['completed', 'failed', 'pending']),
  sale_id: z.string(),
  merchant_request_id: z.string(),
  checkout_request_id: z.string(),
  mpesa_receipt_number: z.string().optional(),
  amount: z.number(),
  timestamp: z.string(),
})
export type SalesCallback = z.infer<typeof salesCallbackSchema>

// ── Invoice callback ──────────────────────────────────────────────────────────

export const invoiceCallbackSchema = z.object({
  type: z.literal('invoice'),
  status: z.enum(['completed', 'failed', 'pending']),
  invoice_id: z.string(),
  merchant_request_id: z.string(),
  checkout_request_id: z.string(),
  mpesa_receipt_number: z.string().optional(),
  amount: z.number(),
  timestamp: z.string(),
})
export type InvoiceCallback = z.infer<typeof invoiceCallbackSchema>

/** Parse a webhook callback (auto-detect type by inspecting fields). */
export function parseCallback(body: unknown): StkCallback | SalesCallback | InvoiceCallback | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if ('invoice_id' in b) {
    const r = invoiceCallbackSchema.safeParse(b)
    return r.success ? r.data : null
  }
  if ('sale_id' in b) {
    const r = salesCallbackSchema.safeParse(b)
    return r.success ? r.data : null
  }
  if ('result_code' in b || 'mpesa_receipt_number' in b) {
    const r = stkCallbackSchema.safeParse(b)
    return r.success ? r.data : null
  }
  return null
}
