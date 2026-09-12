/**
 * MockAuthApiClient — in-memory implementation of AuthApiClient for SDK tests.
 *
 * Returns success responses by default. Methods can be spy targets.
 * Configure responses by setting the `mock` property before calling.
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
} from './cloud-auth.js'
import type { ISO8601 } from '@soostori/core'

export interface MockAuthApiClientConfig {
  exchangeGoogleCode?: (code: string, codeVerifier: string, redirectUri: string) => AuthApiResponse<GoogleSignInResult>
  signInWithIdToken?: (clientName: string, idToken: string) => AuthApiResponse<GoogleSignInResult>
  registerEmail?: (email: string, password: string, name: string) => AuthApiResponse<EmailRegistrationResult>
  verifyEmail?: (token: string) => AuthApiResponse<EmailVerificationResult>
  requestPasswordReset?: (email: string) => AuthApiResponse<PasswordResetRequestResult>
  completePasswordReset?: (token: string, newPassword: string) => AuthApiResponse<PasswordResetCompleteResult>
  signInEmail?: (email: string, password: string) => AuthApiResponse<SignInResult>
  refreshSession?: (refreshToken: string) => AuthApiResponse<SessionRefreshResult>
  revokeSession?: (accessToken: string) => AuthApiResponse<void>
  registerTrustedDevice?: (deviceToken: string, deviceName: string, accessToken: string) => AuthApiResponse<TrustedDeviceResult>
  listTrustedDevices?: (accessToken: string) => AuthApiResponse<TrustedDevice[]>
  removeTrustedDevice?: (deviceId: string, accessToken: string) => AuthApiResponse<void>
  getDeviceStatus?: (shopId: string, deviceId: string) => AuthApiResponse<{ exists: boolean; hasPin: boolean }>
  createDeviceEnrollment?: (shopId: string, deviceId: string, deviceName: string) => AuthApiResponse<{ deviceId: string; hasPin: boolean }>
  verifyPinForEnrollment?: (employeeId: string, pinProof: string, shopId: string, deviceId: string) => AuthApiResponse<{ enrollmentToken: string; expiresAt: ISO8601 }>
  consumeEnrollmentToken?: (params: { enrollmentToken: string; employeeId: string; shopId: string; deviceId: string; newPinVerifier: string; newPinSalt: string }) => AuthApiResponse<{ success: true }>
  changePin?: (params: { employeeId: string; shopId: string; deviceId: string; oldPinProof: string; newPinVerifier: string; newPinSalt: string }) => AuthApiResponse<{ success: true }>
  requestPinRecovery?: (employeeId: string) => AuthApiResponse<{ cooldownSeconds: number }>
  verifyPinRecoveryCode?: (employeeId: string, code: string) => AuthApiResponse<{ recoveryAuthToken: string; expiresAt: ISO8601 }>
  resetPin?: (params: { recoveryAuthToken: string; employeeId: string; newPinVerifier: string; newPinSalt: string }) => AuthApiResponse<{ success: true }>
  listEnrolledDevices?: (employeeId: string, shopId: string) => AuthApiResponse<Array<{ deviceId: string; deviceName: string; deviceType: string; hasPin: boolean; lastSeenAt: string | null; authorizedAt: string | null }>>
  revokeDevice?: (employeeId: string, deviceId: string) => AuthApiResponse<{ success: true }>
  getSubscriptionStatus?: (shopId: string) => AuthApiResponse<{ status: 'active' | 'past_due' | 'expired' | 'cancelled' | 'trialing'; planKey: string; deviceLimit: number; currentPeriodEnd: string; currentDeviceCount: number }>
  createEnrollmentToken?: (params: { employeeId: string; deviceId: string }) => AuthApiResponse<{ token: string; expiresAt: ISO8601 }>
  consumeEnrollmentTokenForDevice?: (params: { token: string }) => AuthApiResponse<{ employeeId: string; deviceId: string }>
}

const ok = <T>(data: T): Promise<AuthApiResponse<T>> => Promise.resolve({ data })

export class MockAuthApiClient implements AuthApiClient {
  mock: MockAuthApiClientConfig = {}

  async exchangeGoogleCode(code: string, codeVerifier: string, redirectUri: string): Promise<AuthApiResponse<GoogleSignInResult>> {
    return this.mock.exchangeGoogleCode
      ? this.mock.exchangeGoogleCode(code, codeVerifier, redirectUri)
      : ok({ userId: 'user-1', email: 'test@test.com', idToken: '', accessToken: 'tok', isNewUser: false } as GoogleSignInResult)
  }

  async linkGoogleAccount(idToken: string, sessionAccessToken: string): Promise<AuthApiResponse<GoogleSignInResult>> {
    return this.mock.signInWithIdToken
      ? this.mock.signInWithIdToken('', idToken)
      : ok({ userId: 'user-1', email: 'test@test.com', idToken, accessToken: 'tok', isNewUser: false } as GoogleSignInResult)
  }

  async signInWithIdToken(clientName: string, idToken: string): Promise<AuthApiResponse<GoogleSignInResult>> {
    return this.mock.signInWithIdToken
      ? this.mock.signInWithIdToken(clientName, idToken)
      : ok({ userId: 'user-1', email: 'test@test.com', idToken, accessToken: 'tok', isNewUser: false } as GoogleSignInResult)
  }

  async registerEmail(email: string, password: string, employeeName: string): Promise<AuthApiResponse<EmailRegistrationResult>> {
    return this.mock.registerEmail
      ? this.mock.registerEmail(email, password, employeeName)
      : ok({ userId: 'user-1', email, requiresEmailVerification: true } as EmailRegistrationResult)
  }

  async verifyEmail(token: string): Promise<AuthApiResponse<EmailVerificationResult>> {
    return this.mock.verifyEmail
      ? this.mock.verifyEmail(token)
      : ok({ userId: 'user-1', email: 'test@test.com', isEmailVerified: true } as EmailVerificationResult)
  }

  async requestPasswordReset(email: string): Promise<AuthApiResponse<PasswordResetRequestResult>> {
    return this.mock.requestPasswordReset
      ? this.mock.requestPasswordReset(email)
      : ok({ email, resetLinkSent: true } as PasswordResetRequestResult)
  }

  async completePasswordReset(token: string, newPassword: string): Promise<AuthApiResponse<PasswordResetCompleteResult>> {
    return this.mock.completePasswordReset
      ? this.mock.completePasswordReset(token, newPassword)
      : ok({ userId: 'user-1', email: 'test@test.com', accessToken: 'tok', refreshToken: 'ref' } as PasswordResetCompleteResult)
  }

  async signInEmail(email: string, password: string): Promise<AuthApiResponse<SignInResult>> {
    return this.mock.signInEmail
      ? this.mock.signInEmail(email, password)
      : ok({ userId: 'user-1', employeeId: 'emp-1', email, accessToken: 'tok', refreshToken: 'ref', expiresAt: '' as ISO8601, isEmailVerified: true, session: {} as any } as SignInResult)
  }

  async refreshSession(refreshToken: string): Promise<AuthApiResponse<SessionRefreshResult>> {
    return this.mock.refreshSession
      ? this.mock.refreshSession(refreshToken)
      : ok({ session: {} as any, accessToken: 'tok', expiresAt: '' as ISO8601 } as SessionRefreshResult)
  }

  async revokeSession(accessToken: string): Promise<AuthApiResponse<void>> {
    return this.mock.revokeSession
      ? this.mock.revokeSession(accessToken)
      : ok(undefined)
  }

  async registerTrustedDevice(deviceToken: string, deviceName: string, accessToken: string): Promise<AuthApiResponse<TrustedDeviceResult>> {
    return this.mock.registerTrustedDevice
      ? this.mock.registerTrustedDevice(deviceToken, deviceName, accessToken)
      : ok({ device: { deviceId: 'dev-1', deviceName, registeredAt: '' as ISO8601, lastUsedAt: '' as ISO8601, isAutoApproved: false }, deviceToken: 'tok' } as TrustedDeviceResult)
  }

  async listTrustedDevices(accessToken: string): Promise<AuthApiResponse<TrustedDevice[]>> {
    return this.mock.listTrustedDevices
      ? this.mock.listTrustedDevices(accessToken)
      : ok([])
  }

  async removeTrustedDevice(deviceId: string, accessToken: string): Promise<AuthApiResponse<void>> {
    return this.mock.removeTrustedDevice
      ? this.mock.removeTrustedDevice(deviceId, accessToken)
      : ok(undefined)
  }

  async getDeviceStatus(shopId: string, deviceId: string): Promise<AuthApiResponse<{ exists: boolean; hasPin: boolean }>> {
    return this.mock.getDeviceStatus
      ? this.mock.getDeviceStatus(shopId, deviceId)
      : ok({ exists: false, hasPin: false })
  }

  async createDeviceEnrollment(shopId: string, deviceId: string, deviceName: string): Promise<AuthApiResponse<{ deviceId: string; hasPin: boolean }>> {
    return this.mock.createDeviceEnrollment
      ? this.mock.createDeviceEnrollment(shopId, deviceId, deviceName)
      : ok({ deviceId, hasPin: false })
  }

  async verifyPinForEnrollment(employeeId: string, pinProof: string, shopId: string, deviceId: string): Promise<AuthApiResponse<{ enrollmentToken: string; expiresAt: ISO8601 }>> {
    return this.mock.verifyPinForEnrollment
      ? this.mock.verifyPinForEnrollment(employeeId, pinProof, shopId, deviceId)
      : ok({ enrollmentToken: 'tok', expiresAt: new Date().toISOString() as ISO8601 })
  }

  async consumeEnrollmentToken(params: { enrollmentToken: string; employeeId: string; shopId: string; deviceId: string; newPinVerifier: string; newPinSalt: string }): Promise<AuthApiResponse<{ success: true }>> {
    return this.mock.consumeEnrollmentToken
      ? this.mock.consumeEnrollmentToken(params)
      : ok({ success: true })
  }

  async changePin(params: { employeeId: string; shopId: string; deviceId: string; oldPinProof: string; newPinVerifier: string; newPinSalt: string }): Promise<AuthApiResponse<{ success: true }>> {
    return this.mock.changePin
      ? this.mock.changePin(params)
      : ok({ success: true })
  }

  async requestPinRecovery(employeeId: string): Promise<AuthApiResponse<{ cooldownSeconds: number }>> {
    return this.mock.requestPinRecovery
      ? this.mock.requestPinRecovery(employeeId)
      : ok({ cooldownSeconds: 60 })
  }

  async verifyPinRecoveryCode(employeeId: string, code: string): Promise<AuthApiResponse<{ recoveryAuthToken: string; expiresAt: ISO8601 }>> {
    return this.mock.verifyPinRecoveryCode
      ? this.mock.verifyPinRecoveryCode(employeeId, code)
      : ok({ recoveryAuthToken: 'rec-tok', expiresAt: new Date().toISOString() as ISO8601 })
  }

  async resetPin(params: { recoveryAuthToken: string; employeeId: string; newPinVerifier: string; newPinSalt: string }): Promise<AuthApiResponse<{ success: true }>> {
    return this.mock.resetPin
      ? this.mock.resetPin(params)
      : ok({ success: true })
  }

  async listEnrolledDevices(employeeId: string, shopId: string): Promise<AuthApiResponse<Array<{ deviceId: string; deviceName: string; deviceType: string; hasPin: boolean; lastSeenAt: string | null; authorizedAt: string | null }>>> {
    return this.mock.listEnrolledDevices
      ? this.mock.listEnrolledDevices(employeeId, shopId)
      : ok([])
  }

  async revokeDevice(employeeId: string, deviceId: string): Promise<AuthApiResponse<{ success: true }>> {
    return this.mock.revokeDevice
      ? this.mock.revokeDevice(employeeId, deviceId)
      : ok({ success: true })
  }

  async getSubscriptionStatus(shopId: string): Promise<AuthApiResponse<{ status: 'active' | 'past_due' | 'expired' | 'cancelled' | 'trialing'; planKey: string; deviceLimit: number; currentPeriodEnd: string; currentDeviceCount: number }>> {
    return this.mock.getSubscriptionStatus
      ? this.mock.getSubscriptionStatus(shopId)
      : ok({ status: 'active', planKey: 'pro', deviceLimit: 5, currentPeriodEnd: '', currentDeviceCount: 1 })
  }

  async createEnrollmentToken(params: { employeeId: string; deviceId: string }): Promise<AuthApiResponse<{ token: string; expiresAt: ISO8601 }>> {
    return this.mock.createEnrollmentToken
      ? this.mock.createEnrollmentToken(params)
      : ok({ token: 'enroll-tok', expiresAt: new Date().toISOString() as ISO8601 })
  }

  async consumeEnrollmentTokenForDevice(params: { token: string }): Promise<AuthApiResponse<{ employeeId: string; deviceId: string }>> {
    return this.mock.consumeEnrollmentTokenForDevice
      ? this.mock.consumeEnrollmentTokenForDevice(params)
      : ok({ employeeId: 'emp-1', deviceId: 'dev-1' })
  }
}
