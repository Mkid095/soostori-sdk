/**
 * @soostori/updates — platform-neutral application update contract.
 *
 * Defines the canonical update lifecycle, update types (OTA vs binary),
 * progress model, compatibility metadata, and the platform adapter interface.
 *
 * The SDK owns the semantic contract. Desktop and Mobile each provide
 * a platform-specific adapter implementing UpdateManager.
 */

import type { ISO8601 } from '@soostori/core'

// ── Update states ─────────────────────────────────────────────────────────────

/**
 * Canonical update lifecycle states.
 *
 * State transitions:
 *
 *   CURRENT ──check──► CHECKING ──found──► UPDATE_AVAILABLE
 *                   │                   │
 *                   └──no update───────┘
 *                                         │
 *   UPDATE_AVAILABLE ──download──► DOWNLOADING ──complete──► READY_TO_INSTALL
 *                                       │
 *                                       └───error──► ERROR
 *
 *   READY_TO_INSTALL ──install──► INSTALLING ──complete──► CURRENT (new version)
 *                        │
 *                        └───error──► ERROR
 *
 *   ERROR ──retry──► CHECKING (or back to prior state)
 *        │
 *        └───unsupported──► UNSUPPORTED
 */
export const UPDATE_STATES = [
  'CURRENT',
  'CHECKING',
  'UPDATE_AVAILABLE',
  'DOWNLOADING',
  'READY_TO_INSTALL',
  'INSTALLING',
  'ERROR',
  'UNSUPPORTED',
] as const

export type UpdateState = typeof UPDATE_STATES[number]

/** States that represent an active in-progress operation. */
export const UPDATE_IN_PROGRESS_STATES: UpdateState[] = [
  'CHECKING',
  'DOWNLOADING',
  'INSTALLING',
]

/** States that are terminal (no automatic transition). */
export const UPDATE_TERMINAL_STATES: UpdateState[] = [
  'CURRENT',
  'READY_TO_INSTALL',
  'ERROR',
  'UNSUPPORTED',
]

/** States that allow user-initiated retry. */
export const UPDATE_RETRYABLE_STATES: UpdateState[] = [
  'ERROR',
  'UPDATE_AVAILABLE',
]

// ── Update types ─────────────────────────────────────────────────────────────

/**
 * Semantic update type — what kind of update is being offered.
 *
 * OTA: Application code/assets update applied without replacing the native binary.
 *       On Mobile this is typically Expo OTA or a similar mechanism.
 *       On Desktop this might be an electron-updater delta update.
 *
 * BINARY: A new compiled application version requiring the platform's native
 *         binary installation mechanism (NSIS installer, MSIX, etc.).
 *         Requires user to download and run the full installer.
 */
export type UpdateType = 'ota' | 'binary'

// ── Update platform ─────────────────────────────────────────────────────────

/**
 * Target platform for an update.
 * Used in compatibility checks and release metadata.
 */
export type UpdatePlatform = 'windows' | 'macos' | 'linux' | 'android' | 'ios'

// ── Semantic version ──────────────────────────────────────────────────────────

/**
 * A semantic version string (e.g. "1.2.3", "2.0.0-beta.1").
 * Used for current/available version comparison.
 */
export type SemVer = string

/**
 * Parse a semver string into its components.
 * Returns null if the string is not a valid semver.
 */
export function parseSemVer(v: SemVer): { major: number; minor: number; patch: number; prerelease: string | null } | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  }
}

/**
 * Compare two semver strings.
 * Returns negative if a < b, zero if a === b, positive if a > b.
 * Prerelease versions sort before release versions (1.0.0-beta < 1.0.0).
 */
