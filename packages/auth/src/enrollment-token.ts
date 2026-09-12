/**
 * Enrollment Token Service — specification and types.
 *
 * ## Storage
 *
 * Enrollment tokens are stored in the **Next.js PostgreSQL backend**, NOT in FIDScript.
 * They are short-lived, scoped, single-use, and atomically consumed.
 *
 * ## Token Properties
 *
 * | Property | Value |
 * |---|---|
 * | Lifetime | 5 minutes (configurable) |
 * | Scope | employeeId + deviceId (immutable) |
 * | Reuse | Single-use — atomically deleted on consumption |
 * | Encryption | AES-256-GCM server-side key |
 *
 * ## Flow
 *
 * ```
 * 1. Owner generates token via CloudAuth.createEnrollmentToken(employeeId, deviceId)
 *      → POST /api/commercial/enrollment-token
 *      → Backend: creates token in PostgreSQL, returns { token, expiresAt }
 *
 * 2. New device polls / waits for token via:
 *      → GET /api/commercial/enrollment-token/:employeeId
 *
 * 3. Device uses token in PIN setup:
 *      → POST /api/auth/devices/pin/consume-with-token
 *      → Backend: validates token + not expired + not consumed,
 *         atomically consumes it, stores canonical PIN verifier,
 *         marks Device.hasPin=true in FIDScript
 *
 * 4. On failure: backend returns specific error code
 *      (EXPIRED, CONSUMED, REPLAY, SCOPE_MISMATCH)
 * ```
 *
 * ## Backend Route Handler Specification
 *
 * ### POST /api/commercial/enrollment-token
 *
 * **Auth:** Requires active CloudAuth session (owner only)
 *
 * **Request body:**
 * ```json
 * { "employeeId": "emp-xxx", "deviceId": "dev-xxx", "expiresInMinutes": 5 }
 * ```
 *
 * **Response (201):**
 * ```json
 * { "data": { "token": "enc-xxx", "expiresAt": "2025-01-01T00:05:00.000Z" } }
 * ```
 *
 * **Errors:**
 * - 401 Unauthorized
 * - 400 Invalid request
 * - 429 Rate limited (>5 tokens/minute per employee)
 *
 * ### GET /api/commercial/enrollment-token/:employeeId
 *
 * **Auth:** Requires active CloudAuth session
 *
 * **Response (200):**
 * ```json
 * { "data": { "token": "enc-xxx", "expiresAt": "...", "status": "pending" | "consumed" | "expired" } }
 * ```
 *
 * **Errors:**
 * - 401 Unauthorized
 * - 404 No token found for this employee
 *
 * ### POST /api/auth/devices/pin/consume-with-token
 *
 * **Auth:** None (token is the auth factor)
 *
 * **Request body:**
 * ```json
 * {
 *   "enrollmentToken": "enc-xxx",
 *   "employeeId": "emp-xxx",
 *   "deviceId": "dev-xxx",
 *   "newPinVerifier": "hex-xxx",
 *   "newPinSalt": "hex-xxx"
 * }
 * ```
 *
 * **Response (200):**
 * ```json
 * { "data": { "success": true } }
 * ```
 *
 * **Errors:**
 * - 400 ENROLLMENT_TOKEN_EXPIRED
 * - 400 ENROLLMENT_TOKEN_CONSUMED
 * - 400 ENROLLMENT_TOKEN_REPLAY
 * - 400 ENROLLMENT_TOKEN_SCOPE_MISMATCH
 * - 429 Rate limited
 */

import type { EmployeeId, DeviceId, ISO8601 } from '@soostori/core'

/** Enrollment token status. */
export type EnrollmentTokenStatus = 'pending' | 'consumed' | 'expired'

/**
 * An enrollment token — short-lived credential for new device PIN enrollment.
 *
 * Stored in the Next.js PostgreSQL backend. NOT stored in FIDScript.
 */
export interface EnrollmentToken {
  token: string
  employeeId: EmployeeId
  deviceId: DeviceId
  expiresAt: ISO8601
  status: EnrollmentTokenStatus
}

/** Input for creating an enrollment token. */
export interface CreateEnrollmentTokenInput {
  employeeId: EmployeeId
  deviceId: DeviceId
  /**
   * Token lifetime in minutes. Default: 5.
   * Backend should cap at 10 minutes maximum.
   */
  expiresInMinutes?: number
}

/**
 * Input for consuming an enrollment token to set up a new device PIN.
 */
export interface ConsumeEnrollmentTokenInput {
  /** The enrollment token from createEnrollmentToken. */
  enrollmentToken: string
  employeeId: EmployeeId
  deviceId: DeviceId
  /**
   * PBKDF2 verifier for the new PIN — set as the canonical verifier
   * for this employee (stored server-side for cross-device proofs).
   */
  newPinVerifier: string
  newPinSalt: string
}
