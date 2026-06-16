import type { Database } from 'better-sqlite3'
import type { RegionLevel, RegionCount, StatsSummary } from '../../shared/types'

const COLS: Record<RegionLevel, { code: string; name: string }> = {
  province: { code: 'province_code', name: 'province' },
  city: { code: 'city_code', name: 'city' },
  district: { code: 'district_code', name: 'district' }
}

export class StatsRepo {
  constructor(private db: Database) {}

  regionCounts(level: RegionLevel): RegionCount[] {
    const col = COLS[level] // fixed mapping — never interpolate arbitrary input
    return this.db.prepare(
      `SELECT ${col.code} AS code, ${col.name} AS name, COUNT(*) AS count
       FROM tickets
       WHERE ${col.code} != ''
       GROUP BY ${col.code}, ${col.name}
       ORDER BY count DESC, name ASC`
    ).all() as RegionCount[]
  }

  summary(): StatsSummary {
    const total = (this.db.prepare('SELECT COUNT(*) AS n FROM tickets').get() as { n: number }).n
    const classified = (this.db.prepare(
      `SELECT COUNT(*) AS n FROM tickets WHERE province_code != ''`
    ).get() as { n: number }).n
    return { total, classified, unclassified: total - classified }
  }
}
