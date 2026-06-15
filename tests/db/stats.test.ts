import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { CustomerRepo } from '../../src/main/db/customers'
import { TicketRepo } from '../../src/main/db/tickets'
import { StatsRepo } from '../../src/main/db/stats'

let db: Database
let stats: StatsRepo
let customers: CustomerRepo
let tickets: TicketRepo

const cust = (over: Partial<Parameters<CustomerRepo['create']>[0]> = {}) => customers.create({
  nickname: '', name: '客户', provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市',
  districtCode: '440305', district: '南山区', addressDetail: '', ...over
})

let n = 0
function ticketFor(customerId: number | null) {
  const no = `AS-${++n}`
  tickets.create({ aftersaleNo: no, orderNo: '', shippingNo: '', returnNo: '', note: '' })
  if (customerId != null) tickets.setCustomer(no, customerId)
  return no
}

beforeEach(() => {
  db = createDatabase(':memory:')
  stats = new StatsRepo(db)
  customers = new CustomerRepo(db, () => 1)
  tickets = new TicketRepo(db, () => 1)
  n = 0
})

describe('StatsRepo.regionCounts', () => {
  it('counts tickets by province (desc), excluding unlinked / no-region', () => {
    const gd1 = cust({ provinceCode: '44', province: '广东省' })
    const gd2 = cust({ provinceCode: '44', province: '广东省' })
    const zj = cust({ provinceCode: '33', province: '浙江省', cityCode: '3301', city: '杭州市', districtCode: '330106', district: '西湖区' })
    const noRegion = cust({ provinceCode: '', province: '', cityCode: '', city: '', districtCode: '', district: '' })
    ticketFor(gd1); ticketFor(gd2); ticketFor(zj); ticketFor(noRegion); ticketFor(null)
    expect(stats.regionCounts('province')).toEqual([
      { code: '44', name: '广东省', count: 2 },
      { code: '33', name: '浙江省', count: 1 }
    ])
  })

  it('counts by city and district', () => {
    const a = cust()
    ticketFor(a); ticketFor(a)
    expect(stats.regionCounts('city')).toEqual([{ code: '4403', name: '深圳市', count: 2 }])
    expect(stats.regionCounts('district')).toEqual([{ code: '440305', name: '南山区', count: 2 }])
  })
})

describe('StatsRepo.summary', () => {
  it('computes total / classified / unclassified', () => {
    const gd = cust()
    const noRegion = cust({ provinceCode: '', province: '' })
    ticketFor(gd); ticketFor(noRegion); ticketFor(null)
    expect(stats.summary()).toEqual({ total: 3, classified: 1, unclassified: 2 })
  })
})
