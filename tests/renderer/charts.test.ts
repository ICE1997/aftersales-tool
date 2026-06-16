import { describe, it, expect } from 'vitest'
import { barOption } from '../../src/renderer/charts'
import type { RegionCount } from '../../src/shared/types'

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
