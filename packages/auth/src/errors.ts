/**
 * Shared auth error factory — extracted to avoid circular imports between
 * cloud-auth.ts and operational-auth.ts.
 */

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'EMAIL_ALREADY_EXISTS'
  | 'USER_NOT_FOUND'
  | 'WEAK_PASSWORD'
  | 'VERIFICATION_EXPIRED'
  | 'VERIFICATION_INVALID'
  | 'RESET_EXPIRED'
  | 'RESET_INVALID'
  | 'DEVICE_NOT_TRUSTED'
  | 'SESSION_REVOKED'
  | 'NETWORK_OFFLINE'
  | 'RATE_LIMITED'
  | 'OAUTH_ERROR'
  | 'ENROLLMENT_REQUIRED'
  | 'PIN_VERIFICATION_FAILED'
  | 'PIN_NOT_SET'
  | 'ENROLLMENT_REQUIRED'
  // Cloud session state
  | 'CLOUD_SESSION_STALE'
  // Operational offline policy
  | 'OFFLINE_ENTITLEMENT_EXPIRED'
  // Enrollment token errors
  | 'ENROLLMENT_TOKEN_EXPIRED'
  | 'ENROLLMENT_TOKEN_CONSUMED'
  | 'ENROLLMENT_TOKEN_REPLAY'
  | 'ENROLLMENT_TOKEN_SCOPE_MISMATCH'
  // PIN recovery
  | 'PIN_RECOVERY_REQUIRED'
  | 'RECOVERY_CODE_INVALID'
  | 'RECOVERY_RATE_LIMITED'
  // Passwordless challenge
  | 'INVALID_CHALLENGE_CODE'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_INVALID_PURPOSE'
  | 'CHALLENGE_MAX_ATTEMPTS'
  | 'CHALLENGE_COOLDOWN'
  | 'UNKNOWN'

export interface AuthError {
  code: AuthErrorCode
  message: string
  retryAfterMs?: number
}

export const authError = (code: AuthErrorCode, message: string, retryAfterMs?: number): AuthError => ({
  code,
  message,
  ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
})
