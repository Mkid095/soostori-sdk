/**
 * sync-hook tests.
 *
 * Run: pnpm vitest run packages/offline/test/sync-hook.test.ts
 */

import { describe, it, expect } from 'vitest'
import { onSyncTick } from '../src/sync-hook.js'

const MS_PER_DAY = 86_400_000

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * MS_PER_DAY)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('onSyncTick', () => {

  // Day 0 → ONLINE
  it('returns ONLINE when lastOnlineAt is today (day 0)', () => {
    const result = onSyncTick({} as any, new Date())
    expect(result.phase).toBe('ONLINE')
    expect(result.daysOffline).toBe(0)
    expect(result.remainingDays).toBe(3)
  })

  // Day 1-2 → OFFLINE_NORMAL
  it('returns OFFLINE_NORMAL for day 1', () => {
    const result = onSyncTick({} as any, daysAgo(1))
    expect(result.phase).toBe('OFFLINE_NORMAL')
    expect(result.daysOffline).toBe(1)
    expect(result.remainingDays).toBe(2)
  })

  it('returns OFFLINE_NORMAL for day 2', () => {
    const result = onSyncTick({} as any, daysAgo(2))
    expect(result.phase).toBe('OFFLINE_NORMAL')
    expect(result.daysOffline).toBe(2)
    expect(result.remainingDays).toBe(1)
  })

  // Day 3 → OFFLINE_WARNING
  it('returns OFFLINE_WARNING on day 3', () => {
    const result = onSyncTick({} as any, daysAgo(3))
    expect(result.phase).toBe('OFFLINE_WARNING')
    expect(result.daysOffline).toBe(3)
    expect(result.remainingDays).toBe(0)
  })

  // Day 4+ → OFFLINE_LIMIT_EXCEEDED
  it('returns OFFLINE_LIMIT_EXCEEDED on day 4', () => {
    const result = onSyncTick({} as any, daysAgo(4))
    expect(result.phase).toBe('OFFLINE_LIMIT_EXCEEDED')
    expect(result.daysOffline).toBe(4)
    expect(result.remainingDays).toBe(0)
  })

  it('returns OFFLINE_LIMIT_EXCEEDED for older timestamps', () => {
    const result = onSyncTick({} as any, daysAgo(10))
    expect(result.phase).toBe('OFFLINE_LIMIT_EXCEEDED')
    expect(result.daysOffline).toBe(10)
    expect(result.remainingDays).toBe(0)
  })

  // Clock skew guard: future timestamp → ONLINE
  it('returns ONLINE when lastOnlineAt is in the future (clock skew guard)', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
    const result = onSyncTick({} as any, future)
    expect(result.phase).toBe('ONLINE')
    expect(result.daysOffline).toBe(0)
  })

})
