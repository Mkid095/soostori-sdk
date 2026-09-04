/**
 * Payment provider contract.
 *
 * Each provider (Tuma, Stripe, etc.) implements this. The application picks
 * one or composes them.
 */

import type {
  StkPushRequest, StkPushResult,
  CreateSaleRequest, CreateSaleResult,
  CreateInvoiceRequest, CreateInvoiceResult,
  PaymentCallback,
} from './types'

export interface PaymentProvider {
  /** Unique provider identifier. */
  readonly providerId: string
  /** Human-readable name. */
  readonly providerName: string
  /** Initiate M-Pesa STK push (customer receives prompt on phone). */
  stkPush(req: StkPushRequest): Promise<StkPushResult>
  /** Create a sale with a specific payment method. */
  createSale(req: CreateSaleRequest): Promise<CreateSaleResult>
  /** Generate an invoice with a payment link. */
  createInvoice(req: CreateInvoiceRequest): Promise<CreateInvoiceResult>
  /** Verify and parse a webhook callback (verifies authenticity). */
  verifyCallback(rawBody: string, signature?: string): PaymentCallback
}

export class PaymentProviderRegistry {
  private providers = new Map<string, PaymentProvider>()
  private defaultProviderId: string | null = null

  register(provider: PaymentProvider): void {
    this.providers.set(provider.providerId, provider)
    if (!this.defaultProviderId) this.defaultProviderId = provider.providerId
  }

  get(providerId?: string): PaymentProvider {
    const id = providerId ?? this.defaultProviderId
    if (!id) throw new Error('No payment provider registered')
    const p = this.providers.get(id)
    if (!p) throw new Error(`Payment provider ${id} not found`)
    return p
  }

  list(): PaymentProvider[] {
    return [...this.providers.values()]
  }
}
