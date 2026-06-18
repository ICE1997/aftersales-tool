import { describe, it, expect } from 'vitest'
import type { Ticket } from '@shared/types'
import { regionCountsFromTickets } from '../../src/renderer/region-counts'

const mk = (o: Partial<Ticket>): Ticket => o as unknown as Ticket

describe('regionCountsFromTickets', () => {
  it('groups by province, count desc then name asc, skipping unclassified', () => {
    const ts = [
      mk({ provinceCode: '44', province: '广东省' }),
      mk({ provinceCode: '44', province: '广东省' }),
      mk({ provinceCode: '11', province: '北京市' }),
      mk({ provinceCode: '', province: '' }), // unclassified → skipped
    ]
    expect(regionCountsFromTickets(ts, 'province')).toEqual([
      { code: '44', name: '广东省', count: 2 },
      { code: '11', name: '北京市', count: 1 },
    ])
  })

  it('aggregates by the chosen level (city)', () => {
    const ts = [
      mk({ cityCode: '4401', city: '广州市' }),
      mk({ cityCode: '4401', city: '广州市' }),
      mk({ cityCode: '4403', city: '深圳市' }),
    ]
    expect(regionCountsFromTickets(ts, 'city')).toEqual([
      { code: '4401', name: '广州市', count: 2 },
      { code: '4403', name: '深圳市', count: 1 },
    ])
  })

  it('returns an empty list when nothing is classified', () => {
    expect(regionCountsFromTickets([mk({ districtCode: '', district: '' })], 'district')).toEqual([])
  })
})
