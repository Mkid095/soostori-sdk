import { describe, it, expect } from 'vitest'
import { createTumaClient, TumaError } from '../src/client'
import { parseCallback } from '../src/callback'

function mockFetch(responses: Array<{ status: number; body: unknown }>): typeof fetch {
  let i = 0
  return (async () => {
    const r = responses[i++] ?? { status: 500, body: { error: 'exhausted' } }
    return new Response(JSON.stringify(r.body), { status: r.status })
  }) as unknown as typeof fetch
}

describe('TumaClient — credential safety', () => {
  it('throws if TUMA_API_KEY is missing', () => {
    const prevKey = process.env.TUMA_API_KEY
    const prevEmail = process.env.TUMA_BUSINESS_EMAIL
    delete process.env.TUMA_API_KEY
    delete process.env.TUMA_BUSINESS_EMAIL
    expect(() => createTumaClient({ fetch: mockFetch([]) })).toThrow(/TUMA_API_KEY/)
    if (prevKey !== undefined) process.env.TUMA_API_KEY = prevKey
    if (prevEmail !== undefined) process.env.TUMA_BUSINESS_EMAIL = prevEmail
  })

  it('throws if TUMA_BUSINESS_EMAIL is missing', () => {
    const prevKey = process.env.TUMA_API_KEY
    const prevEmail = process.env.TUMA_BUSINESS_EMAIL
    process.env.TUMA_API_KEY = 'test-key'
    delete process.env.TUMA_BUSINESS_EMAIL
    expect(() => createTumaClient({ fetch: mockFetch([]) })).toThrow(/TUMA_BUSINESS_EMAIL/)
    if (prevKey !== undefined) process.env.TUMA_API_KEY = prevKey
    if (prevEmail !== undefined) process.env.TUMA_BUSINESS_EMAIL = prevEmail
  })
})

describe('TumaClient — requests', () => {
  const envBackup = {
    key: process.env.TUMA_API_KEY,
    email: process.env.TUMA_BUSINESS_EMAIL,
  }
  beforeEach(() => {
    process.env.TUMA_API_KEY = 'test-key'
    process.env.TUMA_BUSINESS_EMAIL = 'biz@test.com'
  })
  afterEach(() => {
    if (envBackup.key !== undefined) process.env.TUMA_API_KEY = envBackup.key
    else delete process.env.TUMA_API_KEY
    if (envBackup.email !== undefined) process.env.TUMA_BUSINESS_EMAIL = envBackup.email
    else delete process.env.TUMA_BUSINESS_EMAIL
  })

  it('gets token and sends STK push', async () => {
    const fetch = mockFetch([
      { status: 200, body: { success: true, token: 'jwt-abc', expires_in: 86400 } },
      {
        status: 200,
        body: {
          success: true,
          message: 'STK push sent',
          data: {
            merchant_request_id: 'm1',
            checkout_request_id: 'c1',
            customer_message: 'Complete on phone',
          },
        },
      },
    ])
    const client = createTumaClient({ fetch })
    const result = await client.stkPush({ amount: 100, phone: '254712345678', callbackUrl: 'https://x.test/cb' })
    expect(result.success).toBe(true)
    expect(result.data.merchant_request_id).toBe('m1')
  })

  it('throws TumaError on failure', async () => {
    // Mock the auth + a failing API call. listBusinesses uses auth=true.
    const fetch = mockFetch([
      { status: 200, body: { success: true, token: 'jwt', expires_in: 86400 } },
      { status: 500, body: { success: false, message: 'Server error' } },
    ])
    const client = createTumaClient({ fetch })
    await expect(client.listBusinesses()).rejects.toThrow(TumaError)
  })

  it('caches token across calls', async () => {
    // listBusinesses is called twice. With token caching, only ONE auth call
    // is made (total 3 fetch calls: 1 auth + 2 API). Provide 3 valid responses.
    const fetch = mockFetch([
      { status: 200, body: { success: true, token: 'jwt-1', expires_in: 86400 } },
      { status: 200, body: { success: true, data: [{ id: 'b1', name: 'Biz 1' }] } },
      { status: 200, body: { success: true, data: [{ id: 'b1', name: 'Biz 1' }] } },
    ])
    const client = createTumaClient({ fetch })
    const r1 = await client.listBusinesses()
    const r2 = await client.listBusinesses()  // uses cached token
    expect(r1.data).toHaveLength(1)
    expect(r2.data).toHaveLength(1)
  })
})

describe('parseCallback', () => {
  it('parses STK success', () => {
    const result = parseCallback({
      status: 'completed', result_code: 0, result_desc: 'OK', timestamp: '2026-02-23 14:27:46',
      merchant_request_id: 'm1', checkout_request_id: 'c1',
      mpesa_receipt_number: 'ABC', amount: 100,
    })
    expect(result).not.toBeNull()
    if (result && 'mpesa_receipt_number' in result) expect(result.mpesa_receipt_number).toBe('ABC')
  })

  it('parses sales callback', () => {
    const result = parseCallback({
      type: 'sale', status: 'completed',
      sale_id: 's1', merchant_request_id: 'm1', checkout_request_id: 'c1',
      amount: 1000, timestamp: '2026-02-23',
    })
    expect(result).not.toBeNull()
  })

  it('parses invoice callback', () => {
    const result = parseCallback({
      type: 'invoice', status: 'completed',
      invoice_id: 'i1', merchant_request_id: 'm1', checkout_request_id: 'c1',
      amount: 5000, timestamp: '2026-02-23',
    })
    expect(result).not.toBeNull()
  })

  it('returns null on garbage', () => {
    expect(parseCallback(null)).toBeNull()
    expect(parseCallback({})).toBeNull()
  })
})
