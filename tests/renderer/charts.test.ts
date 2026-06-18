import { describe, it, expect } from 'vitest'
import { barOption, appliedTimeBarOption } from '../../src/renderer/charts'
import type { RegionCount } from '../../src/shared/types'
import type { Bucket } from '../../src/renderer/applied-time-buckets'

describe('barOption', () => {
  it('takes the top 20 and puts the highest at the top of the horizontal bar', () => {
    const data: RegionCount[] = Array.from({ length: 25 }, (_, i) => ({ code: String(i), name: 'R' + i, count: 25 - i }))
    const o = barOption(data) as any
    expect(o.yAxis.data.length).toBe(20)
    expect(o.series[0].data.length).toBe(20)
    expect(o.yAxis.data[19]).toBe('R0')   // highest count rendered last → top
    expect(o.series[0].data[19]).toBe(25)
  })
  it('handles fewer than 20 rows', () => {
    const o = barOption([{ code: 'a', name: '甲', count: 3 }]) as any
    expect(o.yAxis.data).toEqual(['甲'])
    expect(o.series[0].data).toEqual([3])
  })
})

describe('appliedTimeBarOption', () => {
  const buckets: Bucket[] = [
    { key: '2026-06-12', label: '6/12', count: 2 },
    { key: '2026-06-13', label: '6/13', count: 0 },
    { key: '2026-06-14', label: '6/14', count: 1 },
  ]
  it('maps labels to the category x-axis and counts to the bar series', () => {
    const o = appliedTimeBarOption(buckets) as any
    expect(o.xAxis.type).toBe('category')
    expect(o.xAxis.data).toEqual(['6/12', '6/13', '6/14'])
    expect(o.yAxis.type).toBe('value')
    expect(o.series[0].type).toBe('bar')
    expect(o.series[0].data).toEqual([2, 0, 1])
  })
  it('handles an empty bucket list', () => {
    const o = appliedTimeBarOption([]) as any
    expect(o.xAxis.data).toEqual([])
    expect(o.series[0].data).toEqual([])
  })
})
