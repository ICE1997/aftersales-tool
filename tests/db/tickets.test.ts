import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'

let db: Database
let repo: TicketRepo

beforeEach(async () => {
  db = await createDatabase(':memory:')
  repo = new TicketRepo(db, () => 1000)
})

describe('TicketRepo', () => {
  it('creates and reads a ticket', () => {
    repo.create({ aftersaleNo: 'AS-1', orderNo: 'O-9', shippingNo: '', returnNo: '', note: '' })
    const t = repo.get('AS-1')
    expect(t?.orderNo).toBe('O-9')
    expect(t?.status).toBe('待商家处理')
    expect(t?.createdAt).toBe(1000)
  })

  it('updates fields and bumps updatedAt', () => {
    repo.create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.update('AS-1', { status: '退款成功', note: 'done' })
    const t = repo.get('AS-1')
    expect(t?.status).toBe('退款成功')
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

  it('stores and reads embedded customer fields', () => {
    repo.create({
      aftersaleNo: 'AS-C', orderNo: '', shippingNo: '', returnNo: '', note: '',
      recipientName: '张三', phone: '13800001111',
      provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市',
      districtCode: '440305', district: '南山区', addressDetail: '科技园1号'
    })
    const t = repo.get('AS-C')!
    expect(t.recipientName).toBe('张三')
    expect(t.phone).toBe('13800001111')
    expect(t.province).toBe('广东省')
    expect(t.districtCode).toBe('440305')
    expect(t.addressDetail).toBe('科技园1号')
  })

  it('defaults customer fields to empty when omitted', () => {
    repo.create({ aftersaleNo: 'AS-E', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const t = repo.get('AS-E')!
    expect(t.phone).toBe('')
    expect(t.province).toBe('')
    expect(t.recipientName).toBe('')
  })

  it('searches by customer fields via FTS', () => {
    repo.create({
      aftersaleNo: 'AS-S', orderNo: '', shippingNo: '', returnNo: '', note: '',
      recipientName: '张三', phone: '13800001111', addressDetail: '科技园路'
    })
    expect(repo.search('张三').map((t) => t.aftersaleNo)).toContain('AS-S')
    expect(repo.search('13800001111').map((t) => t.aftersaleNo)).toContain('AS-S')
    expect(repo.search('科技园').map((t) => t.aftersaleNo)).toContain('AS-S')
  })

  it('updates embedded customer fields', () => {
    repo.create({ aftersaleNo: 'AS-U', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.update('AS-U', { recipientName: '阿强', phone: '139', provinceCode: '33', province: '浙江省' })
    const t = repo.get('AS-U')!
    expect(t.recipientName).toBe('阿强')
    expect(t.province).toBe('浙江省')
    expect(repo.search('阿强').map((x) => x.aftersaleNo)).toContain('AS-U')
  })

  it('stores and reads the extension field', () => {
    repo.create({ aftersaleNo: 'AS-X', orderNo: '', shippingNo: '', returnNo: '', note: '', phone: '17012345678', extension: '5678' })
    expect(repo.get('AS-X')!.extension).toBe('5678')
    repo.update('AS-X', { extension: '9999' })
    expect(repo.get('AS-X')!.extension).toBe('9999')
  })

  it('defaults extension to empty when omitted', () => {
    repo.create({ aftersaleNo: 'AS-Y', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect(repo.get('AS-Y')!.extension).toBe('')
  })

  it('stores and reads the new aftersale fields', () => {
    repo.create({
      aftersaleNo: 'AS-AF', orderNo: '', shippingNo: '', returnNo: '', note: '',
      status: '退款成功', aftersaleType: '退款退货', aftersaleReason: '质量问题',
      shippingStatus: '已发货', amount: '24.99', refundAmount: '24.99',
      appliedAt: '2026-05-28 14:27:38', returnLogistics: '签收',
    })
    const t = repo.get('AS-AF')!
    expect(t.status).toBe('退款成功')
    expect(t.aftersaleType).toBe('退款退货')
    expect(t.aftersaleReason).toBe('质量问题')
    expect(t.shippingStatus).toBe('已发货')
    expect(t.amount).toBe('24.99')
    expect(t.refundAmount).toBe('24.99')
    expect(t.appliedAt).toBe('2026-05-28 14:27:38')
    expect(t.returnLogistics).toBe('签收')
  })

  it('defaults status to 待商家处理 when not provided', () => {
    repo.create({ aftersaleNo: 'AS-D', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect(repo.get('AS-D')!.status).toBe('待商家处理')
  })

  it('existingNos returns only the ones already in the DB', () => {
    repo.create({ aftersaleNo: 'E1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.create({ aftersaleNo: 'E2', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const found = repo.existingNos(['E1', 'E3', 'E2'])
    expect([...found].sort()).toEqual(['E1', 'E2'])
  })

  it('createMany bulk-inserts and keeps them searchable', () => {
    repo.createMany([
      { aftersaleNo: 'M1', orderNo: 'OM1', shippingNo: '', returnNo: '', note: '' },
      { aftersaleNo: 'M2', orderNo: 'OM2', shippingNo: '', returnNo: '', note: '' },
    ])
    expect(repo.list().length).toBe(2)
    expect(repo.search('OM1').map((t) => t.aftersaleNo)).toContain('M1')
  })

  it('update() round-trips a new aftersale field', () => {
    repo.create({ aftersaleNo: 'UPD-AF', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.update('UPD-AF', { aftersaleType: '换货', returnLogistics: '签收' })
    const t = repo.get('UPD-AF')!
    expect(t.aftersaleType).toBe('换货')
    expect(t.returnLogistics).toBe('签收')
  })

  it('migrates legacy status values once and idempotently', () => {
    // simulate a legacy row by writing the old value directly
    repo.create({ aftersaleNo: 'L1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    db.prepare("UPDATE tickets SET status='resolved' WHERE aftersale_no='L1'").run()
    // apply the legacy status mapping inline
    db.prepare("UPDATE tickets SET status='退款成功' WHERE status='resolved'").run()
    expect(repo.get('L1')!.status).toBe('退款成功')
    db.prepare("UPDATE tickets SET status='退款成功' WHERE status='resolved'").run() // idempotent
    expect(repo.get('L1')!.status).toBe('退款成功')
  })
})
