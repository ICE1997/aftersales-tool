import { describe, it, expect } from 'vitest'
import type { Ticket } from '../../src/shared/types'
import {
  applyFilter, applySort, EMPTY_FILTER, DEFAULT_SORT,
  dayStartMs, dayEndMs, msToDateInput, type TicketFilter
} from '../../src/renderer/ticket-filter'

const EMPTY_CUSTOMER = {
  recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: ''
}
const EMPTY_AFTERSALE = {
  aftersaleType: '', aftersaleReason: '', shippingStatus: '',
  amount: null, refundAmount: null, appliedAt: null, returnLogistics: ''
} as const

function mk(over: Partial<Ticket> = {}): Ticket {
  return {
    aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '',
    status: '待商家处理', note: '', createdAt: 0, updatedAt: 0,
    ...EMPTY_CUSTOMER, ...EMPTY_AFTERSALE, ...over,
  }
}
const f = (over: Partial<TicketFilter> = {}): TicketFilter => ({ ...EMPTY_FILTER, ...over })

describe('applyFilter', () => {
  const list = [
    mk({ aftersaleNo: 'A', status: '待商家处理', aftersaleType: '退款', shippingStatus: '未发货', appliedAt: 100 }),
    mk({ aftersaleNo: 'B', status: '退款成功', aftersaleType: '换货', shippingStatus: '已发货', appliedAt: 200 }),
    mk({ aftersaleNo: 'C', status: '退款成功', aftersaleType: '退款', shippingStatus: '已发货', appliedAt: null }),
  ]
  const ids = (ts: Ticket[]) => ts.map((t) => t.aftersaleNo)

  it('empty filter returns all (unchanged length)', () => {
    expect(applyFilter(list, EMPTY_FILTER)).toHaveLength(3)
  })
  it('status multi-select (OR within facet)', () => {
    expect(ids(applyFilter(list, f({ statuses: ['退款成功'] })))).toEqual(['B', 'C'])
  })
  it('type multi-select', () => {
    expect(ids(applyFilter(list, f({ types: ['退款'] })))).toEqual(['A', 'C'])
  })
  it('shipping-status multi-select', () => {
    expect(ids(applyFilter(list, f({ shippingStatuses: ['已发货'] })))).toEqual(['B', 'C'])
  })
  it('facets combine with AND', () => {
    expect(ids(applyFilter(list, f({ statuses: ['退款成功'], types: ['退款'] })))).toEqual(['C'])
  })
  it('date from (inclusive) excludes null appliedAt', () => {
    expect(ids(applyFilter(list, f({ appliedFrom: 200 })))).toEqual(['B'])
  })
  it('date to (inclusive)', () => {
    expect(ids(applyFilter(list, f({ appliedTo: 100 })))).toEqual(['A'])
  })
  it('date range both bounds', () => {
    expect(ids(applyFilter(list, f({ appliedFrom: 100, appliedTo: 200 })))).toEqual(['A', 'B'])
  })
})

describe('applySort', () => {
  const ids = (ts: Ticket[]) => ts.map((t) => t.aftersaleNo)
  it('appliedAt asc, nulls last', () => {
    const list = [mk({ aftersaleNo: 'n', appliedAt: null }), mk({ aftersaleNo: 'b', appliedAt: 200 }), mk({ aftersaleNo: 'a', appliedAt: 100 })]
    expect(ids(applySort(list, { key: 'appliedAt', dir: 'asc' }))).toEqual(['a', 'b', 'n'])
  })
  it('appliedAt desc, nulls still last', () => {
    const list = [mk({ aftersaleNo: 'n', appliedAt: null }), mk({ aftersaleNo: 'a', appliedAt: 100 }), mk({ aftersaleNo: 'b', appliedAt: 200 })]
    expect(ids(applySort(list, { key: 'appliedAt', dir: 'desc' }))).toEqual(['b', 'a', 'n'])
  })
  it('status by STATUS_ORDER asc', () => {
    const list = [mk({ aftersaleNo: 'x', status: '退款成功' }), mk({ aftersaleNo: 'y', status: '待商家处理' })]
    expect(ids(applySort(list, { key: 'status', dir: 'asc' }))).toEqual(['y', 'x'])
  })
  it('is stable for equal keys', () => {
    const list = [mk({ aftersaleNo: '1', appliedAt: 5 }), mk({ aftersaleNo: '2', appliedAt: 5 }), mk({ aftersaleNo: '3', appliedAt: 5 })]
    expect(ids(applySort(list, { key: 'appliedAt', dir: 'asc' }))).toEqual(['1', '2', '3'])
    expect(ids(applySort(list, { key: 'appliedAt', dir: 'desc' }))).toEqual(['1', '2', '3'])
  })
  it('does not mutate the input', () => {
    const list = [mk({ aftersaleNo: 'a', appliedAt: 2 }), mk({ aftersaleNo: 'b', appliedAt: 1 })]
    applySort(list, DEFAULT_SORT)
    expect(ids(list)).toEqual(['a', 'b'])
  })
})

describe('date helpers', () => {
  it('dayStartMs is local midnight; dayEndMs is local 23:59:59.999', () => {
    const start = dayStartMs('2026-05-28')!
    const end = dayEndMs('2026-05-28')!
    expect(new Date(start).getHours()).toBe(0)
    expect(new Date(start).getMinutes()).toBe(0)
    expect(end - start).toBe(24 * 3600 * 1000 - 1)
  })
  it('invalid / empty input → null', () => {
    expect(dayStartMs('')).toBeNull()
    expect(dayStartMs('nope')).toBeNull()
    expect(dayEndMs('2026-5-8')).toBeNull()
  })
  it('msToDateInput round-trips with dayStartMs', () => {
    const ms = dayStartMs('2026-05-28')!
    expect(msToDateInput(ms)).toBe('2026-05-28')
    expect(msToDateInput(null)).toBe('')
  })
})
