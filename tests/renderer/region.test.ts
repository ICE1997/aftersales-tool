import { describe, it, expect } from 'vitest'
import { childrenOfIn, regionLabel, type Region } from '../../src/renderer/region'

const fixture: Region[] = [
  { code: '44', name: '广东省', parent: '' },
  { code: '11', name: '北京市', parent: '' },
  { code: '4403', name: '深圳市', parent: '44' },
  { code: '440305', name: '南山区', parent: '4403' }
]

describe('childrenOfIn', () => {
  it('returns top-level provinces for empty parent', () => {
    expect(childrenOfIn(fixture, '').map((r) => r.name)).toEqual(['广东省', '北京市'])
  })
  it('returns cities of a province', () => {
    expect(childrenOfIn(fixture, '44').map((r) => r.name)).toEqual(['深圳市'])
  })
  it('returns districts of a city', () => {
    expect(childrenOfIn(fixture, '4403').map((r) => r.name)).toEqual(['南山区'])
  })
})

describe('regionLabel', () => {
  it('joins non-empty parts with separators', () => {
    expect(regionLabel({ province: '广东省', city: '深圳市', district: '南山区' })).toBe('广东省 · 深圳市 · 南山区')
  })
  it('omits empty parts', () => {
    expect(regionLabel({ province: '广东省', city: '', district: '' })).toBe('广东省')
  })
  it('returns empty string when all empty', () => {
    expect(regionLabel({})).toBe('')
  })
})
