/**
 * Soostori SDK constants.
 */
export declare const SDK_VERSION: "0.1.0";
/** Cloud app ID — same value used across all three apps. */
export declare const CLOUD_APP_ID: "0808ca7d-b0ba-4541-8906-48f7d0403950";
/** Self-hosted FIDScript REST API base. */
export declare const FIDSCRIPT_API_BASE: "https://apiinstant.fidscript.com";
/** LAN discovery broadcast port. */
export declare const DISCOVERY_PORT = 18793;
/** LAN WebSocket sync port. */
export declare const LAN_SYNC_PORT = 18792;
/** Magic-code length. */
export declare const MAGIC_CODE_LENGTH = 6;
/** Invitation code length. */
export declare const INVITATION_CODE_LENGTH = 6;
/** Invitation code expiry hours. */
export declare const INVITATION_EXPIRY_HOURS = 24;
/** Subscription grace period (days) when offline. */
export declare const OFFLINE_GRACE_DAYS = 3;
/** PIN length (employees). */
export declare const EMPLOYEE_PIN_LENGTH = 4;
/** PBKDF2 iterations for PIN hashing. */
export declare const PIN_PBKDF2_ITERATIONS = 100000;
/** Default employee role for new signups. */
export declare const DEFAULT_EMPLOYEE_ROLE: 'attendant';
/** Subscription verification check interval (ms). */
export declare const SUBSCRIPTION_CHECK_INTERVAL_MS: number;
/** Cloud sync background cycle interval (ms). */
export declare const SYNC_CYCLE_INTERVAL_MS: number;
/** Heartbeat interval (ms). */
export declare const HEARTBEAT_INTERVAL_MS: number;
/** Primary device heartbeat freshness window. */
export declare const PRIMARY_HEARTBEAT_FRESH_MS = 15000;
/** Primary device lost grace period (ms). */
export declare const PRIMARY_LOST_GRACE_MS = 60000;
/** Add milliseconds to ISO timestamp. */
export declare function addMilliseconds(iso: string, ms: number): string;
//# sourceMappingURL=constants.d.ts.map