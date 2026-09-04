/**
 * SDK error types — cross-platform error contract.
 */

export class SoostoriError extends Error {
  readonly code: string
  readonly cause?: unknown
  constructor(code: string, message: string, cause?: unknown) {
    super(message)
    this.name = 'SoostoriError'
    this.code = code
    if (cause !== undefined) this.cause = cause
  }
}

export class AuthError extends SoostoriError {
  constructor(message: string, code = 'AUTH_FAILED', cause?: unknown) {
    super(code, message, cause)
    this.name = 'AuthError'
  }
}

export class ValidationError extends SoostoriError {
  readonly details?: unknown
  constructor(message: string, code = 'VALIDATION_FAILED', details?: unknown, cause?: unknown) {
    super(code, message, cause)
    this.name = 'ValidationError'
    this.details = details
  }
}

export class CloudError extends SoostoriError {
  readonly httpStatus?: number
  constructor(message: string, code = 'CLOUD_ERROR', httpStatus?: number, cause?: unknown) {
    super(code, message, cause)
    this.name = 'CloudError'
    if (httpStatus !== undefined) this.httpStatus = httpStatus
  }
}

export class SyncError extends SoostoriError {
  constructor(message: string, code = 'SYNC_FAILED', cause?: unknown) {
    super(code, message, cause)
    this.name = 'SyncError'
  }
}

export class SubscriptionError extends SoostoriError {
  constructor(message: string, code = 'SUBSCRIPTION_EXPIRED', cause?: unknown) {
    super(code, message, cause)
    this.name = 'SubscriptionError'
  }
}

export class NetworkError extends SoostoriError {
  constructor(message: string, code = 'NETWORK_UNAVAILABLE', cause?: unknown) {
    super(code, message, cause)
    this.name = 'NetworkError'
  }
}
