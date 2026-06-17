import type { Knex } from 'knex'
import type { RegionLevel, RegionCount, StatsSummary } from '../../shared/types'

const COLS: Record<RegionLevel, { code: string; name: string }> = {
  province: { code: 'province_code', name: 'province' },
  city: { code: 'city_code', name: 'city' },
  district: { code: 'district_code', name: 'district' }
}

export class StatsRepo {
  constructor(private db: Knex) {}

  async regionCounts(level: RegionLevel): Promise<RegionCount[]> {
    const col = COLS[level] // fixed mapping — never interpolate arbitrary input
    const rows = (await this.db('tickets')
      .select({ code: col.code, name: col.name })
      .count({ count: '*' })
      .whereNot(col.code, '')
      .groupBy(col.code, col.name)
      .orderBy([{ column: 'count', order: 'desc' }, { column: col.name, order: 'asc' }])) as { code: string; name: string; count: number | string }[]
    return rows.map((r) => ({ code: r.code, name: r.name, count: Number(r.count) }))
  }

  async summary(): Promise<StatsSummary> {
    const total = Number(((await this.db('tickets').count({ n: '*' })) as { n: number | string }[])[0].n)
    const classified = Number(((await this.db('tickets').whereNot('province_code', '').count({ n: '*' })) as { n: number | string }[])[0].n)
    return { total, classified, unclassified: total - classified }
  }
}
