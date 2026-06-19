import { describe, it, expect } from 'vitest'
import { detectColumns, planEnrich } from '../../src/main/services/enrich-region'
import { parseSheet } from '../../src/main/services/ticket-importer'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Ticket } from '../../src/shared/types'

const tk = (o: Partial<Ticket>): Ticket => o as Ticket

describe('detectColumns', () => {
  it('finds order + single 省市区 column', () => {
    expect(detectColumns(['订单号', '省市区', '快递单号'])).toMatchObject({ order: 0, region: 1 })
  })
  it('finds separate 省/市/区 columns', () => {
    const c = detectColumns(['订单号', '省', '市', '区'])
    expect(c).toMatchObject({ order: 0, region: -1, prov: 1, city: 2, dist: 3 })
  })
  it('throws when order column missing', () => { expect(() => detectColumns(['省市区'])).toThrow() })
  it('throws when region column missing', () => { expect(() => detectColumns(['订单号'])).toThrow() })
})

describe('planEnrich', () => {
  const cols = { order: 0, region: 1, prov: -1, city: -1, dist: -1 }
  const rows = [
    ['260619-A', '云南省/曲靖市/师宗县'],
    ['260619-B', '江苏省/徐州市/新沂市'],
    ['260619-C', '火星省/x/y'],       // unresolved
    ['260619-D', '广东省/深圳市/福田区'], // no matching ticket
  ]
  const tickets = [
    tk({ aftersaleNo: 'AS1', orderNo: '260619-A', province: '' }),               // fill
    tk({ aftersaleNo: 'AS1b', orderNo: '260619-A', province: '' }),              // same order → also fill
    tk({ aftersaleNo: 'AS2', orderNo: '260619-B', province: '江苏省' }),          // already has region → skip
    tk({ aftersaleNo: 'AS3', orderNo: '260619-Z', province: '' }),               // order not in file
  ]

  it('fills blank tickets, skips ones with region, counts everything', () => {
    const { patches, result } = planEnrich(rows, cols, tickets)
    expect(patches.map((p) => p.aftersaleNo).sort()).toEqual(['AS1', 'AS1b'])
    expect(patches[0].patch.province).toBe('云南省')
    expect(patches[0].patch.districtCode).not.toBe('')
    expect(result).toMatchObject({ rows: 4, updated: 2, skippedHasRegion: 1, unresolved: 1 })
    expect(result.withRegion).toBe(3)      // A, B, D resolved
    expect(result.noTicket).toBe(1)        // D has no ticket
    expect(result.matchedTickets).toBe(3)  // AS1, AS1b, AS2
  })
})

describe('parseSheet', () => {
  it('parses a csv into rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-csv-'))
    const f = join(dir, 't.csv')
    writeFileSync(f, '订单号,省市区\n260619-A,云南省/曲靖市/师宗县\n')
    const rows = parseSheet(f)
    expect(rows[0]).toEqual(['订单号', '省市区'])
    expect(rows[1][0]).toBe('260619-A')
    rmSync(dir, { recursive: true, force: true })
  })
})
