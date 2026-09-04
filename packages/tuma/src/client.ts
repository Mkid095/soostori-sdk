/**
 * Tuma M-Pesa payment client.
 *
 * Authentication: bearer token obtained from POST /auth/token using
 * business email + API key. The API key MUST be supplied via the
 * `TUMA_API_KEY` environment variable. The email is supplied via
 * `TUMA_BUSINESS_EMAIL`.
 *
 * NEVER hardcode credentials. NEVER commit them. NEVER log them.
 *
 * Base URL: https://api.tuma.co.ke
 */

import { SoostoriError } from '@soostori/core'

export const TUMA_BASE_URL = 'https://api.tuma.co.ke' as const

export interface TumaClientOptions {
  /** Override for testing — bypasses env var lookup. NEVER use in production. */
  apiKey?: string
  businessEmail?: string
  /** Override fetch for testing. */
  fetch?: typeof fetch
  /** Request timeout in ms (default 30000). */
  timeoutMs?: number
  /** Override base URL for staging. */
  baseUrl?: string
}

export class TumaError extends SoostoriError {
  readonly httpStatus?: number
  constructor(message: string, code = 'TUMA_ERROR', httpStatus?: number, cause?: unknown) {
    super(code, message, cause)
    this.name = 'TumaError'
    if (httpStatus !== undefined) this.httpStatus = httpStatus
  }
}

interface TumaAuthResponse {
  success: boolean
  token: string
  expires_in: number
  business?: {
    id: string
    name: string
    email: string
  }
}

interface TumaBusiness {
  id: string
  name: string
  email: string
  mobile?: string
  api_key: string
  is_active?: number
}

export class TumaClient {
  private apiKey: string
  private businessEmail: string
  private readonly fetch: typeof fetch
  private readonly timeoutMs: number
  private readonly baseUrl: string

  private _token: string | null = null
  private _tokenExpiresAt = 0

  constructor(options: TumaClientOptions = {}) {
    // SECURITY: Read credentials from environment variables, NOT from options.
    // The options.apiKey/email are only allowed for explicit test injection.
    this.apiKey = options.apiKey ?? process.env.TUMA_API_KEY ?? ''
    this.businessEmail = options.businessEmail ?? process.env.TUMA_BUSINESS_EMAIL ?? ''
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.baseUrl = options.baseUrl ?? TUMA_BASE_URL

    if (!this.apiKey) {
      throw new Error(
        'TUMA_API_KEY environment variable is required. See @soostori/tuma README.'
      )
    }
    if (!this.businessEmail) {
      throw new Error(
        'TUMA_BUSINESS_EMAIL environment variable is required.'
      )
    }
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`
  }

  private headers(auth: boolean): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (auth && this._token) h.Authorization = `Bearer ${this._token}`
    return h
  }

  private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    // Auto-refresh token if expired
    if (auth && Date.now() >= this._tokenExpiresAt) {
      await this.refreshToken()
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetch(this.url(path), {
        method,
        headers: this.headers(auth),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new TumaError(
          String(errBody.message ?? `HTTP ${res.status}`),
          'TUMA_REQUEST_FAILED',
          res.status,
          errBody
        )
      }
      const data = await res.json()
      if (data && typeof data === 'object' && 'success' in data && data.success === false) {
        throw new TumaError(String(data.message ?? 'Tuma request failed'), 'TUMA_OPERATION_FAILED', res.status, data)
      }
      return data as T
    } catch (err) {
      if (err instanceof TumaError) throw err
      if ((err as Error).name === 'AbortError') {
        throw new TumaError(`Tuma request timed out after ${this.timeoutMs}ms`, 'TUMA_TIMEOUT')
      }
      throw new TumaError(`Tuma request failed: ${(err as Error).message}`, 'TUMA_NETWORK', undefined, err)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // ── Authentication ──────────────────────────────────────────────────

  /** Get or refresh the bearer token. Cached in memory. */
  async refreshToken(): Promise<string> {
    const res = await this.request<TumaAuthResponse>(
      'POST',
      '/auth/token',
      { email: this.businessEmail, api_key: this.apiKey },
      false  // no auth header for token request
    )
    this._token = res.token
    // Refresh 60s early to avoid edge expiry
    this._tokenExpiresAt = Date.now() + (res.expires_in - 60) * 1000
    return res.token
  }

  // ── STK Push ───────────────────────────────────────────────────────

  /** Initiate M-Pesa STK push (customer receives prompt on phone). */
  async stkPush(args: {
    amount: number
    phone: string
    callbackUrl: string
    description?: string
  }): Promise<{
    success: boolean
    message: string
    data: {
      merchant_request_id: string
      checkout_request_id: string
      customer_message: string
    }
  }> {
    return this.request('POST', '/payment/stk-push', {
      amount: args.amount,
      phone: args.phone,
      callback_url: args.callbackUrl,
      description: args.description ?? 'Payment',
    })
  }

  // ── Products ───────────────────────────────────────────────────────

  /** Create a product in Tuma. */
  async createProduct(args: {
    name: string
    description?: string
    price: number
    stock: number
    sku?: string
    category?: string
  }): Promise<{ success: boolean; message: string; data: TumaBusiness }> {
    return this.request('POST', '/products', args)
  }

  // ── Sales ──────────────────────────────────────────────────────────

  /** Create a sale with M-Pesa or cash payment. */
  async createSale(args: {
    items: Array<{ product_id: string; quantity: number }>
    customer_name?: string
    customer_phone?: string
    payment_method: 'mpesa' | 'cash'
    callback_url?: string
  }): Promise<{
    success: boolean
    message: string
    data: {
      sale_id: string
      merchant_request_id: string
      checkout_request_id: string
      channel: string
      total_amount: number
    }
  }> {
    return this.request('POST', '/sales', args)
  }

  // ── Invoices ───────────────────────────────────────────────────────

  /** Generate an invoice with a payment link. */
  async createInvoice(args: {
    customer_name: string
    customer_email?: string
    items: Array<{ item_name: string; quantity: number; unit_price: number; item_description?: string }>
    due_date?: string
    callback_url?: string
  }): Promise<{
    success: boolean
    message: string
    data: {
      invoice: {
        id: string
        invoice_number: string
        total_amount: number
        channel: string
        payment_url: string
        access_code: string
      }
    }
  }> {
    return this.request('POST', '/invoices', args)
  }

  // ── Business Management ────────────────────────────────────────────

  /** List businesses (paginated by backend). */
  async listBusinesses(): Promise<{ success: boolean; data: TumaBusiness[] }> {
    return this.request('GET', '/businesses')
  }

  /** Get a specific business. */
  async getBusiness(businessId: string): Promise<{ success: boolean; data: TumaBusiness }> {
    return this.request('GET', `/businesses/${encodeURIComponent(businessId)}`)
  }

  /** Get the bank list (no auth required). */
  async getBanks(): Promise<{ success: boolean; data: Array<{ id: string; name: string; code: string; country: string }> }> {
    return this.request('GET', '/reference/banks', undefined, false)
  }
}

/** Factory — credentials are read from env vars. */
export function createTumaClient(options?: TumaClientOptions): TumaClient {
  return new TumaClient(options)
}
