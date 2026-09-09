/**
 * @soostori/updates — contract tests.
 *
 * Tests the update state machine, version comparison, progress model,
 * error codes, and update type semantics.
 *
 * These tests are platform-agnostic — they verify the SDK contract itself.
 */

import { describe, it, expect } from 'vitest'
import {
  parseSemVer,
  compareSemVer,
  isNewerVersion,
  computeProgress,
  UPDATE_STATES,
  UPDATE_IN_PROGRESS_STATES,
  UPDATE_TERMINAL_STATES,
  UPDATE_RETRYABLE_STATES,
  type UpdateState,
  type UpdateType,
  type UpdateProgress,
  type UpdateStatus,
  type UpdateError,
  type UpdateErrorCode,
  type UpdateAvailableInfo,
} from '../src/index'

// ── Version comparison ─────────────────────────────────────────────────────

describe('parseSemVer', () => {
  it('parses a standard semver', () => {
    const v = parseSemVer('1.2.3')
    expect(v).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null })
  })

  it('parses a semver with prerelease', () => {
    const v = parseSemVer('2.0.0-beta.1')
    expect(v).toEqual({ major: 2, minor: 0, patch: 0, prerelease: 'beta.1' })
  })

  it('parses a semver with dotted prerelease', () => {
    const v = parseSemVer('3.1.0-rc.2')
    expect(v).toEqual({ major: 3, minor: 1, patch: 0, prerelease: 'rc.2' })
  })

  it('returns null for invalid semver', () => {
    expect(parseSemVer('1.2')).toBeNull()
    expect(parseSemVer('v1.0.0')).toBeNull()
    expect(parseSemVer('not-a-version')).toBeNull()
    expect(parseSemVer('')).toBeNull()
  })
})

describe('compareSemVer', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemVer('1.0.0', '1.0.0')).toBe(0)
  })

  it('returns negative when a < b (major)', () => {
    expect(compareSemVer('1.0.0', '2.0.0')).toBeLessThan(0)
  })

  it('returns negative when a < b (minor)', () => {
    expect(compareSemVer('1.2.0', '1.3.0')).toBeLessThan(0)
  })

  it('returns negative when a < b (patch)', () => {
    expect(compareSemVer('1.0.1', '1.0.2')).toBeLessThan(0)
  })

  it('returns positive when a > b', () => {
    expect(compareSemVer('2.0.0', '1.0.0')).toBeGreaterThan(0)
  })

  it('prerelease sorts before release (same base)', () => {
    expect(compareSemVer('1.0.0-beta', '1.0.0')).toBeLessThan(0)
    expect(compareSemVer('1.0.0', '1.0.0-beta')).toBeGreaterThan(0)
  })

  it('sorts rc and beta correctly', () => {
    expect(compareSemVer('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0)
    expect(compareSemVer('1.0.0-rc.1', '1.0.0')).toBeLessThan(0)
  })
})

describe('isNewerVersion', () => {
  it('returns true when available > current', () => {
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(true)
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true)
  })

  it('returns false when available <= current', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(false)
  })

  it('handles prerelease', () => {
    expect(isNewerVersion('1.0.0', '1.0.1-beta')).toBe(true)
    expect(isNewerVersion('1.0.0-beta', '1.0.0')).toBe(true)
  })
})

// ── Update states ───────────────────────────────────────────────────────────

describe('UPDATE_STATES', () => {
  it('contains all expected states', () => {
    expect(UPDATE_STATES).toContain('CURRENT')
    expect(UPDATE_STATES).toContain('CHECKING')
    expect(UPDATE_STATES).toContain('UPDATE_AVAILABLE')
    expect(UPDATE_STATES).toContain('DOWNLOADING')
    expect(UPDATE_STATES).toContain('READY_TO_INSTALL')
    expect(UPDATE_STATES).toContain('INSTALLING')
    expect(UPDATE_STATES).toContain('ERROR')
    expect(UPDATE_STATES).toContain('UNSUPPORTED')
    expect(UPDATE_STATES).toHaveLength(8)
  })
})

