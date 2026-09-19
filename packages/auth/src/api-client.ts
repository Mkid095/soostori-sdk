/**
 * HttpAuthApiClient — Next.js Route Handler backend implementation of AuthApiClient.
 *
 * All communication with the auth backend is via HTTP to the Next.js API routes.
 * This client does NOT parse JWTs, manage tokens, or implement any auth logic — it
 * only translates the typed AuthApiClient interface into HTTP requests/responses.
 *
 * Route handlers (backend team implements):
 *   POST /api/auth/google/exchange          — exchangeGoogleCode
 *   POST /api/auth/google/link             — linkGoogleAccount
 *   POST /api/auth/id-token                — signInWithIdToken
 *   POST /api/auth/register                — registerEmail
 *   POST /api/auth/verify-email            — verifyEmail
 *   POST /api/auth/password/reset/request  — requestPasswordReset
 *   POST /api/auth/password/reset/complete — completePasswordReset
 *   POST /api/auth/signin                  — signInEmail
 *   POST /api/auth/session/refresh         — refreshSession
 *   POST /api/auth/session/revoke          — revokeSession
 *   POST /api/auth/devices/trusted         — registerTrustedDevice
 *   GET  /api/auth/devices/trusted         — listTrustedDevices
 *   DELETE /api/auth/devices/trusted/:id   — removeTrustedDevice
 *   GET  /api/auth/devices/status          — getDeviceStatus
 *   POST /api/auth/devices/enroll          — createDeviceEnrollment
 *   POST /api/auth/devices/pin/verify      — verifyPinForEnrollment
 *   POST /api/auth/devices/pin/consume     — consumeEnrollmentToken
 *   POST /api/auth/devices/pin/change      — changePin
 *   POST /api/auth/devices/pin/recovery/request — requestPinRecovery
 *   POST /api/auth/devices/pin/recovery/verify  — verifyPinRecoveryCode
 *   POST /api/auth/devices/pin/recovery/reset   — resetPin
 *   GET  /api/auth/devices                 — listEnrolledDevices
 *   DELETE /api/auth/devices/:id           — revokeDevice
 *   GET  /api/subscriptions/status          — getSubscriptionStatus
 *   POST /api/commercial/enrollment-token  — createEnrollmentToken
 *   POST /api/commercial/enrollment-token/consume — consumeEnrollmentToken
 */

import type {
  AuthApiClient,
  AuthApiResponse,
  GoogleSignInResult,
  EmailRegistrationResult,
  EmailVerificationResult,
  PasswordResetRequestResult,
  PasswordResetCompleteResult,
  SignInResult,
  SessionRefreshResult,
  TrustedDevice,
  TrustedDeviceResult,
  PasswordlessPurpose,
} from './cloud-auth.js'
import type { ISO8601 } from '@soostori/core'

export interface AuthApiClientConfig {
  baseUrl: string
  fetch: typeof fetch
}

async function apiFetch<T>(
  fetch: typeof globalThis.fetch,
  url: string,
  init?: RequestInit,
): Promise<AuthApiResponse<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers as Record<string, string> ?? {}),
      },
    })
    return await res.json() as AuthApiResponse<T>
  } catch (err) {
    return {
      error: {
        code: 'NETWORK_ERROR',
        message: String(err),
      },
    }
  }
}

export class HttpAuthApiClient implements AuthApiClient {
  constructor(private config: AuthApiClientConfig) {}

  private get fetch(): typeof globalThis.fetch {
    return this.config.fetch ?? globalThis.fetch
  }

