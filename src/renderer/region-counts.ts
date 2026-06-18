import type { RegionCount, RegionLevel, Ticket } from '@shared/types'

const COLS: Record<RegionLevel, [codeKey: keyof Ticket, nameKey: keyof Ticket]> = {
  province: ['provinceCode', 'province'],
  city: ['cityCode', 'city'],
  district: ['districtCode', 'district'],
}

/**
 * Aggregate region counts from a (filtered) ticket list — the client-side
 * counterpart of the DB regionCounts: group by code+name, ordered by count
 * desc then name asc. Tickets with neither code nor name at this level are
 * skipped (unclassified).
 */
export function regionCountsFromTickets(tickets: Ticket[], level: RegionLevel): RegionCount[] {
  const [codeKey, nameKey] = COLS[level]
  const byKey = new Map<string, RegionCount>()
  for (const t of tickets) {
    const code = String(t[codeKey] ?? '')
    const name = String(t[nameKey] ?? '')
    if (!code && !name) continue
    const existing = byKey.get(code || name)
    if (existing) existing.count++
    else byKey.set(code || name, { code, name, count: 1 })
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
