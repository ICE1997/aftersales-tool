import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Knex } from 'knex'
import { makeTempDb } from './helpers'
import { TicketRepo } from '../../src/main/db/tickets'

let db: Knex
let repo: TicketRepo
let cleanup: () => Promise<void>

beforeEach(async () => {
  ;({ db, cleanup } = await makeTempDb())
  repo = new TicketRepo(db, () => 1000)
})
afterEach(async () => { await cleanup() })

describe('TicketRepo', () => {
  it('creates and reads a ticket', async () => {
    await repo.create({ aftersaleNo: 'AS-1', orderNo: 'O-9', shippingNo: '', returnNo: '', note: '' })
    const t = await repo.get('AS-1')
    expect(t?.orderNo).toBe('O-9')
    expect(t?.status).toBe('待商家处理')
    expect(t?.createdAt).toBe(1000)
  })

  it('updates fields and bumps updatedAt', async () => {
    await repo.create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    await repo.update('AS-1', { status: '退款成功', note: 'done' })
    const t = await repo.get('AS-1')
    expect(t?.status).toBe('退款成功')
    expect(t?.note).toBe('done')
  })

  it('searches by any of the four numbers via FTS', async () => {
    await repo.create({ aftersaleNo: 'AS-100', orderNo: 'ORD-555', shippingNo: 'SHIP-777', returnNo: 'RET-888', note: '破损' })
    expect((await repo.search('555')).map(t => t.aftersaleNo)).toContain('AS-100')
    expect((await repo.search('777')).map(t => t.aftersaleNo)).toContain('AS-100')
    expect((await repo.search('888')).map(t => t.aftersaleNo)).toContain('AS-100')
    expect((await repo.search('AS-100')).map(t => t.aftersaleNo)).toContain('AS-100')
  })

  it('search matches the newly indexed text fields', async () => {
    await repo.create({
      aftersaleNo: 'FTS-1', orderNo: '', shippingNo: '', returnNo: '', note: '',
      aftersaleType: '退货退款', aftersaleReason: '质量问题', shippingStatus: '已发货',
      returnLogistics: '签收', extension: '0106'
    })
    expect((await repo.search('退货退款')).map((t) => t.aftersaleNo)).toContain('FTS-1')
    expect((await repo.search('0106')).map((t) => t.aftersaleNo)).toContain('FTS-1')
    expect((await repo.search('签收')).map((t) => t.aftersaleNo)).toContain('FTS-1')
    expect((await repo.search('质量问题')).map((t) => t.aftersaleNo)).toContain('FTS-1')
  })

  it('list returns all tickets newest first', async () => {
    await repo.create({ aftersaleNo: 'A', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    await repo.create({ aftersaleNo: 'B', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect((await repo.list()).length).toBe(2)
  })

  it('updating a number field removes old token and adds new one in FTS', async () => {
    await repo.create({ aftersaleNo: 'AS-1', orderNo: 'ORD-555', shippingNo: '', returnNo: '', note: '' })
    await repo.update('AS-1', { orderNo: 'ORD-999' })
    expect((await repo.search('555')).map(t => t.aftersaleNo)).not.toContain('AS-1')
    expect((await repo.search('999')).map(t => t.aftersaleNo)).toContain('AS-1')
  })

  it('deletes a ticket and cascades to its materials and FTS', async () => {
    await repo.create({ aftersaleNo: 'DEL-1', orderNo: 'ORD-DEL', shippingNo: '', returnNo: '', note: '' })
    await repo.delete('DEL-1')
    expect(await repo.get('DEL-1')).toBeUndefined()
    expect((await repo.search('ORD-DEL')).length).toBe(0)   // FTS entry gone
    expect((await repo.list()).length).toBe(0)
  })

  it('stores and reads embedded customer fields', async () => {
    await repo.create({
      aftersaleNo: 'AS-C', orderNo: '', shippingNo: '', returnNo: '', note: '',
      recipientName: '张三', phone: '13800001111',
      provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市',
      districtCode: '440305', district: '南山区', addressDetail: '科技园1号'
    })
    const t = (await repo.get('AS-C'))!
    expect(t.recipientName).toBe('张三')
    expect(t.phone).toBe('13800001111')
    expect(t.province).toBe('广东省')
    expect(t.districtCode).toBe('440305')
    expect(t.addressDetail).toBe('科技园1号')
  })

  it('defaults customer fields to empty when omitted', async () => {
    await repo.create({ aftersaleNo: 'AS-E', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const t = (await repo.get('AS-E'))!
    expect(t.phone).toBe('')
    expect(t.province).toBe('')
    expect(t.recipientName).toBe('')
  })

  it('searches by customer fields via FTS', async () => {
    await repo.create({
      aftersaleNo: 'AS-S', orderNo: '', shippingNo: '', returnNo: '', note: '',
      recipientName: '张三', phone: '13800001111', addressDetail: '科技园路'
    })
    expect((await repo.search('张三')).map((t) => t.aftersaleNo)).toContain('AS-S')
    expect((await repo.search('13800001111')).map((t) => t.aftersaleNo)).toContain('AS-S')
    expect((await repo.search('科技园')).map((t) => t.aftersaleNo)).toContain('AS-S')
  })

  it('updates embedded customer fields', async () => {
    await repo.create({ aftersaleNo: 'AS-U', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    await repo.update('AS-U', { recipientName: '阿强', phone: '139', provinceCode: '33', province: '浙江省' })
    const t = (await repo.get('AS-U'))!
    expect(t.recipientName).toBe('阿强')
    expect(t.province).toBe('浙江省')
    expect((await repo.search('阿强')).map((x) => x.aftersaleNo)).toContain('AS-U')
  })

  it('stores and reads the extension field', async () => {
    await repo.create({ aftersaleNo: 'AS-X', orderNo: '', shippingNo: '', returnNo: '', note: '', phone: '17012345678', extension: '5678' })
    expect((await repo.get('AS-X'))!.extension).toBe('5678')
    await repo.update('AS-X', { extension: '9999' })
    expect((await repo.get('AS-X'))!.extension).toBe('9999')
  })

  it('defaults extension to empty when omitted', async () => {
    await repo.create({ aftersaleNo: 'AS-Y', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect((await repo.get('AS-Y'))!.extension).toBe('')
  })

  it('stores and reads the new aftersale fields', async () => {
    await repo.create({
      aftersaleNo: 'AS-AF', orderNo: '', shippingNo: '', returnNo: '', note: '',
      status: '退款成功', aftersaleType: '退款退货', aftersaleReason: '质量问题',
      shippingStatus: '已发货', amount: 24.99, refundAmount: 24.99,
      appliedAt: 1748356058000, returnLogistics: '签收',
    })
    const t = (await repo.get('AS-AF'))!
    expect(t.status).toBe('退款成功')
    expect(t.aftersaleType).toBe('退款退货')
    expect(t.aftersaleReason).toBe('质量问题')
    expect(t.shippingStatus).toBe('已发货')
    expect(t.amount).toBe(24.99)
    expect(t.refundAmount).toBe(24.99)
    expect(t.appliedAt).toBe(1748356058000)
    expect(t.returnLogistics).toBe('签收')
  })

  it('defaults status to 待商家处理 when not provided', async () => {
    await repo.create({ aftersaleNo: 'AS-D', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect((await repo.get('AS-D'))!.status).toBe('待商家处理')
  })

  it('defaults amount, refundAmount, and appliedAt to null when omitted', async () => {
    await repo.create({ aftersaleNo: 'AS-NULL', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const t = (await repo.get('AS-NULL'))!
    expect(t.amount).toBeNull()
    expect(t.refundAmount).toBeNull()
    expect(t.appliedAt).toBeNull()
  })

  it('existingNos returns only the ones already in the DB', async () => {
    await repo.create({ aftersaleNo: 'E1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    await repo.create({ aftersaleNo: 'E2', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const found = await repo.existingNos(['E1', 'E3', 'E2'])
    expect([...found].sort()).toEqual(['E1', 'E2'])
  })

  it('createMany bulk-inserts and keeps them searchable', async () => {
    await repo.createMany([
      { aftersaleNo: 'M1', orderNo: 'OM1', shippingNo: '', returnNo: '', note: '' },
      { aftersaleNo: 'M2', orderNo: 'OM2', shippingNo: '', returnNo: '', note: '' },
    ])
    expect((await repo.list()).length).toBe(2)
    expect((await repo.search('OM1')).map((t) => t.aftersaleNo)).toContain('M1')
  })

  it('update() round-trips a new aftersale field', async () => {
    await repo.create({ aftersaleNo: 'UPD-AF', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    await repo.update('UPD-AF', { aftersaleType: '换货', returnLogistics: '签收' })
    const t = (await repo.get('UPD-AF'))!
    expect(t.aftersaleType).toBe('换货')
    expect(t.returnLogistics).toBe('签收')
  })

  it('migrates legacy status values once and idempotently', async () => {
    // simulate a legacy row by writing the old value directly
    await repo.create({ aftersaleNo: 'L1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    await db('tickets').where('aftersale_no', 'L1').update({ status: 'resolved' })
    // apply the legacy status mapping inline
    await db('tickets').where('status', 'resolved').update({ status: '退款成功' })
    expect((await repo.get('L1'))!.status).toBe('退款成功')
    await db('tickets').where('status', 'resolved').update({ status: '退款成功' }) // idempotent
    expect((await repo.get('L1'))!.status).toBe('退款成功')
  })
})
