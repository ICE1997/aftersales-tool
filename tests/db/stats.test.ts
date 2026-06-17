import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Knex } from 'knex'
import { makeTempDb } from './helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { StatsRepo } from '../../src/main/db/stats'

let db: Knex
let stats: StatsRepo
let tickets: TicketRepo
let n = 0
let cleanup: () => Promise<void>

async function ticket(region: Partial<{ provinceCode: string; province: string; cityCode: string; city: string; districtCode: string; district: string }>) {
  const no = `AS-${++n}`
  await tickets.create({ aftersaleNo: no, orderNo: '', shippingNo: '', returnNo: '', note: '', ...region })
  return no
}

beforeEach(async () => {
  ;({ db, cleanup } = await makeTempDb())
  stats = new StatsRepo(db)
  tickets = new TicketRepo(db, () => 1)
  n = 0
})
afterEach(async () => { await cleanup() })

describe('StatsRepo.regionCounts', () => {
  it('counts tickets by province (desc), excluding no-region', async () => {
    await ticket({ provinceCode: '44', province: '广东省' })
    await ticket({ provinceCode: '44', province: '广东省' })
    await ticket({ provinceCode: '33', province: '浙江省' })
    await ticket({}) // 无地区
    expect(await stats.regionCounts('province')).toEqual([
      { code: '44', name: '广东省', count: 2 },
      { code: '33', name: '浙江省', count: 1 }
    ])
  })

  it('counts by city and district', async () => {
    await ticket({ provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市', districtCode: '440305', district: '南山区' })
    await ticket({ provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市', districtCode: '440304', district: '福田区' })
    expect(await stats.regionCounts('city')).toEqual([{ code: '4403', name: '深圳市', count: 2 }])
    expect((await stats.regionCounts('district')).map((r) => r.code).sort()).toEqual(['440304', '440305'])
  })
})

describe('StatsRepo.summary', () => {
  it('total / classified / unclassified', async () => {
    await ticket({ provinceCode: '44', province: '广东省' })
    await ticket({}) // 无省
    expect(await stats.summary()).toEqual({ total: 2, classified: 1, unclassified: 1 })
  })
})
