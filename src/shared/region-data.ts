import data from './china-divisions.json'

export interface Region { code: string; name: string; parent: string }
export const REGIONS = data as Region[]

export interface ResolvedRegion { provinceCode: string; province: string; cityCode: string; city: string; districtCode: string; district: string }
const EMPTY: ResolvedRegion = { provinceCode: '', province: '', cityCode: '', city: '', districtCode: '', district: '' }

const SUFFIX = /(省|自治区|特别行政区|自治州|地区|盟|市|区|县)$/
function findByName(parent: string, name: string): Region | undefined {
  const n = (name ?? '').trim()
  if (!n) return undefined
  const kids = REGIONS.filter((r) => r.parent === parent)
  const bare = (s: string) => s.replace(SUFFIX, '')
  return kids.find((r) => r.name === n)
    ?? kids.find((r) => bare(r.name) === bare(n))
}

export function resolveRegion(p: string, c: string, d: string): ResolvedRegion {
  const prov = findByName('', p)
  if (!prov) return { ...EMPTY }
  const res: ResolvedRegion = { ...EMPTY, provinceCode: prov.code, province: prov.name }
  const city = findByName(prov.code, c)
  if (city) {
    res.cityCode = city.code; res.city = city.name
    const dist = findByName(city.code, d)
    if (dist) { res.districtCode = dist.code; res.district = dist.name }
  }
  return res
}

export function splitRegionCell(cell: string): { p: string; c: string; d: string } {
  const raw = (cell ?? '').trim()
  if (!raw) return { p: '', c: '', d: '' }
  let parts = raw.split(/[/\\·,，、>\s-]+/).map((s) => s.trim()).filter(Boolean)
  if (parts.length === 1) {
    const m = raw.match(/^(.+?(?:省|自治区|特别行政区|市))(.+?(?:市|自治州|地区|盟))?(.+)?$/)
    if (m) parts = [m[1], m[2] ?? '', m[3] ?? ''].map((s) => (s || '').trim()).filter(Boolean)
  }
  return { p: parts[0] ?? '', c: parts[1] ?? '', d: parts[2] ?? '' }
}
