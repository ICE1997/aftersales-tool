import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'
import { CustomerRepo } from '../../src/main/db/customers'

let db: Database
let customers: CustomerRepo

const baseCustomer = {
  nickname: '小明', name: '张三',
  provinceCode: '44', province: '广东省',
  cityCode: '4403', city: '深圳市',
  districtCode: '440305', district: '南山区',
  addressDetail: '科技园1号'
}

beforeEach(() => {
  db = createDatabase(':memory:')
  customers = new CustomerRepo(db, () => 1000)
})

describe('CustomerRepo', () => {
  it('creates and reads a customer with address fields', () => {
    const id = customers.create(baseCustomer)
    const c = customers.get(id)!
    expect(c.nickname).toBe('小明')
    expect(c.province).toBe('广东省')
    expect(c.districtCode).toBe('440305')
    expect(c.addressDetail).toBe('科技园1号')
    expect(c.createdAt).toBe(1000)
  })

  it('updates fields', () => {
    const id = customers.create(baseCustomer)
    customers.update(id, { name: '李四', addressDetail: '高新南' })
    const c = customers.get(id)!
    expect(c.name).toBe('李四')
    expect(c.addressDetail).toBe('高新南')
  })

  it('list returns ticketCount per customer', () => {
    const id = customers.create(baseCustomer)
    const tickets = new TicketRepo(db, () => 1)
    tickets.create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    tickets.setCustomer('AS-1', id)
    const row = customers.list().find((r) => r.id === id)!
    expect(row.ticketCount).toBe(1)
  })

  it('searches by nickname/name/region/detail', () => {
    customers.create(baseCustomer)
    expect(customers.search('张三').length).toBe(1)
    expect(customers.search('南山').length).toBe(1)
    expect(customers.search('科技园').length).toBe(1)
    expect(customers.search('不存在').length).toBe(0)
  })

  it('delete nulls the customer_id of linked tickets', () => {
    const id = customers.create(baseCustomer)
    const tickets = new TicketRepo(db, () => 1)
    tickets.create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    tickets.setCustomer('AS-1', id)
    customers.delete(id)
    expect(customers.get(id)).toBeUndefined()
    expect(tickets.get('AS-1')!.customerId).toBeNull()
  })

  it('ticketsOf returns the customer linked tickets', () => {
    const id = customers.create(baseCustomer)
    const tickets = new TicketRepo(db, () => 1)
    tickets.create({ aftersaleNo: 'AS-9', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    tickets.setCustomer('AS-9', id)
    expect(customers.ticketsOf(id).map((t) => t.aftersaleNo)).toEqual(['AS-9'])
  })
})
