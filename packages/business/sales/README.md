# @soostori/sales

Sales domain — extracted from Desktop's sales schema + SALE_PENDING state machine.

## Architecture (Option C: Hybrid Primary Device)

Sales is **stock-sensitive**, so it always routes through the Primary Device:

```
Terminal                     Primary Device                   Other terminals
   │                                │                                │
   ├─ SALE_REQUEST ──────────────► │                                │
   │                                ├─ checkStock()                   │
   │                                ├─ SALE_ACCEPTED / REJECTED      │
   │ ◄── SALE_RESPONSE ───────────┤                                │
   │                                ├─ Broadcast                     │
   │                                ├───────────────────────────────►│
```

The `authorize()` method runs **only on the Primary Device**. Terminals send `SaleRequest` over LAN and wait for `SaleResponse`.

## Two-phase commit

1. **Phase 1 — Request**: Terminal sends `SALE_REQUEST` to Primary. Primary validates stock and either accepts (locks stock reservation) or rejects. UI shows "pending" while waiting.
2. **Phase 2 — Confirm**: Terminal commits local record after receiving the ack. Stock decrement happens at this point. Other terminals are notified.

If a terminal goes offline between phases, the sale is rolled back (no stock deducted).

## Events emitted

| Event | When |
|---|---|
| `sale.pending` | Terminal sends request to Primary |
| `sale.confirmed` | Primary accepts |
| `sale.rejected` | Primary rejects (with reason) |
| `sale.completed` | Terminal commits local record |
| `sale.refunded` | Refund processed |

## Contents

| File | Purpose |
|---|---|
| `types.ts` | `Sale`, `SaleItem`, `SaleRequest`, `SaleResponse`, `HeldSale` |
| `repository.ts` | Storage abstraction |
| `state-machine.ts` | `checkStockForSale`, `buildSaleRequest`, `computeSaleTotals` |
| `service.ts` | `SalesService` — runs on Primary Device |
