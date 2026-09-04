/**
 * Inventory ledger — single source of truth for stock quantity.
 *
 * The `StockMovementLedger` is the deterministic, replay-safe API.
 * Every operation produces an immutable movement + updates the balance.
 *
 * Replay safety: if a movement with the same idempotencyKey already exists,
 * the operation is a no-op (returns the existing movement).
 */
import type { InventoryRepository } from './repository';
import type { StockMovement } from './types';
import type { UUID } from '@soostori/core';
export declare class StockMovementLedger {
    private readonly repo;
    private readonly shopId;
    private readonly deviceId;
    constructor(repo: InventoryRepository, shopId: UUID, deviceId: UUID);
    /**
     * Apply a stock movement.
     * Idempotent: same idempotencyKey under same conditions = no-op.
     */
    apply(args: {
        productId: UUID;
        productVariantId?: UUID | null;
        type: StockMovement['type'];
        quantity: number;
        referenceId?: string;
        referenceType?: StockMovement['referenceType'];
        reason?: string;
        actorType: StockMovement['actorType'];
        actorId?: UUID;
        idempotencyKey?: UUID;
    }): Promise<StockMovement>;
    /** Reserve stock for a pending sale. Returns false if insufficient. */
    reserve(args: {
        saleId: UUID;
        productId: UUID;
        quantity: number;
        ttlSeconds?: number;
    }): Promise<{
        reserved: boolean;
        reservationId?: UUID;
    }>;
    /** Commit a reservation — convert it to a real stock movement. */
    commitReservation(reservationId: UUID, args: {
        actorType: StockMovement['actorType'];
        actorId?: UUID;
    }): Promise<StockMovement>;
    /** Release a reservation (sale cancelled). */
    releaseReservation(reservationId: UUID): Promise<void>;
    /** Get current quantity for a product. */
    getQuantity(productId: UUID): Promise<number>;
    /** Get the ledger history for a product. */
    getHistory(productId: UUID, pagination?: import('./repository').PaginationOptions): Promise<StockMovement[]>;
}
//# sourceMappingURL=ledger.d.ts.map