/**
 * Storage abstraction — keeps the SDK SQLite-agnostic.
 *
 * Platform implementations:
 *   - Desktop: better-sqlite3
 *   - Mobile (React Native): expo-sqlite
 *   - Web: IndexedDB
 *
 * The Soostori SDK does NOT directly depend on any of these.
 */
import type { UUID } from '@soostori/core';
/** Repository contract — used by every domain SDK. */
export interface Repository<T> {
    findById(id: UUID): Promise<T | null>;
    findMany(filter?: Record<string, unknown>): Promise<T[]>;
    create(data: T): Promise<T>;
    update(id: UUID, changes: Partial<T>): Promise<T>;
    delete(id: UUID): Promise<void>;
    /** Run multiple operations atomically. */
    transaction<R>(fn: (tx: TransactionHandle) => Promise<R>): Promise<R>;
}
/** Transaction handle — used within Repository.transaction(). */
export interface TransactionHandle {
    /** Insert a record. */
    insert<T>(table: string, data: T): Promise<T>;
    /** Update a record by id. */
    update<T>(table: string, id: UUID, changes: Partial<T>): Promise<T>;
    /** Delete a record by id. */
    delete(table: string, id: UUID): Promise<void>;
    /** Raw query — last resort, prefer typed repositories. */
    raw(sql: string, params?: unknown[]): Promise<unknown[]>;
}
//# sourceMappingURL=repository.d.ts.map