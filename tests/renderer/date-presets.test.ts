import { describe, it, expect } from 'vitest'
import { startOfDayMs, endOfDayMs } from '../../src/renderer/date-util'
import { PRESETS, presetRange, matchPreset } from '../../src/renderer/date-presets'

// Fixed "now": 2026-06-18 15:30 local.
const NOW = new Date(2026, 5, 18, 15, 30, 0, 0).getTime()
const dayStart = (y: number, m: number, d: number) => startOfDayMs(new Date(y, m, d))
const dayEnd = (y: number, m: number, d: number) => endOfDayMs(new Date(y, m, d))

describe('PRESETS', () => {
  it('lists the five quick ranges in order', () => {
    expect(PRESETS.map((p) => p.key)).toEqual(['today', 'yesterday', 'last7', 'last30', 'last90'])
    expect(PRESETS.map((p) => p.label)).toEqual(['今日', '昨日', '近7日', '近30日', '近90日'])
  })
})

describe('presetRange', () => {
  it('today = start..end of the current local day', () => {
    expect(presetRange('today', NOW)).toEqual({ from: dayStart(2026, 5, 18), to: dayEnd(2026, 5, 18) })
  })
  it('yesterday = the previous whole day', () => {
    expect(presetRange('yesterday', NOW)).toEqual({ from: dayStart(2026, 5, 17), to: dayEnd(2026, 5, 17) })
  })
  it('last7 spans today and the previous 6 days (inclusive)', () => {
    expect(presetRange('last7', NOW)).toEqual({ from: dayStart(2026, 5, 12), to: dayEnd(2026, 5, 18) })
  })
  it('last30 spans 30 inclusive days ending today', () => {
    expect(presetRange('last30', NOW)).toEqual({ from: dayStart(2026, 4, 20), to: dayEnd(2026, 5, 18) })
  })
  it('last90 spans 90 inclusive days ending today', () => {
    expect(presetRange('last90', NOW)).toEqual({ from: dayStart(2026, 2, 21), to: dayEnd(2026, 5, 18) })
  })
})

describe('matchPreset', () => {
  it('returns the preset key when from/to exactly match', () => {
    const r = presetRange('last7', NOW)
    expect(matchPreset(r.from, r.to, NOW)).toBe('last7')
  })
  it('returns null for a custom range and for null bounds', () => {
    expect(matchPreset(1, 2, NOW)).toBeNull()
    expect(matchPreset(null, null, NOW)).toBeNull()
  })
})
