/**
 * TumaPaymentProvider tests.
 *
 * Run: pnpm vitest run packages/tuma/test/provider.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  StkPushRequest, StkPushResult,
  CreateInvoiceRequest, CreateInvoiceResult,
  PaymentProvider,
} from '@soostori/payments'
import { TumaPaymentProvider, TUMA_PAYMENT_PROVIDER_ID, TUMA_PAYMENT_PROVIDER_NAME } from '../src/provider.js'
import { TumaError } from '../src/client.js'

// ── Mock TumaClient factory ────────────────────────────────────────────────────

function mockTumaClient(overrides: Partial<{
  stkPushResult: Awaited<ReturnType<import('../src/client.js').TumaClient['stkPush']>>
  createInvoiceResult: Awaited<ReturnType<import('../src/client.js').TumaClient['createInvoice']>>
  stkPushError: unknown
  createInvoiceError: unknown
}> = {}) {
  return {
    stkPush: vi.fn(async () => {
      if (overrides.stkPushError) throw overrides.stkPushError
      return overrides.stkPushResult ?? {
        success: true,
        message: 'STK push sent',
        data: {
          merchant_request_id: 'MERCH-001',
          checkout_request_id: 'CHECK-001',
          customer_message: 'Accept the prompt on your phone',
        },
      }
    }),
    createInvoice: vi.fn(async () => {
      if (overrides.createInvoiceError) throw overrides.createInvoiceError
      return overrides.createInvoiceResult ?? {
        success: true,
        message: 'Invoice created',
        data: {
          invoice: {
            id: 'INV-TUMA-001',
            invoice_number: 'TUMA-2026-001',
            total_amount: 5000,
            channel: 'mpesa',
            payment_url: 'https://pay.tuma.co.ke/i/abc123',
            access_code: 'abc123',
          },
        },
      }
    }),
  } as unknown as import('../src/client.js').TumaClient
}

// ── Compile-time type contract ─────────────────────────────────────────────────

const _typeCheck: PaymentProvider = null as unknown as TumaPaymentProvider

// ── Happy-path mocks for callback tests ───────────────────────────────────────

const SUCCESS_STK_BODY = JSON.stringify({
  status: 'completed',
  result_code: 0,
  result_desc: 'The request was successful.',
  merchant_request_id: 'MERCH-001',
  checkout_request_id: 'CHECK-001',
  mpesa_receipt_number: 'MPXX123456789',
  amount: 500,
  timestamp: '2026-02-23 14:27:46',
})

const FAILED_STK_BODY = JSON.stringify({
  status: 'failed',
  result_code: 1,
  result_desc: 'The operation failed.',
  failure_reason: 'Insufficient funds.',
  merchant_request_id: 'MERCH-002',
  checkout_request_id: 'CHECK-002',
  amount: 500,
  timestamp: '2026-02-23 14:28:00',
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TumaPaymentProvider — type contract', () => {
  it('satisfies PaymentProvider at compile time', () => {
    expect(typeof _typeCheck).toBe('object')
  })

  it('has correct providerId', () => {
    const client = mockTumaClient()
    const provider = new TumaPaymentProvider(client)
    expect(provider.providerId).toBe(TUMA_PAYMENT_PROVIDER_ID)
    expect(provider.providerId).toBe('tuma')
  })

  it('has correct providerName', () => {
    const client = mockTumaClient()
    const provider = new TumaPaymentProvider(client)
    expect(provider.providerName).toBe(TUMA_PAYMENT_PROVIDER_NAME)
    expect(typeof provider.providerName).toBe('string')
  })
})

describe('TumaPaymentProvider — stkPush', () => {

  it('maps canonical StkPushRequest to TumaClient.stkPush', async () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    const req: StkPushRequest = {
      amount: 1000,
      phone: '254712345678',
      reference: 'INV-2026-001',
      description: 'Invoice payment',
      callbackUrl: 'https://shop.example.com/callbacks/tuma',
    }

    await provider.stkPush(req)

    expect(mockClient.stkPush).toHaveBeenCalledTimes(1)
    expect(mockClient.stkPush).toHaveBeenCalledWith({
      amount: 1000,        // Money → number (canonical Money ≡ number)
      phone: '254712345678',
      callbackUrl: 'https://shop.example.com/callbacks/tuma',
      description: 'Invoice payment', // canonical description preferred over reference
    })
  })

  it('maps Tuma response to canonical StkPushResult', async () => {
    const mockClient = mockTumaClient({
      stkPushResult: {
        success: true,
        message: 'STK push sent',
        data: {
          merchant_request_id: 'MERCH-X',
          checkout_request_id: 'CHECK-X',
          customer_message: 'Prompt sent',
        },
      },
    })
    const provider = new TumaPaymentProvider(mockClient)

    const req: StkPushRequest = {
      amount: 500,
      phone: '254700000000',
      reference: 'REF-001',
      callbackUrl: 'https://example.com/cb',
    }

    const result = await provider.stkPush(req)

    expect(result).toEqual({
      merchantRequestId: 'MERCH-X',
      checkoutRequestId: 'CHECK-X',
      customerMessage: 'Prompt sent',
    })
  })

  it('maps description to description when reference is absent', async () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    const req: StkPushRequest = {
      amount: 200,
      phone: '254711111111',
      callbackUrl: 'https://x.com/cb',
      description: 'Partial payment',
      // no reference — canonical description should be used
    }

    await provider.stkPush(req)

    // canonical description → Tuma description when reference is absent
    expect(mockClient.stkPush).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Partial payment' })
    )
  })

  it('propagates TumaError on failure', async () => {
    const mockClient = mockTumaClient({
      stkPushError: new TumaError('Server error', 'TUMA_REQUEST_FAILED', 500),
    })
    const provider = new TumaPaymentProvider(mockClient)

    const req: StkPushRequest = {
      amount: 100, phone: '254700000000', callbackUrl: 'https://x.com/cb',
    }

    await expect(provider.stkPush(req)).rejects.toThrow(TumaError)
  })
})

describe('TumaPaymentProvider — createSale', () => {
  it('throws TumaUnsupportedError (Tuma requires line items)', async () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    const req: CreateSaleRequest = {
      reference: 'ORD-001',
      amount: 5000,
      paymentMethod: 'cash',
      callbackUrl: 'https://x.com/cb',
    }

    await expect(provider.createSale(req)).rejects.toThrow()
    await expect(provider.createSale(req)).rejects.toThrow(/createSale/)
    await expect(provider.createSale(req)).rejects.toThrow(/items/)
  })
})

describe('TumaPaymentProvider — createInvoice', () => {

  it('maps canonical CreateInvoiceRequest to TumaClient.createInvoice', async () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    const req: CreateInvoiceRequest = {
      customerName: 'Jane Doe',
      customerEmail: 'jane@example.com',
      customerPhone: '254722000000',
      amount: 7500,
      description: 'Monthly subscription',
      dueDate: '2026-03-31T00:00:00.000Z',
      callbackUrl: 'https://shop.example.com/callbacks/invoice',
    }

    await provider.createInvoice(req)

    expect(mockClient.createInvoice).toHaveBeenCalledTimes(1)
    expect(mockClient.createInvoice).toHaveBeenCalledWith({
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      items: [{
        item_name: 'Monthly subscription',
        quantity: 1,
        unit_price: 7500,
        item_description: 'Monthly subscription',
      }],
      due_date: '2026-03-31T00:00:00.000Z',
      callback_url: 'https://shop.example.com/callbacks/invoice',
    })
  })

  it('uses description as item name when provided', async () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    const req: CreateInvoiceRequest = {
      customerName: 'John',
      amount: 1000,
      description: 'Custom item',
      callbackUrl: 'https://x.com/cb',
    }

    await provider.createInvoice(req)

    expect(mockClient.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ item_name: 'Custom item' })],
      })
    )
  })

  it('maps Tuma response to canonical CreateInvoiceResult', async () => {
    const mockClient = mockTumaClient({
      createInvoiceResult: {
        success: true,
        message: 'Invoice created',
        data: {
          invoice: {
            id: 'INV-999',
            invoice_number: 'INV-2026-999',
            total_amount: 7500,
            channel: 'mpesa',
            payment_url: 'https://pay.tuma.co.ke/i/xyz',
            access_code: 'xyz789',
          },
        },
      },
    })
    const provider = new TumaPaymentProvider(mockClient)

    const result = await provider.createInvoice({
      customerName: 'Test',
      amount: 7500,
      description: 'Test invoice',
      callbackUrl: 'https://x.com/cb',
    })

    expect(result).toEqual({
      invoiceId: 'INV-999',
      invoiceNumber: 'INV-2026-999',
      paymentUrl: 'https://pay.tuma.co.ke/i/xyz',
      accessCode: 'xyz789',
      totalAmount: 7500,  // canonical amount from request, not Tuma response
    })
  })

  it('propagates TumaError on failure', async () => {
    const mockClient = mockTumaClient({
      createInvoiceError: new TumaError('Invoice limit reached', 'TUMA_OPERATION_FAILED', 422),
    })
    const provider = new TumaPaymentProvider(mockClient)

    const req: CreateInvoiceRequest = {
      customerName: 'Fail',
      amount: 1000,
      description: 'Fail',
      callbackUrl: 'https://x.com/cb',
    }

    await expect(provider.createInvoice(req)).rejects.toThrow(TumaError)
  })
})

describe('TumaPaymentProvider — verifyCallback', () => {

  it('parses successful STK callback → canonical completed', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    const result = provider.verifyCallback(SUCCESS_STK_BODY)

    expect(result.providerId).toBe('tuma')
    expect(result.merchantRequestId).toBe('MERCH-001')
    expect(result.checkoutRequestId).toBe('CHECK-001')
    expect(result.status).toBe('completed')
    expect(result.receiptNumber).toBe('MPXX123456789')
    expect(result.amount).toBe(500)
    expect(result.failureReason).toBeUndefined()
    expect(result.timestamp).toBe('2026-02-23 14:27:46')
  })

  it('parses failed STK callback → canonical failed', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    const result = provider.verifyCallback(FAILED_STK_BODY)

    expect(result.status).toBe('failed')
    expect(result.merchantRequestId).toBe('MERCH-002')
    expect(result.checkoutRequestId).toBe('CHECK-002')
    expect(result.receiptNumber).toBeUndefined()
    expect(result.failureReason).toBe('Insufficient funds.')
    expect(result.amount).toBe(500)
  })

  it('parses sale callback → canonical completed', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    const body = JSON.stringify({
      type: 'sale',
      status: 'completed',
      sale_id: 'SALE-001',
      merchant_request_id: 'MERCH-SALE',
      checkout_request_id: 'CHECK-SALE',
      mpesa_receipt_number: 'MPXX999999',
      amount: 3000,
      timestamp: '2026-03-01T10:00:00',
    })

    const result = provider.verifyCallback(body)

    expect(result.status).toBe('completed')
    expect(result.merchantRequestId).toBe('MERCH-SALE')
    expect(result.checkoutRequestId).toBe('CHECK-SALE')
    expect(result.receiptNumber).toBe('MPXX999999')
    expect(result.amount).toBe(3000)
    expect(result.failureReason).toBeUndefined()
  })

  it('parses invoice callback → canonical completed', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    const body = JSON.stringify({
      type: 'invoice',
      status: 'completed',
      invoice_id: 'INV-001',
      merchant_request_id: 'MERCH-INV',
      checkout_request_id: 'CHECK-INV',
      mpesa_receipt_number: 'MPXX111111',
      amount: 8000,
      timestamp: '2026-03-01T11:00:00',
    })

    const result = provider.verifyCallback(body)

    expect(result.status).toBe('completed')
    expect(result.merchantRequestId).toBe('MERCH-INV')
    expect(result.checkoutRequestId).toBe('CHECK-INV')
    expect(result.receiptNumber).toBe('MPXX111111')
    expect(result.amount).toBe(8000)
  })

  it('rejects non-JSON body', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    expect(() => provider.verifyCallback('not json{')).toThrow()
    expect(() => provider.verifyCallback('not json{')).toThrow(/JSON/)
  })

  it('rejects unparseable callback body', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    const body = JSON.stringify({ unknown: 'structure' })

    expect(() => provider.verifyCallback(body)).toThrow()
    expect(() => provider.verifyCallback(body)).toThrow(/parse/)
  })

  it('accepts optional signature parameter without using it', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)

    // Should not throw — signature is accepted but Tuma does not currently use HMAC
    const result = provider.verifyCallback(SUCCESS_STK_BODY, 'any-signature-value')
    expect(result.status).toBe('completed')
  })

  it('receiptRepository is undefined by default', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)
    expect(provider.receiptRepository).toBeUndefined()
  })

  it('receiptRepository can be set', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)
    const repo = { save: vi.fn(), findByCheckoutRequestId: vi.fn(), findByProviderReference: vi.fn(), listByShop: vi.fn() }
    provider.receiptRepository = repo
    expect(provider.receiptRepository).toBe(repo)
  })
})

describe('TumaPaymentProvider — HMAC signature verification', () => {
  const SECRET = 'test-webhook-secret'
  const VALID_BODY = JSON.stringify({
    status: 'completed',
    result_code: 0,
    result_desc: 'The request was successful.',
    merchant_request_id: 'MERCH-001',
    checkout_request_id: 'CHECK-001',
    mpesa_receipt_number: 'MPXX123456789',
    amount: 500,
    timestamp: '2026-02-23 14:27:46',
  })

  function makeSig(body: string, secret: string): string {
    const { createHmac } = require('crypto') as typeof import('crypto')
    return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
  }

  it('accepts valid signature when webhookSecret is configured', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient, SECRET)
    const sig = makeSig(VALID_BODY, SECRET)
    expect(() => provider.verifyCallback(VALID_BODY, sig)).not.toThrow()
    const result = provider.verifyCallback(VALID_BODY, sig)
    expect(result.status).toBe('completed')
  })

  it('rejects invalid signature when webhookSecret is configured', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient, SECRET)
    const wrongSig = makeSig(VALID_BODY, 'wrong-secret')
    expect(() => provider.verifyCallback(VALID_BODY, wrongSig)).toThrow(/signature/i)
  })

  it('rejects missing signature when webhookSecret is configured', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient, SECRET)
    expect(() => provider.verifyCallback(VALID_BODY, undefined as unknown as string)).toThrow(/missing/i)
  })

  it('accepts unsigned callback when webhookSecret is NOT configured (backward compat)', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)  // no secret
    expect(() => provider.verifyCallback(VALID_BODY)).not.toThrow()
    expect(provider.verifyCallback(VALID_BODY).status).toBe('completed')
  })

  it('accepts arbitrary signature when webhookSecret is NOT configured', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient)
    expect(() => provider.verifyCallback(VALID_BODY, 'any-value')).not.toThrow()
  })

  it('parses body correctly after HMAC verification passes', () => {
    const mockClient = mockTumaClient()
    const provider = new TumaPaymentProvider(mockClient, SECRET)
    const sig = makeSig(VALID_BODY, SECRET)
    const result = provider.verifyCallback(VALID_BODY, sig)
    expect(result.providerId).toBe('tuma')
    expect(result.amount).toBe(500)
    expect(result.receiptNumber).toBe('MPXX123456789')
    expect(result.status).toBe('completed')
  })
})

describe('TumaPaymentProvider — constants', () => {
  it('TUMA_PAYMENT_PROVIDER_ID is "tuma"', () => {
    expect(TUMA_PAYMENT_PROVIDER_ID).toBe('tuma')
  })

  it('TUMA_PAYMENT_PROVIDER_NAME is non-empty string', () => {
    expect(typeof TUMA_PAYMENT_PROVIDER_NAME).toBe('string')
    expect(TUMA_PAYMENT_PROVIDER_NAME.length).toBeGreaterThan(0)
  })
})
