import { describe, it, expect, vi } from 'vitest'
import { toAdcode, mapData, makeGeoLoader } from '../../src/renderer/geo'

describe('toAdcode', () => {
  it('right-pads short GB codes to a 6-digit adcode', () => {
    expect(toAdcode('44')).toBe('440000')
    expect(toAdcode('4403')).toBe('440300')
    expect(toAdcode('440305')).toBe('440305')
    expect(toAdcode('110000')).toBe('110000')
  })
})

describe('mapData', () => {
  const features = [
    { properties: { adcode: 440000, name: '广东省' } },
    { properties: { adcode: 330000, name: '浙江省' } },
    { properties: { adcode: 110000, name: '北京市' } }
  ]
  it('maps counts by adcode, 0 when missing, and reports max', () => {
    const { rows, max } = mapData(features, { '440000': 5, '330000': 3 })
    expect(rows).toEqual([
      { name: '广东省', value: 5 },
      { name: '浙江省', value: 3 },
      { name: '北京市', value: 0 }
    ])
    expect(max).toBe(5)
  })
  it('max is 0 for all-empty', () => {
    expect(mapData(features, {}).max).toBe(0)
  })
})

describe('makeGeoLoader', () => {
  it('loads via the module map and caches', async () => {
    const loader = vi.fn(async () => ({ default: { type: 'FeatureCollection', features: [] } }))
    const load = makeGeoLoader({ './geo/100000.json': loader })
    const a = await load('100000')
    const b = await load('100000')
    expect(a).toBe(b)
    expect(loader).toHaveBeenCalledTimes(1)
  })
  it('throws for a missing adcode', async () => {
    const load = makeGeoLoader({})
    await expect(load('999999')).rejects.toThrow(/not found/i)
  })
})
