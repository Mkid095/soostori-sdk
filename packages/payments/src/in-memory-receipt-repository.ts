/**
 * In-memory implementation of PaymentReceiptRepository.
 *
 * Suitable for testing and development. Not suitable for production
 * where receipts must survive process restarts.
 */

import type { BusinessId, ISO8601 } from '@soostori/core'
import type {
  PaymentReceipt,
  PaymentReceiptRepository,
} from './receipt.js'

export class InMemoryPaymentReceiptRepository implements PaymentReceiptRepository {
  private readonly receipts = new Map<string, PaymentReceipt>()

  async save(receipt: PaymentReceipt): Promise<void> {
    this.receipts.set(receipt.id, receipt)
  }

  async findByCheckoutRequestId(id: string): Promise<PaymentReceipt | null> {
    for (const r of this.receipts.values()) {
      if (r.checkoutRequestId === id) return r
    }
    return null
  }

  async findByProviderReference(ref: string): Promise<PaymentReceipt | null> {
    for (const r of this.receipts.values()) {
      if (r.providerReference === ref) return r
    }
    return null
  }

  async listByShop(shopId: BusinessId, period: { from: ISO8601; to: ISO8601 }): Promise<PaymentReceipt[]> {
    return [...this.receipts.values()].filter(r => {
      if (r.shopId !== shopId) return false
      const created = r.createdAt
      return created >= period.from && created <= period.to
    })
  }
}
