# @soostori/devices

Device identity + Primary Device coordinator — the LAN authority for stock mutations.

## Architecture (Option C — Hybrid Primary)

Each business has a designated **Primary Device** on the LAN:

```
                Primary Device
                 │
       ┌─────────┼────────────┐
   Terminal 1  Terminal 2   Mobile
```

Stock-sensitive operations (sale, stock receipt, stock adjustment) route through Primary.
Non-stock operations (customer edits, debt records) work offline independently.

## Why manual failover only?

In a POS handling money and inventory:

> Two devices accidentally becoming Primary is **worse** than temporarily restricting stock ops.

So this SDK:
- Auto-elects Primary when first device joins a shop LAN
- Allows manual `transferPrimary(toDevice, fromDevice)`
- Detects Primary loss after grace period (default 60s)
- Does **not** automatically elect a new Primary

## Modules

| File | Purpose |
|---|---|
| `types.ts` | `Device`, `DeviceIdentity`, `Heartbeat`, `PrimaryDeviceState` |
| `primary.ts` | `PrimaryDeviceCoordinator` — heartbeats, election, transfer, canAuthorStockOps |
| `repository.ts` | Storage abstraction for device records |

## Usage

```ts
import { PrimaryDeviceCoordinator } from '@soostori/devices'

const coordinator = new PrimaryDeviceCoordinator({
  shopId,
  deviceId: thisDeviceId,
})

// On heartbeat from a peer
coordinator.ingestHeartbeat({
  deviceId: peerId, shopId, timestamp: new Date().toISOString(),
  isPrimary: true, reachable: true, stockSequence: 42,
})

// Periodic state update
coordinator.tick()

// Before processing a sale
if (!coordinator.canAuthorStockOps()) {
  throw new Error('Primary unavailable — sale queued')
}
```
