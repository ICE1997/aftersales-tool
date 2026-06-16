import { childrenOf, type Region } from './region'

export interface ExtractedContact {
  name: string
  phone: string
  extension: string
  provinceCode: string; province: string
  cityCode: string; city: string
  districtCode: string; district: string
  addressDetail: string
}

const EMPTY: ExtractedContact = {
  name: '', phone: '', extension: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: ''
}

// Remove [..] / 【..】 short-code noise, collapse whitespace.
function stripBrackets(s: string): string {
  return s.replace(/[[【][^\]】]*[\]】]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Remove a leading field label like 收货人: / 电话: / 收货地址: etc.
function stripLabel(s: string): string {
  return s.replace(/^(收货人|收件人|姓名|联系人|联系电话|联系方式|电话|手机号|手机|收货地址|所在地区|地址)[:：\s]*/, '').trim()
}

// Earliest (then longest) region whose name appears in `text`.
function findRegion(text: string, list: Region[]): { region: Region; index: number } | null {
  let best: { region: Region; index: number } | null = null
  for (const r of list) {
    const idx = text.indexOf(r.name)
    if (idx < 0) continue
    if (!best || idx < best.index || (idx === best.index && r.name.length > best.region.name.length)) {
      best = { region: r, index: idx }
    }
  }
  return best
}

function cut(text: string, index: number, len: number): string {
  return (text.slice(0, index) + ' ' + text.slice(index + len)).replace(/\s+/g, ' ').trim()
}

export function extractContact(text: string): ExtractedContact {
  const out: ExtractedContact = { ...EMPTY }
  if (!text || !text.trim()) return out

  const lines = text.split(/\r?\n/).map((l) => stripLabel(stripBrackets(l))).filter((l) => l.length > 0)

  // 1) phone (+ optional extension)
  const phoneRe = /(?<!\d)(1[3-9]\d{9})(?:\s*(?:转|分机|ext\.?|[,，])\s*(\d{1,6}))?/i
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(phoneRe)
    if (!m) continue
    out.phone = m[1]
    if (m[2]) out.extension = m[2]
    lines[i] = lines[i].replace(m[0], ' ').replace(/\s+/g, ' ').trim()
    break
  }

  // 2) address: first line containing a province name
  const provinces = childrenOf('')
  let addrIdx = -1
  let provHit: { region: Region; index: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const h = findRegion(lines[i], provinces)
    if (h) { provHit = h; addrIdx = i; break }
  }
  if (provHit && addrIdx >= 0) {
    const line = lines[addrIdx]
    const before = line.slice(0, provHit.index).trim() // flow-format name may sit before the province
    let rest = line.slice(provHit.index + provHit.region.name.length)
    out.provinceCode = provHit.region.code
    out.province = provHit.region.name

    const cities = childrenOf(provHit.region.code).filter((c) => c.name.length > 1)
    const cityHit = findRegion(rest, cities)
    let city: Region | undefined = cityHit?.region
    if (cityHit) rest = cut(rest, cityHit.index, cityHit.region.name.length)
    else city = cities.find((c) => c.name === '市辖区') // 直辖市: single 市辖区 child
    if (city) {
      out.cityCode = city.code
      out.city = city.name
      const distHit = findRegion(rest, childrenOf(city.code))
      if (distHit) {
        out.districtCode = distHit.region.code
        out.district = distHit.region.name
        rest = cut(rest, distHit.index, distHit.region.name.length)
      }
    }
    out.addressDetail = rest.replace(/^[\s,，、]+/, '').replace(/\s+/g, ' ').trim()
    lines[addrIdx] = ''
    if (before) out.name = before.split(/\s+/)[0]
  }

  // 3) name fallback: first remaining non-empty line
  if (!out.name) {
    for (const l of lines) {
      const t = l.trim()
      if (t) { out.name = t.split(/\s+/)[0]; break }
    }
  }

  return out
}
