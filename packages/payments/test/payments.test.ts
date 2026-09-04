import { describe, it, expect, vi } from 'vitest'
import { PaymentProviderRegistry } from '../src/index'
import type { PaymentProvider } from '../src/index'

function mockProvider(id: string): PaymentProvider {
  return {
    providerId: id,
    providerName: `Mock ${id}`,
    stkPush: vi.fn(async () => ({ merchantRequestId: 'm1', checkoutRequestId: 'c1', customerMessage: 'OK' })),
    createSale: vi.fn(async () => ({ saleId: 's1', merchantRequestId: 'm1', checkoutRequestId: 'c1', totalAmount: 100 })),
    createInvoice: vi.fn(async () => ({ invoiceId: 'i1', invoiceNumber: 'INV-1', paymentUrl: 'https://x.test', accessCode: '123', totalAmount: 100 })),
    verifyCallback: vi.fn(() => ({
      providerId: id, merchantRequestId: 'm1', checkoutRequestId: 'c1',
      status: 'completed', amount: 100, timestamp: new Date().toISOString(),
    })),
  }
}

describe('PaymentProviderRegistry', () => {
  it('registers and retrieves provider', () => {
    const r = new PaymentProviderRegistry()
    const m = mockProvider('mock')
    r.register(m)
    expect(r.get('mock')).toBe(m)
  })

  it('defaults to first registered', () => {
    const r = new PaymentProviderRegistry()
    const m = mockProvider('first')
    r.register(m)
    r.register(mockProvider('second'))
    expect(r.get().providerId).toBe('first')
  })

  it('throws when no provider', () => {
    const r = new PaymentProviderRegistry()
    expect(() => r.get()).toThrow(/No payment provider/)
  })

  it('throws on unknown provider', () => {
    const r = new PaymentProviderRegistry()
    r.register(mockProvider('m'))
    expect(() => r.get('unknown')).toThrow(/not found/)
  })

  it('list returns all providers', () => {
    const r = new PaymentProviderRegistry()
    r.register(mockProvider('a'))
    r.register(mockProvider('b'))
    expect(r.list()).toHaveLength(2)
  })
})
