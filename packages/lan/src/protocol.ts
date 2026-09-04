/**
 * LAN protocol constants — extracted from Desktop's sync infrastructure.
 */

export const DISCOVERY_PORT = 18793
export const SYNC_PORT = 18792
export const DISCOVERY_MAGIC = 'SOOSTORI_DISCOVER'
export const DISCOVERY_VERSION = 1

/** Heartbeat interval for terminals. */
export const HEARTBEAT_INTERVAL_MS = 5_000

/** Connection idle timeout. */
export const IDLE_TIMEOUT_MS = 60_000
