# @soostori/offline

3-day offline policy — central enforcement of Soostori's offline boundary.

## Why centralize?

The 3-day offline rule is a Soostori product commitment. Both Desktop and Mobile must enforce it identically. Putting it in one shared SDK prevents drift.

## State machine

```
ONLINE (cloud verified)
  │
  ▼
OFFLINE_NORMAL (days 0-2)
  │
  ▼
OFFLINE_WARNING (day 3, 24h before limit)
  │
  ▼
OFFLINE_LIMIT_EXCEEDED
  │
  ▼
Require connection
```

## What each phase allows

| Phase | Can sell | Can receive stock | Can view reports |
|---|---|---|---|
| ONLINE | ✅ | ✅ | ✅ |
| OFFLINE_NORMAL | ✅ | ✅ | ✅ |
| OFFLINE_WARNING | ✅ | ⚠️ (warn) | ✅ (with banner) |
| OFFLINE_LIMIT_EXCEEDED | ❌ (blocked) | ❌ | ✅ (read-only) |

## Usage

```ts
import { computeOfflineState } from '@soostori/offline'

const state = computeOfflineState({
  shopId, isOnline: navigator.onLine,
  lastVerifiedAt: cachedLastVerification,
  entitlement, offlineSince,
  subscriptionExpired: false, primaryLost: false,
})

if (!state.canSell) {
  showOfflineBanner('Reconnect to continue selling')
}
```
