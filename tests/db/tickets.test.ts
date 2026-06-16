import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'

let db: Database
let repo: TicketRepo

beforeEach(() => {
  db = createDatabase(':memory:')
  repo = new TicketRepo(db, () => 1000)
})

describe('TicketRepo', () => {
  it('creates and reads a ticket', () => {
    repo.create({ aftersaleNo: 'AS-1', orderNo: 'O-9', shippingNo: '', returnNo: '', note: '' })
    const t = repo.get('AS-1')
    expect(t?.orderNo).toBe('O-9')
    expect(t?.status).toBe('pending')
    expect(t?.createdAt).toBe(1000)
  })

  it('updates fields and bumps updatedAt', () => {
    repo.create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.update('AS-1', { status: 'resolved', note: 'done' })
    const t = repo.get('AS-1')
    expect(t?.status).toBe('resolved')
    expect(t?.note).toBe('done')
  })

  it('searches by any of the four numbers via FTS', () => {
    repo.create({ aftersaleNo: 'AS-100', orderNo: 'ORD-555', shippingNo: 'SHIP-777', returnNo: 'RET-888', note: '破损' })
    expect(repo.search('555').map(t => t.aftersaleNo)).toContain('AS-100')
    expect(repo.search('777').map(t => t.aftersaleNo)).toContain('AS-100')
    expect(repo.search('888').map(t => t.aftersaleNo)).toContain('AS-100')
    expect(repo.search('AS-100').map(t => t.aftersaleNo)).toContain('AS-100')
  })

  it('list returns all tickets newest first', () => {
    repo.create({ aftersaleNo: 'A', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.create({ aftersaleNo: 'B', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect(repo.list().length).toBe(2)
  })

  it('updating a number field removes old token and adds new one in FTS', () => {
    repo.create({ aftersaleNo: 'AS-1', orderNo: 'ORD-555', shippingNo: '', returnNo: '', note: '' })
    repo.update('AS-1', { orderNo: 'ORD-999' })
    expect(repo.search('555').map(t => t.aftersaleNo)).not.toContain('AS-1')
    expect(repo.search('999').map(t => t.aftersaleNo)).toContain('AS-1')
  })

  it('deletes a ticket and cascades to its materials and FTS', () => {
    repo.create({ aftersaleNo: 'DEL-1', orderNo: 'ORD-DEL', shippingNo: '', returnNo: '', note: '' })
    repo.delete('DEL-1')
    expect(repo.get('DEL-1')).toBeUndefined()
    expect(repo.search('ORD-DEL').length).toBe(0)   // FTS entry gone
    expect(repo.list().length).toBe(0)
  })

  it('new tickets have a null customerId', () => {
    repo.create({ aftersaleNo: 'C-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect(repo.get('C-1')!.customerId).toBeNull()
  })

  it('setCustomer links and unlinks a customer', () => {
    repo.create({ aftersaleNo: 'C-2', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    db.prepare("INSERT INTO customers (id, created_at, updated_at) VALUES (7, 1, 1)").run()
    repo.setCustomer('C-2', 7)
    expect(repo.get('C-2')!.customerId).toBe(7)
    repo.setCustomer('C-2', null)
    expect(repo.get('C-2')!.customerId).toBeNull()
  })

  it('stores and reads embedded customer fields', () => {
    repo.create({
      aftersaleNo: 'AS-C', orderNo: '', shippingNo: '', returnNo: '', note: '',
      nickname: '小明买家', recipientName: '张三', phone: '13800001111',
      provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市',
      districtCode: '440305', district: '南山区', addressDetail: '科技园1号'
    })
    const t = repo.get('AS-C')!
    expect(t.nickname).toBe('小明买家')
    expect(t.recipientName).toBe('张三')
    expect(t.phone).toBe('13800001111')
    expect(t.province).toBe('广东省')
    expect(t.districtCode).toBe('440305')
    expect(t.addressDetail).toBe('科技园1号')
  })

  it('defaults customer fields to empty when omitted', () => {
    repo.create({ aftersaleNo: 'AS-E', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const t = repo.get('AS-E')!
    expect(t.nickname).toBe('')
    expect(t.phone).toBe('')
    expect(t.province).toBe('')
  })

  it('searches by customer fields via FTS', () => {
    repo.create({
      aftersaleNo: 'AS-S', orderNo: '', shippingNo: '', returnNo: '', note: '',
      nickname: '小明买家', recipientName: '张三', phone: '13800001111', addressDetail: '科技园路'
    })
    expect(repo.search('小明').map((t) => t.aftersaleNo)).toContain('AS-S')
    expect(repo.search('张三').map((t) => t.aftersaleNo)).toContain('AS-S')
    expect(repo.search('13800001111').map((t) => t.aftersaleNo)).toContain('AS-S')
    expect(repo.search('科技园').map((t) => t.aftersaleNo)).toContain('AS-S')
  })

  it('updates embedded customer fields', () => {
    repo.create({ aftersaleNo: 'AS-U', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.update('AS-U', { nickname: '阿强', phone: '139', provinceCode: '33', province: '浙江省' })
    const t = repo.get('AS-U')!
    expect(t.nickname).toBe('阿强')
    expect(t.province).toBe('浙江省')
    expect(repo.search('阿强').map((x) => x.aftersaleNo)).toContain('AS-U')
  })
})
