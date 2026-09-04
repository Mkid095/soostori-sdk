/**
 * Inventory repository contract — append-only ledger + cached balances.
 */
export class InsufficientStockError extends Error {
    constructor(productId, available, requested) {
        super(`Insufficient stock for ${productId}: ${available} available, ${requested} requested`);
        this.name = 'InsufficientStockError';
    }
}
//# sourceMappingURL=repository.js.map