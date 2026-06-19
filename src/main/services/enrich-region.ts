import type { Ticket, EnrichResult } from '../../shared/types'
import { resolveRegion, splitRegionCell } from '../../shared/region-data'

export interface EnrichColumns { order: number; region: number; prov: number; city: number; dist: number }
export interface RegionPatch { provinceCode: string; province: string; cityCode: string; city: string; districtCode: string; district: string }

export function detectColumns(header: string[]): EnrichColumns {
  const h = header.map((x) => (x ?? '').trim())
  const find = (pred: (s: string) => boolean) => h.findIndex(pred)
  const order = find((s) => s.includes('订单号'))
  const region = find((s) => ['省市区', '省市县', '地区', '收货地区', '省市'].includes(s))
  const prov = find((s) => s === '省' || s === '省份')
  const city = find((s) => s === '市' || s === '城市')
  const dist = find((s) => s === '区' || s === '县' || s === '区县')
  if (order < 0) throw new Error('未找到「订单号」列')
  if (region < 0 && prov < 0) throw new Error('未找到「省市区」列')
  return { order, region, prov, city, dist }
}

export function planEnrich(
  dataRows: string[][],
  cols: EnrichColumns,
  tickets: Ticket[],
): { patches: { aftersaleNo: string; patch: RegionPatch }[]; result: EnrichResult } {
  const regionByOrder = new Map<string, RegionPatch>()
  let withRegion = 0
  let unresolved = 0
  for (const row of dataRows) {
    const orderNo = (row[cols.order] ?? '').trim()
    if (!orderNo) continue
    let p: string, c: string, d: string
    if (cols.region >= 0) {
      const s = splitRegionCell(row[cols.region] ?? '')
      p = s.p; c = s.c; d = s.d
    } else {
      p = (row[cols.prov] ?? '').trim()
      c = cols.city >= 0 ? (row[cols.city] ?? '').trim() : ''
      d = cols.dist >= 0 ? (row[cols.dist] ?? '').trim() : ''
    }
    const r = resolveRegion(p, c, d)
    if (!r.province) { unresolved++; continue }
    if (!regionByOrder.has(orderNo)) { regionByOrder.set(orderNo, r); withRegion++ }
  }
  const patches: { aftersaleNo: string; patch: RegionPatch }[] = []
  const ordersWithTicket = new Set<string>()
  let matchedTickets = 0, updated = 0, skippedHasRegion = 0
  for (const t of tickets) {
    const r = regionByOrder.get(t.orderNo)
    if (!r) continue
    ordersWithTicket.add(t.orderNo)
    matchedTickets++
    if (t.province !== '') { skippedHasRegion++; continue }
    patches.push({ aftersaleNo: t.aftersaleNo, patch: r })
    updated++
  }
  const noTicket = [...regionByOrder.keys()].filter((o) => !ordersWithTicket.has(o)).length
  return { patches, result: { rows: dataRows.length, withRegion, matchedTickets, updated, skippedHasRegion, noTicket, unresolved } }
}
