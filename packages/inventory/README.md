# @soostori/inventory

Stock movement ledger — event-sourced inventory, not just quantity columns.

## Design

```
Product
   ↓
StockMovementLedger (single source of truth)
   ↓
StockMovement (immutable, append-only)
   ↓
StockBalance (cached, derived)
```

Every stock change produces a `StockMovement` record. The `StockBalance` is a cache that can always be recomputed by summing the ledger.

## Why a ledger?

- **Audit**: every change has a reason and an actor
- **Sync**: replay-deterministic — same movements = same balance
- **Debugging**: "why is stock 5?" has a complete answer
- **Multi-device**: each device's contribution is explicit
- **Sales reconciliation**: any sale can be traced from balance back to its source

## Operations

| Operation | Movement Type | Quantity |
|---|---|---|
| Stock received from supplier | `received` | +N |
| Sale committed | `sold` | -N |
| Refund processed | `refunded` | +N |
| Customer return | `returned` | +N |
| Manual adjustment | `adjusted` | ±N |
| Inter-location transfer | `transferred` | ±N |
| Sale reservation lock | `reserved` | 0 (tracked separately) |
| Reservation released | `released` | 0 |

## Usage

```ts
import { StockMovementLedger } from '@soostori/inventory'

const ledger = new StockMovementLedger(repo, shopId, deviceId)

// Receive stock
await ledger.apply({
  productId, type: 'received', quantity: 100,
  actorType: 'employee', actorId: employeeId,
  reason: 'PO-1234',
})

// Reserve stock for a pending sale
const { reserved, reservationId } = await ledger.reserve({
  saleId, productId, quantity: 3,
})

// Commit reservation on sale completion
if (reserved) {
  await ledger.commitReservation(reservationId, {
    actorType: 'employee', actorId: employeeId,
  });
}

// Get history
const movements = await ledger.getHistory(productId);
```
