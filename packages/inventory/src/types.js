/**
 * Inventory types — stock movement ledger + cached balance.
 *
 * Design:
 *   - StockMovement is the IMMUTABLE ledger record (append-only).
 *   - StockBalance is a DERIVED cache of current stock for fast reads.
 *   - Every stock-affecting operation must produce a StockMovement.
 *   - The balance is recomputable by summing movements.
 *
 * Why a ledger rather than updating a column?
 *   - Audit: every change has a reason and an actor.
 *   - Sync: replay-deterministic — the same movements produce the same balance.
 *   - Debugging: "why is stock 5?" can be answered from the ledger.
 *   - Multi-device: each device's contribution is explicit.
 */
export {};
//# sourceMappingURL=types.js.map