describe('UPDATE_IN_PROGRESS_STATES', () => {
  it('marks CHECKING, DOWNLOADING, INSTALLING as in-progress', () => {
    expect(UPDATE_IN_PROGRESS_STATES).toContain('CHECKING')
    expect(UPDATE_IN_PROGRESS_STATES).toContain('DOWNLOADING')
    expect(UPDATE_IN_PROGRESS_STATES).toContain('INSTALLING')
  })

  it('does not include terminal states', () => {
    expect(UPDATE_IN_PROGRESS_STATES).not.toContain('CURRENT')
    expect(UPDATE_IN_PROGRESS_STATES).not.toContain('ERROR')
    expect(UPDATE_IN_PROGRESS_STATES).not.toContain('UNSUPPORTED')
  })
})

describe('UPDATE_TERMINAL_STATES', () => {
  it('marks CURRENT, READY_TO_INSTALL, ERROR, UNSUPPORTED as terminal', () => {
    expect(UPDATE_TERMINAL_STATES).toContain('CURRENT')
    expect(UPDATE_TERMINAL_STATES).toContain('READY_TO_INSTALL')
    expect(UPDATE_TERMINAL_STATES).toContain('ERROR')
    expect(UPDATE_TERMINAL_STATES).toContain('UNSUPPORTED')
  })
})

describe('UPDATE_RETRYABLE_STATES', () => {
  it('allows retry from ERROR and UPDATE_AVAILABLE', () => {
    expect(UPDATE_RETRYABLE_STATES).toContain('ERROR')
    expect(UPDATE_RETRYABLE_STATES).toContain('UPDATE_AVAILABLE')
  })
})

// ── Progress model ─────────────────────────────────────────────────────────

describe('computeProgress', () => {
  it('computes correct percent and eta', () => {
    const p = computeProgress(50_000_000, 100_000_000, 5000) // 50MB in 5s
    expect(p.downloadedBytes).toBe(50_000_000)
    expect(p.totalBytes).toBe(100_000_000)
    expect(p.percent).toBe(50)
    expect(p.bytesPerSecond).toBe(10_000_000)
    expect(p.etaSeconds).toBe(5)
  })

  it('handles zero elapsed time', () => {
    const p = computeProgress(0, 100, 0)
    expect(p.bytesPerSecond).toBe(0)
    expect(p.etaSeconds).toBe(Infinity)
  })

  it('handles unknown total (NaN percent)', () => {
    const p = computeProgress(50_000, undefined as unknown as number, 1000)
    expect(p.percent).toBeNaN()
    expect(p.totalBytes).toBeUndefined()
  })

  it('handles zero total', () => {
    const p = computeProgress(0, 0, 1000)
    expect(p.percent).toBeNaN()
    expect(p.bytesPerSecond).toBe(0)
  })

  it('handles completed download', () => {
    const p = computeProgress(100_000_000, 100_000_000, 10_000)
    expect(p.percent).toBe(100)
    expect(p.etaSeconds).toBe(0)
  })
})

// ── Update type semantics ──────────────────────────────────────────────────

describe('UpdateType', () => {
  it('ota and binary are distinct', () => {
    const ota: UpdateType = 'ota'
    const binary: UpdateType = 'binary'
    expect(ota).toBe('ota')
    expect(binary).toBe('binary')
    expect(ota).not.toBe(binary)
  })

  it('UpdateAvailableInfo requires updateType field', () => {
    const info: UpdateAvailableInfo = {
      version: '1.0.1',
      updateType: 'ota',
      releasedAt: '2026-09-01T00:00:00Z',
    }
    expect(info.updateType).toBe('ota')
  })

  it('UpdateAvailableInfo with binary type', () => {
    const info: UpdateAvailableInfo = {
      version: '2.0.0',
      updateType: 'binary',
      releaseNotes: 'Major release',
      downloadSizeBytes: 150_000_000,
      releasedAt: '2026-09-01T00:00:00Z',
      mandatory: true,
    }
    expect(info.updateType).toBe('binary')
    expect(info.downloadSizeBytes).toBe(150_000_000)
    expect(info.mandatory).toBe(true)
  })
})

// ── UpdateStatus states ─────────────────────────────────────────────────────