export function compareSemVer(a: SemVer, b: SemVer): number {
  const pa = parseSemVer(a)
  const pb = parseSemVer(b)
  if (!pa || !pb) return a.localeCompare(b)

  if (pa.major !== pb.major) return pa.major - pb.major
  if (pa.minor !== pb.minor) return pa.minor - pb.minor
  if (pa.patch !== pb.patch) return pa.patch - pb.patch

  // Prerelease logic: no prerelease > with prerelease
  if (pa.prerelease === null && pb.prerelease === null) return 0
  if (pa.prerelease === null) return 1   // release sorts after prerelease
  if (pb.prerelease === null) return -1
  return pa.prerelease.localeCompare(pb.prerelease)
}

/**
 * Returns true if available version is strictly newer than current.
 */
export function isNewerVersion(current: SemVer, available: SemVer): boolean {
  return compareSemVer(available, current) > 0
}

// ── Update info ─────────────────────────────────────────────────────────────

/**
 * Information about an available update.
 * This is returned by the platform adapter's checkForUpdate() method.
 */
export interface UpdateAvailableInfo {
  /** Semantic version of the available update. */
  version: SemVer
  /** Type of update — OTA or binary. */
  updateType: UpdateType
  /** Human-readable release notes / changelog. May be empty. */
  releaseNotes?: string
  /** Download size in bytes. Undefined if unknown (e.g. binary installer). */
  downloadSizeBytes?: number
  /** SHA-256 checksum of the download artifact. For integrity verification. */
  checksum?: string
  /** Timestamp when this update was published. */
  releasedAt: ISO8601
  /** Minimum platform OS version required (e.g. "10.0.19041" for Windows). */
  minOsVersion?: string
  /** Compatible platforms for multi-platform releases. */
  platforms?: UpdatePlatform[]
  /** URL to the release/distribution page. */
  releasePageUrl?: string
  /** Whether this update is mandatory / cannot be skipped. */
  mandatory?: boolean
}

// ── Update progress ──────────────────────────────────────────────────────────

/**
 * Real-time download/install progress.
 * Emitted by the platform adapter during DOWNLOADING and INSTALLING states.
 */
export interface UpdateProgress {
  /** Bytes downloaded so far. */
  downloadedBytes: number
  /** Total bytes to download. Undefined if total is unknown. */
  totalBytes?: number
  /** Download speed in bytes per second. 0 if unknown. */
  bytesPerSecond: number
  /** Percentage 0–100. NaN if indeterminate. */
  percent: number
  /** Estimated seconds remaining. Infinity if unknown. */
  etaSeconds: number
}

export function computeProgress(downloaded: number, total: number, elapsedMs: number): UpdateProgress {
  const percent = total > 0 ? Math.round((downloaded / total) * 100) : NaN
  const bytesPerSecond = elapsedMs > 0 ? Math.round((downloaded / elapsedMs) * 1000) : 0
  const remaining = total - downloaded
  const etaSeconds = bytesPerSecond > 0 ? Math.round(remaining / bytesPerSecond) : Infinity
  return {
    downloadedBytes: downloaded,
    totalBytes: total,
    bytesPerSecond,
    percent,
    etaSeconds,
  }
}

// ── Compatibility ────────────────────────────────────────────────────────────

/**
 * Compatibility metadata for an update.
 * Allows the platform adapter to determine whether an update can be installed
 * given the current runtime environment.
 */
export interface UpdateCompatibility {
  /** Currently running application version. */
  currentVersion: SemVer
  /** Currently running runtime/platform version. */
  platformVersion: string
  /** OS name (e.g. "Windows 10", "Android 14"). */
  osName: string
  /** Architecture (e.g. "x64", "arm64", "armv7"). */
  architecture: string
  /** Whether the available update is compatible with the current runtime. */
  isCompatible: boolean
  /** Reason if not compatible (e.g. "requires iOS 16+, current is iOS 15"). */
  incompatibilityReason?: string
  /** Minimum required platform/runtime version for the available update. */
  minRequiredVersion?: string
}

// ── Update errors ────────────────────────────────────────────────────────────

/**
 * Update error codes — platform-agnostic.
 * The adapter maps platform-specific errors to these codes.
 */
