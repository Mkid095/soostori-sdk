# @soostori/devices

Device identity + LAN Host coordinator — the LAN authority for stock mutations.

## Architecture (Option C — Hybrid)

Each business has a designated **LAN Host** on the LAN:

```
                LAN Host
                 │
       ┌─────────┼────────────┐
   Terminal 1  Terminal 2   Mobile
```

Stock-sensitive operations (sale, stock receipt, stock adjustment) route through the LAN Host.
Non-stock operations (customer edits, debt records) work offline independently.

## Why manual failover only?

In a POS handling money and inventory:

> Two devices accidentally becoming LAN Host is **worse** than temporarily restricting stock ops.

So this SDK:
- Auto-elects LAN Host when first device joins a shop LAN
- Allows manual `setLanHost(targetDeviceId, transferredBy)`
- Detects LAN Host loss after grace period (default 60s)
- Does **not** automatically elect a new LAN Host

## Modules

| File | Purpose |
|---|---|
| `types.ts` | `Device`, `DeviceIdentity`, `Heartbeat`, `PrimaryDeviceState` |
| `primary.ts` | `PrimaryDeviceCoordinator` — heartbeats, election, transfer, canAuthorStockOps |
| `repository.ts` | Storage abstraction for device records |
| `errors.ts` | `LanHostRequiredError` |
| `DeviceService.ts` | `DeviceService` — canonical device management, getLanHost, setLanHost |

## Usage

```ts
import { PrimaryDeviceCoordinator, LanHostRequiredError } from '@soostori/devices'

const coordinator = new PrimaryDeviceCoordinator({
  shopId,
  deviceId: thisDeviceId,
})

// On heartbeat from a peer
coordinator.ingestHeartbeat({
  deviceId: peerId, shopId, timestamp: new Date().toISOString(),
  isLanHost: true, reachable: true, stockSequence: 42,
})

// Periodic state update
coordinator.tick()

// Before processing a sale
if (!coordinator.canAuthorStockOps()) {
  throw new LanHostRequiredError()
}
```
