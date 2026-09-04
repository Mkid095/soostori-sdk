# @soostori/payments

Payments abstraction — Tuma is one implementation. Other providers can be added.

## Architecture

```
Application code
       │
       ▼
PaymentProviderRegistry
       │
   ┌───┴────┐
   ▼        ▼
Tuma    Stripe   PesaPal  ...
(impl)  (impl)   (impl)
```

Each provider implements the same `PaymentProvider` interface.

## Implementations

| Package | Provider | Status |
|---|---|---|
| `@soostori/tuma` | Tuma (M-Pesa) | ✅ complete |

## Usage

```ts
import { PaymentProviderRegistry } from '@soostori/payments'
import { TumaClient } from '@soostori/tuma'

const tuma = new TumaClient()
const registry = new PaymentProviderRegistry()
registry.register(tuma)  // TumaClient implements PaymentProvider

// Make a sale
const result = await registry.get().createSale({
  reference: 'ORDER-001',
  amount: 1500,
  customerPhone: '254712345678',
  paymentMethod: 'stk_push',
  callbackUrl: 'https://app.example.com/callback',
})

// Verify webhook callback
const callback = registry.get().verifyCallback(rawBody, signature)
if (callback.status === 'completed') {
  // Subscription payment confirmed
}
```

## Adding a new provider

```ts
class StripeProvider implements PaymentProvider {
  readonly providerId = 'stripe'
  readonly providerName = 'Stripe'
  async stkPush(req: StkPushRequest) { /* Stripe equivalent */ }
  // ... other methods
}

registry.register(new StripeProvider())
```
