import { describe, it, expect } from 'vitest'
import { resolveRegion, splitRegionCell, REGIONS } from '../../src/shared/region-data'

describe('REGIONS dataset', () => {
  it('is a non-empty flat list with province entries (parent "")', () => {
    expect(REGIONS.length).toBeGreaterThan(3000)
    expect(REGIONS.some((r) => r.parent === '' && r.name.includes('云南'))).toBe(true)
  })
})

describe('splitRegionCell', () => {
  it('splits slash/space separated', () => {
    expect(splitRegionCell('云南省/曲靖市/师宗县')).toEqual({ p: '云南省', c: '曲靖市', d: '师宗县' })
    expect(splitRegionCell('江苏省 徐州市 新沂市')).toEqual({ p: '江苏省', c: '徐州市', d: '新沂市' })
  })
  it('best-effort splits a concatenated string', () => {
    expect(splitRegionCell('云南省曲靖市师宗县')).toEqual({ p: '云南省', c: '曲靖市', d: '师宗县' })
  })
  it('empty → all blank', () => { expect(splitRegionCell('')).toEqual({ p: '', c: '', d: '' }) })
})

describe('resolveRegion', () => {
  it('resolves province/city/district to codes+names', () => {
    const r = resolveRegion('云南省', '曲靖市', '师宗县')
    expect(r.province).toBe('云南省'); expect(r.provinceCode).not.toBe('')
    expect(r.city).toBe('曲靖市'); expect(r.cityCode).not.toBe('')
    expect(r.district).toBe('师宗县'); expect(r.districtCode).not.toBe('')
  })
  it('suffix-tolerant (云南 → 云南省)', () => {
    expect(resolveRegion('云南', '', '').province).toBe('云南省')
  })
  it('province-only resolves province, leaves city/district blank', () => {
    const r = resolveRegion('江苏省', '', '')
    expect(r.province).toBe('江苏省'); expect(r.city).toBe(''); expect(r.district).toBe('')
  })
  it('unknown province → all blank', () => {
    expect(resolveRegion('火星省', '', '').province).toBe('')
  })
})
