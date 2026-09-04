/**
 * SDK error types — cross-platform error contract.
 */
export declare class SoostoriError extends Error {
    readonly code: string;
    readonly cause?: unknown;
    constructor(code: string, message: string, cause?: unknown);
}
export declare class AuthError extends SoostoriError {
    constructor(message: string, code?: string, cause?: unknown);
}
export declare class ValidationError extends SoostoriError {
    readonly details?: unknown;
    constructor(message: string, code?: string, details?: unknown, cause?: unknown);
}
export declare class CloudError extends SoostoriError {
    readonly httpStatus?: number;
    constructor(message: string, code?: string, httpStatus?: number, cause?: unknown);
}
export declare class SyncError extends SoostoriError {
    constructor(message: string, code?: string, cause?: unknown);
}
export declare class SubscriptionError extends SoostoriError {
    constructor(message: string, code?: string, cause?: unknown);
}
export declare class NetworkError extends SoostoriError {
    constructor(message: string, code?: string, cause?: unknown);
}
//# sourceMappingURL=errors.d.ts.map