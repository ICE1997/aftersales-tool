import type { Ticket } from '@shared/types'

export type Granularity = 'day' | 'week' | 'month'
export interface Bucket { key: string; label: string; count: number }
export interface BucketResult { granularity: Granularity; buckets: Bucket[]; total: number }

const DAY_MS = 86_400_000
const UNIT: Record<Granularity, string> = { day: '天', week: '周', month: '月' }
const pad = (n: number) => String(n).padStart(2, '0')
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** Monday (local) of the week containing `d`. */
const mondayOf = (d: Date) => {
  const s = startOfDay(d)
  const back = (s.getDay() + 6) % 7 // Mon=0 … Sun=6
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - back)
}

/** Inclusive count of local calendar days between two instants. */
export function spanDays(from: number, to: number): number {
  const a = startOfDay(new Date(from)).getTime()
  const b = startOfDay(new Date(to)).getTime()
  return Math.floor((b - a) / DAY_MS) + 1
}

export function chooseGranularity(days: number): Granularity {
  if (days <= 31) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

function keyOf(ms: number, g: Granularity): string {
  const d = new Date(ms)
  if (g === 'day') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (g === 'week') { const m = mondayOf(d); return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}` }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function labelOf(key: string, g: Granularity): string {
  if (g === 'month') return key // 'YYYY-MM'
  const [, mo, da] = key.split('-') // 'YYYY-MM-DD'
  return `${Number(mo)}/${Number(da)}` // 'M/D'
}

/** Every bucket key from `from`..`to` inclusive, chronological (gaps included). */
function enumerateKeys(from: number, to: number, g: Granularity): string[] {
  const keys: string[] = []
  const start = new Date(from)
  let cur =
    g === 'day' ? startOfDay(start)
    : g === 'week' ? mondayOf(start)
    : new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur.getTime() <= to) {
    keys.push(keyOf(cur.getTime(), g))
    cur =
      g === 'day' ? new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
      : g === 'week' ? new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7)
      : new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return keys
}

/**
 * Aggregate tickets by `appliedAt` into chronological buckets across [from, to].
 * Tickets without appliedAt are ignored. When from/to are null, the range is
 * derived from the min/max appliedAt present.
 */
export function bucketByAppliedTime(tickets: Ticket[], from: number | null, to: number | null): BucketResult {
  const applied = tickets.map((t) => t.appliedAt).filter((v): v is number => v != null)
  if (applied.length === 0) return { granularity: 'day', buckets: [], total: 0 }

  const rangeFrom = from ?? Math.min(...applied)
  const rangeTo = to ?? Math.max(...applied)
  const g = chooseGranularity(spanDays(rangeFrom, rangeTo))

  const counts = new Map<string, number>()
  for (const key of enumerateKeys(rangeFrom, rangeTo, g)) counts.set(key, 0)

  let total = 0
  for (const ms of applied) {
    if (ms < rangeFrom || ms > rangeTo) continue
    const key = keyOf(ms, g)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    total++
  }

  const buckets: Bucket[] = [...counts.entries()].map(([key, count]) => ({ key, label: labelOf(key, g), count }))
  return { granularity: g, buckets, total }
}

/** "共 64 单 / 7 天" — unit word follows granularity. */
export function summaryText(result: BucketResult): string {
  return `共 ${result.total} 单 / ${result.buckets.length} ${UNIT[result.granularity]}`
}
