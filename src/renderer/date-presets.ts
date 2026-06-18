import { startOfDayMs, endOfDayMs } from './date-util'

export type PresetKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90'
export interface PresetRange { from: number; to: number }
export interface PresetDef { key: PresetKey; label: string; days: number; offset: number }

// `offset` = whole days back from today for the END of the range.
// `days`   = inclusive day span of the range.
export const PRESETS: PresetDef[] = [
  { key: 'today', label: '今日', days: 1, offset: 0 },
  { key: 'yesterday', label: '昨日', days: 1, offset: 1 },
  { key: 'last7', label: '近7日', days: 7, offset: 0 },
  { key: 'last30', label: '近30日', days: 30, offset: 0 },
  { key: 'last90', label: '近90日', days: 90, offset: 0 },
]

/** A local calendar date `deltaDays` away from `now` (DST/month-end safe). */
function dayFrom(now: number, deltaDays: number): Date {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + deltaDays)
}

/** [from, to] local day bounds for a preset, relative to `now`. */
export function presetRange(key: PresetKey, now: number = Date.now()): PresetRange {
  const def = PRESETS.find((p) => p.key === key)
  if (!def) throw new Error(`unknown preset: ${key}`)
  const endDay = dayFrom(now, -def.offset)
  const startDay = dayFrom(now, -def.offset - (def.days - 1))
  return { from: startOfDayMs(startDay), to: endOfDayMs(endDay) }
}

/** Which preset (if any) a from/to pair exactly matches — for chip highlighting. */
export function matchPreset(from: number | null, to: number | null, now: number = Date.now()): PresetKey | null {
  if (from == null || to == null) return null
  for (const p of PRESETS) {
    const r = presetRange(p.key, now)
    if (r.from === from && r.to === to) return p.key
  }
  return null
}
