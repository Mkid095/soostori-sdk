/**
 * SDK error types — cross-platform error contract.
 */
export class SoostoriError extends Error {
    code;
    cause;
    constructor(code, message, cause) {
        super(message);
        this.name = 'SoostoriError';
        this.code = code;
        if (cause !== undefined)
            this.cause = cause;
    }
}
export class AuthError extends SoostoriError {
    constructor(message, code = 'AUTH_FAILED', cause) {
        super(code, message, cause);
        this.name = 'AuthError';
    }
}
export class ValidationError extends SoostoriError {
    details;
    constructor(message, code = 'VALIDATION_FAILED', details, cause) {
        super(code, message, cause);
        this.name = 'ValidationError';
        this.details = details;
    }
}
export class CloudError extends SoostoriError {
    httpStatus;
    constructor(message, code = 'CLOUD_ERROR', httpStatus, cause) {
        super(code, message, cause);
        this.name = 'CloudError';
        if (httpStatus !== undefined)
            this.httpStatus = httpStatus;
    }
}
export class SyncError extends SoostoriError {
    constructor(message, code = 'SYNC_FAILED', cause) {
        super(code, message, cause);
        this.name = 'SyncError';
    }
}
export class SubscriptionError extends SoostoriError {
    constructor(message, code = 'SUBSCRIPTION_EXPIRED', cause) {
        super(code, message, cause);
        this.name = 'SubscriptionError';
    }
}
export class NetworkError extends SoostoriError {
    constructor(message, code = 'NETWORK_UNAVAILABLE', cause) {
        super(code, message, cause);
        this.name = 'NetworkError';
    }
}
//# sourceMappingURL=errors.js.map