import { describe, it, expect } from 'vitest'
import type { Ticket } from '../../src/shared/types'
import {
  spanDays, chooseGranularity, bucketByAppliedTime, summaryText,
} from '../../src/renderer/applied-time-buckets'

const EMPTY_CUSTOMER = {
  recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: '',
}
const EMPTY_AFTERSALE = {
  aftersaleType: '', aftersaleReason: '', shippingStatus: '',
  amount: null, refundAmount: null, appliedAt: null, returnLogistics: '',
} as const
function mk(over: Partial<Ticket> = {}): Ticket {
  return {
    aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '',
    status: '待商家处理', note: '', createdAt: 0, updatedAt: 0,
    ...EMPTY_CUSTOMER, ...EMPTY_AFTERSALE, ...over,
  }
}
const at = (y: number, m: number, d: number) => new Date(y, m, d, 10, 0, 0).getTime()

describe('spanDays', () => {
  it('counts both endpoints (same day = 1)', () => {
    expect(spanDays(at(2026, 5, 18), at(2026, 5, 18))).toBe(1)
    expect(spanDays(at(2026, 5, 12), at(2026, 5, 18))).toBe(7)
  })
})

describe('chooseGranularity', () => {
  it('hour for a single day, day ≤31, week ≤180, else month', () => {
    expect(chooseGranularity(1)).toBe('hour')
    expect(chooseGranularity(2)).toBe('day')
    expect(chooseGranularity(31)).toBe('day')
    expect(chooseGranularity(32)).toBe('week')
    expect(chooseGranularity(180)).toBe('week')
    expect(chooseGranularity(181)).toBe('month')
  })
})

describe('bucketByAppliedTime', () => {
  it('buckets a single-day range by hour (24 hourly buckets)', () => {
    const dayStart = new Date(2026, 5, 18, 0, 0, 0, 0).getTime()
    const dayEnd = new Date(2026, 5, 18, 23, 59, 59, 999).getTime()
    const hour = (h: number) => new Date(2026, 5, 18, h, 30, 0).getTime()
    const r = bucketByAppliedTime(
      [mk({ appliedAt: hour(9) }), mk({ appliedAt: hour(9) }), mk({ appliedAt: hour(14) })],
      dayStart, dayEnd,
    )
    expect(r.granularity).toBe('hour')
    expect(r.buckets.length).toBe(24)
    expect(r.buckets[0].label).toBe('00:00')
    expect(r.buckets[9].label).toBe('09:00')
    expect(r.buckets[9].count).toBe(2)
    expect(r.buckets[14].count).toBe(1)
    expect(r.buckets[23].label).toBe('23:00')
    expect(r.total).toBe(3)
  })

  it('buckets by day across the given range, zero-filling gaps', () => {
    const tickets = [
      mk({ appliedAt: at(2026, 5, 12) }),
      mk({ appliedAt: at(2026, 5, 12) }),
      mk({ appliedAt: at(2026, 5, 14) }),
    ]
    const r = bucketByAppliedTime(tickets, at(2026, 5, 12), at(2026, 5, 14))
    expect(r.granularity).toBe('day')
    expect(r.buckets.map((b) => b.label)).toEqual(['6/12', '6/13', '6/14'])
    expect(r.buckets.map((b) => b.count)).toEqual([2, 0, 1])
    expect(r.total).toBe(3)
  })

  it('ignores tickets without appliedAt', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: null }), mk({ appliedAt: at(2026, 5, 18) })],
      at(2026, 5, 18), at(2026, 5, 18))
    expect(r.total).toBe(1)
  })

  it('derives the range from min/max appliedAt when from/to are null', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: at(2026, 5, 10) }), mk({ appliedAt: at(2026, 5, 12) })], null, null)
    expect(r.granularity).toBe('day')
    expect(r.buckets.map((b) => b.label)).toEqual(['6/10', '6/11', '6/12'])
    expect(r.total).toBe(2)
  })

  it('switches to weekly buckets for spans over a month', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: at(2026, 3, 1) })], at(2026, 2, 1), at(2026, 4, 30))
    expect(r.granularity).toBe('week')
    expect(r.total).toBe(1)
  })

  it('switches to monthly buckets for spans over ~half a year', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: at(2025, 1, 15) })], at(2025, 0, 1), at(2025, 11, 31))
    expect(r.granularity).toBe('month')
    expect(r.buckets[0].label).toBe('2025-01')
    expect(r.buckets.length).toBe(12)
  })

  it('returns an empty result when no ticket has appliedAt', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: null })], null, null)
    expect(r).toEqual({ granularity: 'day', buckets: [], total: 0 })
  })

  it('formats weekly bucket labels as the Monday M/D', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: at(2026, 3, 1) })], at(2026, 2, 1), at(2026, 4, 30))
    expect(r.granularity).toBe('week')
    const wk = r.buckets.find((b) => b.key === '2026-03-30')
    expect(wk).toBeDefined()
    expect(wk!.label).toBe('3/30')
    expect(wk!.count).toBe(1)
  })

  it('excludes tickets whose appliedAt falls outside an explicit range', () => {
    const r = bucketByAppliedTime(
      [mk({ appliedAt: at(2026, 5, 10) }), mk({ appliedAt: at(2026, 5, 14) })],
      at(2026, 5, 12), at(2026, 5, 14),
    )
    expect(r.total).toBe(1)
    expect(r.buckets.map((b) => b.label)).toEqual(['6/12', '6/13', '6/14'])
    expect(r.buckets.map((b) => b.count)).toEqual([0, 0, 1])
  })
})

describe('summaryText', () => {
  it('reads "共 N 单 / M 天" with the unit matching granularity', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: at(2026, 5, 12) })], at(2026, 5, 12), at(2026, 5, 14))
    expect(summaryText(r)).toBe('共 1 单 / 3 天')
  })

  it('uses 小时 as the unit for single-day (hourly) ranges', () => {
    const dayStart = new Date(2026, 5, 18, 0, 0, 0, 0).getTime()
    const dayEnd = new Date(2026, 5, 18, 23, 59, 59, 999).getTime()
    const r = bucketByAppliedTime([mk({ appliedAt: new Date(2026, 5, 18, 9, 0, 0).getTime() })], dayStart, dayEnd)
    expect(summaryText(r)).toBe('共 1 单 / 24 小时')
  })
})
