import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'
import { CustomerRepo } from '../../src/main/db/customers'

let db: Database
let tickets: TicketRepo
let customers: CustomerRepo
let clock = 1000

beforeEach(() => {
  clock = 1000
  db = createDatabase(':memory:')
  tickets = new TicketRepo(db, () => ++clock)
  customers = new CustomerRepo(db)
})

function add(no: string, over: Record<string, string> = {}) {
  tickets.create({ aftersaleNo: no, orderNo: '', shippingNo: '', returnNo: '', note: '',
    nickname: '小明', recipientName: '张三', phone: '138', provinceCode: '44', province: '广东省',
    cityCode: '4403', city: '深圳市', districtCode: '440305', district: '南山区', addressDetail: '', ...over })
}

describe('CustomerRepo (derived from tickets)', () => {
  it('groups tickets by nickname with复诉 count, newest-first', () => {
    add('AS-1')
    add('AS-2')
    add('AS-3', { nickname: '阿强', recipientName: '李四', province: '浙江省', provinceCode: '33' })
    const rows = customers.listByNickname()
    expect(rows.map((r) => [r.nickname, r.ticketCount])).toEqual([['小明', 2], ['阿强', 1]])
  })

  it('representative values come from the most recently updated ticket', () => {
    add('AS-1', { phone: '111' })
    add('AS-2', { phone: '222' }) // 更晚创建 → updated_at 更大
    const xm = customers.listByNickname().find((r) => r.nickname === '小明')!
    expect(xm.phone).toBe('222')
  })

  it('excludes tickets with empty nickname', () => {
    add('AS-1', { nickname: '' })
    expect(customers.listByNickname()).toEqual([])
  })

  it('ticketsOfNickname returns that buyer tickets newest-first', () => {
    add('AS-1'); add('AS-2')
    expect(customers.ticketsOfNickname('小明').map((t) => t.aftersaleNo)).toEqual(['AS-2', 'AS-1'])
  })

  it('search filters by nickname / recipient / phone, escaping % and _', () => {
    add('AS-1', { nickname: '小明', recipientName: '张三', phone: '13800' })
    add('AS-2', { nickname: '阿强', recipientName: '李四', phone: '13911' })
    expect(customers.search('阿强').map((r) => r.nickname)).toEqual(['阿强'])
    expect(customers.search('张三').map((r) => r.nickname)).toEqual(['小明'])
    expect(customers.search('139').map((r) => r.nickname)).toEqual(['阿强'])
    expect(customers.search('%')).toEqual([]) // 通配符按字面量,不匹配
  })
})
