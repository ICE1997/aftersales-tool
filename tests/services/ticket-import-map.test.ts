import { describe, it, expect } from 'vitest'
import { mapRows } from '../../src/main/services/ticket-import-map'

const HEADER = ['售后编号', '订单编号', '发货运单号', '退货运单号', '售后状态', '退款类型', '退款原因', '订单状态', '交易金额', '退款金额', '申请时间', '退货物流状态', '买家']

describe('mapRows', () => {
  it('maps known columns and ignores unknown ones (e.g. 买家)', () => {
    const r = mapRows([
      HEADER,
      ['AS1', 'O1', 'S1', 'R1', '退款成功', '退货退款', '质量问题', '已发货', '24.99', '24.99', '2026-05-28 14:27:38', '签收', '王*: 1*****9'],
    ])
    expect(r.missingRequiredHeader).toBe(false)
    expect(r.tickets).toHaveLength(1)
    const t = r.tickets[0]
    expect(t.aftersaleNo).toBe('AS1')
    expect(t.orderNo).toBe('O1')
    expect(t.shippingNo).toBe('S1')
    expect(t.returnNo).toBe('R1')
    expect(t.status).toBe('退款成功')
    expect(t.aftersaleType).toBe('退货退款')
    expect(t.aftersaleReason).toBe('质量问题')
    expect(t.shippingStatus).toBe('已发货')
    expect(t.amount).toBe(2499)
    expect(t.refundAmount).toBe(2499)
    expect(t.appliedAt).toBe(new Date(2026, 4, 28, 14, 27, 38).getTime())
    expect(t.returnLogistics).toBe('签收')
    expect((t as Record<string, unknown>).recipientName).toBeUndefined()
  })

  it('parses empty amount/refundAmount/appliedAt to null', () => {
    const r = mapRows([
      HEADER,
      ['AS2', 'O2', '', '', '', '', '', '', '', '', '', '', ''],
    ])
    expect(r.tickets).toHaveLength(1)
    const t = r.tickets[0]
    expect(t.amount).toBeNull()
    expect(t.refundAmount).toBeNull()
    expect(t.appliedAt).toBeNull()
  })

  it('flags a missing 售后编号 header', () => {
    const r = mapRows([['订单编号', '售后状态'], ['O1', '退款成功']])
    expect(r.missingRequiredHeader).toBe(true)
    expect(r.tickets).toHaveLength(0)
  })

  it('records rows with empty 售后编号 as failed (with 1-based Excel row number)', () => {
    const r = mapRows([HEADER, ['', 'O1', '', '', '', '', '', '', '', '', '', '', '']])
    expect(r.tickets).toHaveLength(0)
    expect(r.failed).toEqual([{ row: 2, reason: '缺少售后编号' }])
  })

  it('keeps the first of in-file duplicates and counts the rest', () => {
    const row = (no: string, ord: string) => [no, ord, '', '', '', '', '', '', '', '', '', '', '']
    const r = mapRows([HEADER, row('DUP', 'first'), row('DUP', 'second'), row('U', 'x')])
    expect(r.tickets.map((t) => t.aftersaleNo)).toEqual(['DUP', 'U'])
    expect(r.tickets[0].orderNo).toBe('first')
    expect(r.duplicatedInFile).toBe(1)
  })

  it('defaults empty 售后状态 to 待商家处理 and trims cells', () => {
    const r = mapRows([HEADER, [' AS2 ', '', '', '', '', '', '', '', '', '', '', '', '']])
    expect(r.tickets[0].aftersaleNo).toBe('AS2')
    expect(r.tickets[0].status).toBe('待商家处理')
  })

  it('treats an empty matrix as a bad template', () => {
    expect(mapRows([]).missingRequiredHeader).toBe(true)
  })
})
