import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { makeTempDb } from './helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { StatsRepo } from '../../src/main/db/stats'

let db: Database
let stats: StatsRepo
let tickets: TicketRepo
let n = 0
let cleanup: () => void

function ticket(region: Partial<{ provinceCode: string; province: string; cityCode: string; city: string; districtCode: string; district: string }>) {
  const no = `AS-${++n}`
  tickets.create({ aftersaleNo: no, orderNo: '', shippingNo: '', returnNo: '', note: '', ...region })
  return no
}

beforeEach(async () => {
  ;({ db, cleanup } = await makeTempDb())
  stats = new StatsRepo(db)
  tickets = new TicketRepo(db, () => 1)
  n = 0
})
afterEach(() => cleanup())

describe('StatsRepo.regionCounts', () => {
  it('counts tickets by province (desc), excluding no-region', () => {
    ticket({ provinceCode: '44', province: '广东省' })
    ticket({ provinceCode: '44', province: '广东省' })
    ticket({ provinceCode: '33', province: '浙江省' })
    ticket({}) // 无地区
    expect(stats.regionCounts('province')).toEqual([
      { code: '44', name: '广东省', count: 2 },
      { code: '33', name: '浙江省', count: 1 }
    ])
  })

  it('counts by city and district', () => {
    ticket({ provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市', districtCode: '440305', district: '南山区' })
    ticket({ provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市', districtCode: '440304', district: '福田区' })
    expect(stats.regionCounts('city')).toEqual([{ code: '4403', name: '深圳市', count: 2 }])
    expect(stats.regionCounts('district').map((r) => r.code).sort()).toEqual(['440304', '440305'])
  })
})

describe('StatsRepo.summary', () => {
  it('total / classified / unclassified', () => {
    ticket({ provinceCode: '44', province: '广东省' })
    ticket({}) // 无省
    expect(stats.summary()).toEqual({ total: 2, classified: 1, unclassified: 1 })
  })
})
