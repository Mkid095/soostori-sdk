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
/** Serialize session for storage. */
export function serializeSession(session) {
    return JSON.stringify(session);
}
/** Deserialize session from storage. */
export function deserializeSession(data) {
    try {
        const obj = JSON.parse(data);
        if (!obj.userId || !obj.shopId || !obj.expiresAt)
            return null;
        return obj;
    }
    catch {
        return null;
    }
}
/** Check if session is expired. */
export function isSessionExpired(session, now = new Date()) {
    return new Date(session.expiresAt).getTime() <= now.getTime();
}
/** Check if session will expire within the next N hours. */
export function isSessionExpiringSoon(session, hours = 24, now = new Date()) {
    const expiry = new Date(session.expiresAt).getTime();
    const cutoff = now.getTime() + hours * 60 * 60 * 1000;
    return expiry <= cutoff;
}
/** Standard storage helper. */
export async function loadSession(storage, key = 'soostori:session') {
    const raw = await storage.get(key);
    if (!raw)
        return null;
    const session = deserializeSession(raw);
    if (!session)
        return null;
    if (isSessionExpired(session)) {
        await storage.delete(key);
        return null;
    }
    return session;
}
export async function saveSession(storage, session, key = 'soostori:session') {
    await storage.set(key, serializeSession(session));
}
export async function clearSession(storage, key = 'soostori:session') {
    await storage.delete(key);
}
//# sourceMappingURL=session.js.map