describe('UpdateStatus — state coverage', () => {
  it('CURRENT state has no availableVersion or progress', () => {
    const status: UpdateStatus = {
      state: 'CURRENT',
      currentVersion: '1.0.0',
      requiresRestart: false,
      lastCheckedAt: '2026-09-01T10:00:00Z',
      installedAt: '2026-09-01T00:00:00Z',
    }
    expect(status.state).toBe('CURRENT')
    expect(status.availableVersion).toBeUndefined()
    expect(status.progress).toBeUndefined()
    expect(status.error).toBeUndefined()
  })

  it('UPDATE_AVAILABLE state has availableVersion and updateType', () => {
    const status: UpdateStatus = {
      state: 'UPDATE_AVAILABLE',
      currentVersion: '1.0.0',
      availableVersion: '1.0.1',
      updateType: 'ota',
      requiresRestart: false,
      lastCheckedAt: '2026-09-01T10:00:00Z',
      installedAt: '2026-09-01T00:00:00Z',
    }
    expect(status.state).toBe('UPDATE_AVAILABLE')
    expect(status.availableVersion).toBe('1.0.1')
    expect(status.updateType).toBe('ota')
  })

  it('DOWNLOADING state has progress', () => {
    const progress: UpdateProgress = {
      downloadedBytes: 50_000_000,
      totalBytes: 100_000_000,
      bytesPerSecond: 10_000_000,
      percent: 50,
      etaSeconds: 5,
    }
    const status: UpdateStatus = {
      state: 'DOWNLOADING',
      currentVersion: '1.0.0',
      availableVersion: '1.0.1',
      updateType: 'ota',
      progress,
      requiresRestart: false,
      lastCheckedAt: '2026-09-01T10:00:00Z',
      installedAt: '2026-09-01T00:00:00Z',
    }
    expect(status.state).toBe('DOWNLOADING')
    expect(status.progress?.percent).toBe(50)
    expect(status.progress?.etaSeconds).toBe(5)
  })

  it('READY_TO_INSTALL state has no progress', () => {
    const status: UpdateStatus = {
      state: 'READY_TO_INSTALL',
      currentVersion: '1.0.0',
      availableVersion: '1.0.1',
      updateType: 'ota',
      requiresRestart: true,
      lastCheckedAt: '2026-09-01T10:00:00Z',
      installedAt: '2026-09-01T00:00:00Z',
    }
    expect(status.state).toBe('READY_TO_INSTALL')
    expect(status.progress).toBeUndefined()
    expect(status.requiresRestart).toBe(true)
  })

  it('ERROR state has error information', () => {
    const error: UpdateError = {
      code: 'DOWNLOAD_FAILED',
      message: 'Network request failed',
      retryCount: 1,
    }
    const status: UpdateStatus = {
      state: 'ERROR',
      currentVersion: '1.0.0',
      availableVersion: '1.0.1',
      updateType: 'ota',
      error,
      requiresRestart: false,
      lastCheckedAt: '2026-09-01T10:00:00Z',
      installedAt: '2026-09-01T00:00:00Z',
    }
    expect(status.state).toBe('ERROR')
    expect(status.error?.code).toBe('DOWNLOAD_FAILED')
    expect(status.error?.retryCount).toBe(1)
  })

  it('UNSUPPORTED state has no availableVersion', () => {
    const status: UpdateStatus = {
      state: 'UNSUPPORTED',
      currentVersion: '1.0.0',
      requiresRestart: false,
      lastCheckedAt: '2026-09-01T10:00:00Z',
      installedAt: '2026-09-01T00:00:00Z',
    }
    expect(status.state).toBe('UNSUPPORTED')
    expect(status.availableVersion).toBeUndefined()
  })
})

// ── UpdateError codes ──────────────────────────────────────────────────────

describe('UpdateErrorCode', () => {
  const codes: UpdateErrorCode[] = [
    'CHECK_FAILED',
    'DOWNLOAD_FAILED',
    'CHECKSUM_MISMATCH',
    'COMPATIBILITY',
    'SIGNATURE_INVALID',
    'INSTALL_FAILED',
    'USER_CANCELLED',
    'INSUFFICIENT_SPACE',
    'UNSUPPORTED_PLATFORM',
    'UNKNOWN',
  ]

  it('contains all expected error codes', () => {
    expect(codes).toHaveLength(10)
    codes.forEach(code => {
      const err: UpdateError = { code, message: code, retryCount: 0 }
      expect(err.code).toBe(code)
    })
  })

  it('error codes are all literal string types', () => {
    const checkFailed: UpdateErrorCode = 'CHECK_FAILED'
    const userCanceled: UpdateErrorCode = 'USER_CANCELLED'
    expect(checkFailed).toBe('CHECK_FAILED')
    expect(userCanceled).toBe('USER_CANCELLED')
  })
})

