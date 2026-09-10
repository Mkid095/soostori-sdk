/**
 * Soostori SDK constants.
 */

export const SDK_VERSION = '0.1.0' as const

/** Cloud app ID — canonical Soostori FIDScript app ID (shared by Mobile, Desktop, Web, SDK). */
export const CLOUD_APP_ID = '487be5c5-7615-4bbd-b3b7-3aa97154ca99' as const

/** Self-hosted FIDScript REST API base. */
export const FIDSCRIPT_API_BASE = 'https://apiinstant.fidscript.com' as const

/** LAN discovery broadcast port. */
export const DISCOVERY_PORT = 18793

/** LAN WebSocket sync port. */
export const LAN_SYNC_PORT = 18792

/** Magic-code length. */
export const MAGIC_CODE_LENGTH = 6

/** Invitation code length. */
export const INVITATION_CODE_LENGTH = 6

/** Invitation code expiry hours. */
export const INVITATION_EXPIRY_HOURS = 24

/** Subscription grace period (days) when offline. */
export const OFFLINE_GRACE_DAYS = 3

/** PIN length (employees). */
export const EMPLOYEE_PIN_LENGTH = 4

/** PBKDF2 iterations for PIN hashing. */
export const PIN_PBKDF2_ITERATIONS = 100_000

/** Default employee role for new signups. */
export const DEFAULT_EMPLOYEE_ROLE: 'attendant' = 'attendant'

/** Subscription verification check interval (ms). */
export const SUBSCRIPTION_CHECK_INTERVAL_MS = 60 * 60 * 1000  // 1 hour

/** Cloud sync background cycle interval (ms). */
export const SYNC_CYCLE_INTERVAL_MS = 2 * 60 * 1000  // 2 minutes

/** Heartbeat interval (ms). */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes

/** Primary device heartbeat freshness window. */
export const PRIMARY_HEARTBEAT_FRESH_MS = 15_000

/** Primary device lost grace period (ms). */
export const PRIMARY_LOST_GRACE_MS = 60_000

/** Add milliseconds to ISO timestamp. */
export function addMilliseconds(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString()
}

/**
 * Contact phone shown to a person who authenticated successfully but has no
 * business membership in the system (the §29 "person not found" UX).
 * Mobile, Web, and Desktop must read this constant rather than hardcoding it.
 */
export const UNAUTHORIZED_LOGIN_CONTACT_PHONE = '+254 732 203 353'