  private post<T>(path: string, body: unknown): Promise<AuthApiResponse<T>> {
    return apiFetch<T>(this.fetch, `${this.config.baseUrl}${path}`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  private get<T>(path: string): Promise<AuthApiResponse<T>> {
    return apiFetch<T>(this.fetch, `${this.config.baseUrl}${path}`)
  }

  private delete<T>(path: string): Promise<AuthApiResponse<T>> {
    return apiFetch<T>(this.fetch, `${this.config.baseUrl}${path}`, {
      method: 'DELETE',
    })
  }

  // ── Google OAuth ─────────────────────────────────────────────────────

  exchangeGoogleCode(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<AuthApiResponse<GoogleSignInResult>> {
    return this.post<GoogleSignInResult>('/api/auth/google/exchange', {
      code,
      codeVerifier,
      redirectUri,
    })
  }

  linkGoogleAccount(
    idToken: string,
    sessionAccessToken: string,
  ): Promise<AuthApiResponse<GoogleSignInResult>> {
    return this.post<GoogleSignInResult>('/api/auth/google/link', {
      idToken,
      sessionAccessToken,
    })
  }

  signInWithIdToken(
    clientName: string,
    idToken: string,
  ): Promise<AuthApiResponse<GoogleSignInResult>> {
    return this.post<GoogleSignInResult>('/api/auth/id-token', {
      clientName,
      idToken,
    })
  }

  // ── Email/password ────────────────────────────────────────────────────

  registerEmail(
    email: string,
    password: string,
    employeeName: string,
  ): Promise<AuthApiResponse<EmailRegistrationResult>> {
    return this.post<EmailRegistrationResult>('/api/auth/register', {
      email,
      password,
      employeeName,
    })
  }

  verifyEmail(
    token: string,
  ): Promise<AuthApiResponse<EmailVerificationResult>> {
    return this.post<EmailVerificationResult>('/api/auth/verify-email', { token })
  }

  requestPasswordReset(
    email: string,
  ): Promise<AuthApiResponse<PasswordResetRequestResult>> {
    return this.post<PasswordResetRequestResult>('/api/auth/password/reset/request', { email })
  }

  completePasswordReset(
    token: string,
    newPassword: string,
  ): Promise<AuthApiResponse<PasswordResetCompleteResult>> {
    return this.post<PasswordResetCompleteResult>('/api/auth/password/reset/complete', {
      token,
      newPassword,
    })
  }

  signInEmail(
    email: string,
    password: string,
  ): Promise<AuthApiResponse<SignInResult>> {
    return this.post<SignInResult>('/api/auth/signin', { email, password })
  }

  // ── Session management ───────────────────────────────────────────────

  refreshSession(
    refreshToken: string,
  ): Promise<AuthApiResponse<SessionRefreshResult>> {
    return this.post<SessionRefreshResult>('/api/auth/session/refresh', { refreshToken })
  }

  revokeSession(
    accessToken: string,
  ): Promise<AuthApiResponse<void>> {
    return this.post<void>('/api/auth/session/revoke', { accessToken })
  }

  // ── Trusted devices ───────────────────────────────────────────────────

  registerTrustedDevice(
    deviceToken: string,
    deviceName: string,
    accessToken: string,
  ): Promise<AuthApiResponse<TrustedDeviceResult>> {
    return this.post<TrustedDeviceResult>('/api/auth/devices/trusted', {
      deviceToken,
      deviceName,
      accessToken,
    })
  }

  listTrustedDevices(
    accessToken: string,
  ): Promise<AuthApiResponse<TrustedDevice[]>> {
    return this.get<TrustedDevice[]>(`/api/auth/devices/trusted?accessToken=${accessToken}`)
  }

  removeTrustedDevice(
    deviceId: string,
    accessToken: string,
  ): Promise<AuthApiResponse<void>> {
    return this.delete<void>(`/api/auth/devices/trusted/${deviceId}?accessToken=${accessToken}`)
  }

  // ── Device enrollment ─────────────────────────────────────────────────

  getDeviceStatus(
    shopId: string,
    deviceId: string,
  ): Promise<AuthApiResponse<{ exists: boolean; hasPin: boolean }>> {
    return this.get<{ exists: boolean; hasPin: boolean }>(
      `/api/auth/devices/status?shopId=${shopId}&deviceId=${deviceId}`,
    )
  }

  createDeviceEnrollment(
    shopId: string,
    deviceId: string,
    deviceName: string,
  ): Promise<AuthApiResponse<{ deviceId: string; hasPin: boolean }>> {
    return this.post<{ deviceId: string; hasPin: boolean }>('/api/auth/devices/enroll', {
      shopId,
      deviceId,
      deviceName,
    })
  }

  verifyPinForEnrollment(
    employeeId: string,
    pinProof: string,
    shopId: string,
    deviceId: string,
  ): Promise<AuthApiResponse<{ enrollmentToken: string; expiresAt: ISO8601 }>> {
    return this.post<{ enrollmentToken: string; expiresAt: ISO8601 }>('/api/auth/devices/pin/verify', {
      employeeId,
      pinProof,
      shopId,
      deviceId,
    })
  }

  consumeEnrollmentToken(params: {
    enrollmentToken: string
    employeeId: string
    shopId: string
    deviceId: string
    newPinVerifier: string
    newPinSalt: string
  }): Promise<AuthApiResponse<{ success: true }>> {
    return this.post<{ success: true }>('/api/auth/devices/pin/consume', params)
  }

  changePin(params: {
    employeeId: string
    shopId: string
    deviceId: string
    oldPinProof: string
    newPinVerifier: string
    newPinSalt: string
  }): Promise<AuthApiResponse<{ success: true }>> {
    return this.post<{ success: true }>('/api/auth/devices/pin/change', params)
  }

  // ── PIN recovery ─────────────────────────────────────────────────────

  requestPinRecovery(
    employeeId: string,
  ): Promise<AuthApiResponse<{ cooldownSeconds: number }>> {
    return this.post<{ cooldownSeconds: number }>('/api/auth/devices/pin/recovery/request', {
      employeeId,
    })
  }

  verifyPinRecoveryCode(
    employeeId: string,
    code: string,
  ): Promise<AuthApiResponse<{ recoveryAuthToken: string; expiresAt: ISO8601 }>> {
    return this.post<{ recoveryAuthToken: string; expiresAt: ISO8601 }>(
      '/api/auth/devices/pin/recovery/verify',
      { employeeId, code },
    )
  }

  resetPin(params: {
    recoveryAuthToken: string
    employeeId: string
    newPinVerifier: string
    newPinSalt: string
  }): Promise<AuthApiResponse<{ success: true }>> {
    return this.post<{ success: true }>('/api/auth/devices/pin/recovery/reset', params)
  }

  // ── Device management ────────────────────────────────────────────────

  listEnrolledDevices(
    employeeId: string,
    shopId: string,
  ): Promise<AuthApiResponse<Array<{
    deviceId: string
    deviceName: string
    deviceType: string
    hasPin: boolean
    lastSeenAt: string | null
    authorizedAt: string | null
  }>>> {
    return this.get<Array<{
      deviceId: string
      deviceName: string
      deviceType: string
      hasPin: boolean
      lastSeenAt: string | null
      authorizedAt: string | null
    }>>(`/api/auth/devices?employeeId=${employeeId}&shopId=${shopId}`)
  }

  revokeDevice(
    employeeId: string,
    deviceId: string,
  ): Promise<AuthApiResponse<{ success: true }>> {
    return this.delete<{ success: true }>(`/api/auth/devices/${deviceId}?employeeId=${employeeId}`)
  }

  // ── Subscriptions ────────────────────────────────────────────────────

  getSubscriptionStatus(
    shopId: string,
  ): Promise<AuthApiResponse<{
    status: 'active' | 'past_due' | 'expired' | 'cancelled' | 'trialing'
    planKey: string
    deviceLimit: number
    currentPeriodEnd: string
    currentDeviceCount: number
  }>> {
    return this.get<{
      status: 'active' | 'past_due' | 'expired' | 'cancelled' | 'trialing'
      planKey: string
      deviceLimit: number
      currentPeriodEnd: string
      currentDeviceCount: number
    }>(`/api/subscriptions/status?shopId=${shopId}`)
  }

  // ── Commercial / Enrollment tokens ────────────────────────────────────

  createEnrollmentToken(params: {
    employeeId: string
    deviceId: string
  }): Promise<AuthApiResponse<{ token: string; expiresAt: ISO8601 }>> {
    return this.post<{ token: string; expiresAt: ISO8601 }>('/api/commercial/enrollment-token', params)
  }

  consumeEnrollmentTokenForDevice(params: {
    token: string
  }): Promise<AuthApiResponse<{ employeeId: string; deviceId: string }>> {
    return this.post<{ employeeId: string; deviceId: string }>(
      '/api/commercial/enrollment-token/consume',
      params,
    )
  }

  // ── Passwordless challenge ───────────────────────────────────────────────

  requestPasswordlessChallenge(params: {
    email: string
    purpose: PasswordlessPurpose
    codeLength?: number
    expiresInMinutes?: number
  }): Promise<AuthApiResponse<{ expiresAt: string; cooldownSeconds: number }>> {
    return this.post<{ expiresAt: string; cooldownSeconds: number }>(
      '/api/auth/passwordless/challenge',
      params,
    )
  }

  verifyPasswordlessChallenge(params: {
    email: string
    purpose: PasswordlessPurpose
    code: string
  }): Promise<AuthApiResponse<SignInResult>> {
    return this.post<SignInResult>('/api/auth/passwordless/verify', params)
  }
}