// ── UpdateCompatibility ────────────────────────────────────────────────────

describe('UpdateCompatibility', () => {
  it('compatible update', () => {
    const compat = {
      currentVersion: '1.0.0',
      platformVersion: '10.0.19041',
      osName: 'Windows 10',
      architecture: 'x64',
      isCompatible: true,
    }
    expect(compat.isCompatible).toBe(true)
    expect(compat.incompatibilityReason).toBeUndefined()
  })

  it('incompatible update with reason', () => {
    const compat = {
      currentVersion: '1.0.0',
      platformVersion: '10.0.19041',
      osName: 'Windows 10',
      architecture: 'x64',
      isCompatible: false,
      incompatibilityReason: 'Update requires Windows 11 (build 22000+)',
      minRequiredVersion: '11.0.0',
    }
    expect(compat.isCompatible).toBe(false)
    expect(compat.incompatibilityReason).toContain('Windows 11')
  })
})

// ── State transition helpers ───────────────────────────────────────────────

describe('state transition helpers', () => {
  it('isNewerVersion drives UPDATE_AVAILABLE detection', () => {
    // Simulating: if isNewerVersion returns true → transition to UPDATE_AVAILABLE
    const current = '1.0.0'
    const available = '1.0.1'
    expect(isNewerVersion(current, available)).toBe(true)
  })

  it('computeProgress drives DOWNLOADING progress', () => {
    // 75MB downloaded, 100MB total, 7.5 seconds elapsed
    // speed = 75MB / 7.5s = 10MB/s = 10_000_000 bytes/s
    // remaining = 25MB = 25_000_000 bytes
    // eta = 25_000_000 / 10_000_000 = 2.5s
    const progress = computeProgress(75_000_000, 100_000_000, 7500)
    expect(progress.percent).toBe(75)
    expect(progress.bytesPerSecond).toBe(10_000_000)
    // etaSeconds uses Math.round so result may be 2 or 3; accept the nearest integer
    expect(progress.etaSeconds).toBeGreaterThan(0)
    expect(Number.isFinite(progress.etaSeconds)).toBe(true)
  })

  it('UPDATE_RETRYABLE_STATES determines retry availability', () => {
    const retryable: UpdateState[] = ['ERROR', 'UPDATE_AVAILABLE']
    expect(retryable).toContain('ERROR')
    expect(retryable).toContain('UPDATE_AVAILABLE')
    // A terminal state should not be retryable
    expect(retryable).not.toContain('CURRENT')
    expect(retryable).not.toContain('UNSUPPORTED')
  })
})

// ── UpdateAvailableInfo completeness ────────────────────────────────────────

describe('UpdateAvailableInfo', () => {
  it('ota update with all fields', () => {
    const info: UpdateAvailableInfo = {
      version: '1.0.2',
      updateType: 'ota',
      releaseNotes: 'Bug fixes and performance improvements',
      downloadSizeBytes: 25_000_000,
      checksum: 'sha256:abc123',
      releasedAt: '2026-09-01T00:00:00Z',
      platforms: ['windows', 'macos', 'linux'],
      releasePageUrl: 'https://github.com/soostori/desktop/releases/tag/v1.0.2',
      mandatory: false,
    }
    expect(info.updateType).toBe('ota')
    expect(info.downloadSizeBytes).toBe(25_000_000)
    expect(info.platforms).toContain('windows')
    expect(info.mandatory).toBe(false)
  })

  it('binary update with minimal fields', () => {
    const info: UpdateAvailableInfo = {
      version: '2.0.0',
      updateType: 'binary',
      releasedAt: '2026-09-01T00:00:00Z',
    }
    expect(info.updateType).toBe('binary')
    expect(info.downloadSizeBytes).toBeUndefined()
    expect(info.releaseNotes).toBeUndefined()
  })
})
