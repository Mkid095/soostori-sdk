# @soostori/subscription

Canonical subscription enforcement — plans, entitlements, expiration, offline grace period.

## Modules

| File | Purpose |
|---|---|
| `entitlement.ts` | `SubscriptionEntitlement` builder, state computation |
| `enforcement.ts` | `enforceSubscription` — throws if POS should be blocked |
| `cache.ts` | `SubscriptionCache` — cross-platform cached entitlement storage |

## Authority

- **Authoritative**: `subscriptions` + `plans` entities in cloud
- **Derived cache**: `shops.subscriptionExpiry` (denormalized for fast UI display)

## Behavior

| Status | Online behavior | Offline behavior |
|---|---|---|
| `active` | Allow | Allow (cached) |
| `trialing` | Allow | Allow (cached, 3-day grace) |
| `past_due` | Allow with banner | Allow (cached) |
| `expired` | Block | Allow within grace, then block |
| `cancelled` | Block | Allow within grace, then block |

## Usage

```ts
import { SubscriptionCache, enforceSubscription } from '@soostori/subscription'

const cache = new SubscriptionCache(myStorage)
const state = await cache.getState(shopId)

if (!state.valid) {
  enforceSubscription(state)  // throws SubscriptionExpiredError
}
```
