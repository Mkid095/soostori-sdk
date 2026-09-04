/**
 * Session management — cross-platform persistence contract.
 *
 * Sessions can be stored in:
 *   - electron-store (desktop)
 *   - AsyncStorage (mobile)
 *   - localStorage (web)
 *
 * The SDK defines the contract; each platform implements its own persistence.
 */
import type { AuthSession } from '@soostori/core';
/** Serialize session for storage. */
export declare function serializeSession(session: AuthSession): string;
/** Deserialize session from storage. */
export declare function deserializeSession(data: string): AuthSession | null;
/** Check if session is expired. */
export declare function isSessionExpired(session: AuthSession, now?: Date): boolean;
/** Check if session will expire within the next N hours. */
export declare function isSessionExpiringSoon(session: AuthSession, hours?: number, now?: Date): boolean;
/** Storage interface — implemented per platform. */
export interface SessionStorage {
    get(key: string): string | null | Promise<string | null>;
    set(key: string, value: string): void | Promise<void>;
    delete(key: string): void | Promise<void>;
}
/** Standard storage helper. */
export declare function loadSession(storage: SessionStorage, key?: string): Promise<AuthSession | null>;
export declare function saveSession(storage: SessionStorage, session: AuthSession, key?: string): Promise<void>;
export declare function clearSession(storage: SessionStorage, key?: string): Promise<void>;
//# sourceMappingURL=session.d.ts.map