export type UpdateErrorCode =
  | 'CHECK_FAILED'       // Could not reach update server
  | 'DOWNLOAD_FAILED'    // Network or disk error during download
  | 'CHECKSUM_MISMATCH'  // Downloaded file failed integrity check
  | 'COMPATIBILITY'      // Update not compatible with current runtime
  | 'SIGNATURE_INVALID'  // Update package signature verification failed
  | 'INSTALL_FAILED'     // Installation process failed
  | 'USER_CANCELLED'     // User cancelled the operation
  | 'INSUFFICIENT_SPACE' // Not enough disk space for download/install
  | 'UNSUPPORTED_PLATFORM' // This platform/architecture not supported by update
  | 'UNKNOWN'            // Catch-all for unexpected errors

export interface UpdateError {
  code: UpdateErrorCode
  message: string
  /** Platform-specific error code/message for debugging. */
  platformError?: string
  /** Number of retry attempts already made. */
  retryCount: number
}

// ── Update status ────────────────────────────────────────────────────────────

/**
 * Complete snapshot of the current update system state.
 * This is what the UI consumes — it contains everything needed to render
 * the update indicator, progress, or error state.
 */
export interface UpdateStatus {
  /** Current lifecycle state. */
  state: UpdateState
  /** Version currently running on this device. */
  currentVersion: SemVer
  /** Version of the available update. Undefined when not in UPDATE_AVAILABLE state. */
  availableVersion?: SemVer
  /** Type of the available update. Undefined when not in UPDATE_AVAILABLE state. */
  updateType?: UpdateType
  /** Download progress. Present during DOWNLOADING state. */
  progress?: UpdateProgress
  /** Error information. Present during ERROR state. */
  error?: UpdateError
  /** Whether a restart/relaunch is required to apply the update. */
  requiresRestart: boolean
  /** Timestamp of the last successful check for updates. */
  lastCheckedAt: ISO8601 | null
  /** Timestamp when the current version was installed. */
  installedAt: ISO8601 | null
}

// ── Update manager adapter interface ─────────────────────────────────────────

/**
 * Platform adapter interface — implemented by Desktop and Mobile.
 *
 * The SDK state machine consumes this interface.
 * Platform adapters (electron-updater on Desktop, expo-updates on Mobile)
 * implement this interface.
 *
 * All methods return promises — all operations are async.
 */
export interface UpdateManager {
  /**
   * Detect the currently running application version.
   * This is synchronous-friendly but MUST return a Promise for consistency.
   */
  getCurrentVersion(): Promise<SemVer>

  /**
   * Check for a new update. Returns null if no update is available.
   * Transitions state: CURRENT → CHECKING → UPDATE_AVAILABLE | CURRENT
   */
  checkForUpdate(): Promise<UpdateAvailableInfo | null>

  /**
   * Begin downloading the available update.
   * Only valid when state is UPDATE_AVAILABLE.
   * Transitions state: UPDATE_AVAILABLE → DOWNLOADING
   * Emits progress via onProgress callback.
   */
  downloadUpdate(onProgress?: (progress: UpdateProgress) => void): Promise<void>

  /**
   * Apply the downloaded update and restart the application.
   * Only valid when state is READY_TO_INSTALL.
   * Transitions state: READY_TO_INSTALL → INSTALLING → CURRENT (after restart)
   */
  installUpdate(): Promise<void>

  /**
   * Abort the current in-progress operation (check, download).
   * Transitions to ERROR state with USER_CANCELLED.
   */
  abort(): Promise<void>

  /**
   * Get the current update status snapshot.
   * The adapter is responsible for maintaining the authoritative status.
   */
  getStatus(): Promise<UpdateStatus>

  /**
   * Add a listener for status changes.
   * The adapter calls this callback whenever the update state changes.
   * Returns an unsubscribe function.
   */
  addListener(callback: (status: UpdateStatus) => void): () => void
}
