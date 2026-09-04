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

import type { AuthSession } from '@soostori/core'

/** Serialize session for storage. */
export function serializeSession(session: AuthSession): string {
  return JSON.stringify(session)
}

/** Deserialize session from storage. */
export function deserializeSession(data: string): AuthSession | null {
  try {
    const obj = JSON.parse(data) as AuthSession
    if (!obj.userId || !obj.shopId || !obj.expiresAt) return null
    return obj
  } catch {
    return null
  }
}

/** Check if session is expired. */
export function isSessionExpired(session: AuthSession, now = new Date()): boolean {
  return new Date(session.expiresAt).getTime() <= now.getTime()
}

/** Check if session will expire within the next N hours. */
export function isSessionExpiringSoon(session: AuthSession, hours = 24, now = new Date()): boolean {
  const expiry = new Date(session.expiresAt).getTime()
  const cutoff = now.getTime() + hours * 60 * 60 * 1000
  return expiry <= cutoff
}

/** Storage interface — implemented per platform. */
export interface SessionStorage {
  get(key: string): string | null | Promise<string | null>
  set(key: string, value: string): void | Promise<void>
  delete(key: string): void | Promise<void>
}

/** Standard storage helper. */
export async function loadSession(storage: SessionStorage, key = 'soostori:session'): Promise<AuthSession | null> {
  const raw = await storage.get(key)
  if (!raw) return null
  const session = deserializeSession(raw)
  if (!session) return null
  if (isSessionExpired(session)) {
    await storage.delete(key)
    return null
  }
  return session
}

export async function saveSession(storage: SessionStorage, session: AuthSession, key = 'soostori:session'): Promise<void> {
  await storage.set(key, serializeSession(session))
}

export async function clearSession(storage: SessionStorage, key = 'soostori:session'): Promise<void> {
  await storage.delete(key)
}
