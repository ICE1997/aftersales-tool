# Enrich Ticket Region (from supplementary file) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a supplementary csv/xls/xlsx file, match rows to tickets by order number, and fill the ticket's blank 省/市/区 from the file (names resolved to region codes).

**Architecture:** Move the region dataset + a pure name→code resolver to `shared/`. A pure core (`parseSheet`, `detectColumns`, `planEnrich`) turns file rows + tickets into a list of `{aftersaleNo, patch}` + a result summary. A main IPC opens the file dialog, runs the core, applies patches via `TicketRepo.update`, and returns the summary; the renderer adds a 补充信息 button + a result dialog.

**Tech Stack:** Electron main, SheetJS (xlsx, already a dep — reads xlsx/xls/csv), better-sqlite3/Knex, React/TS renderer, Vitest.

## Global Constraints

- Local main worktree only: commit to `main`, **never push / force / rewrite refs**.
- Match key: **order number only**. Fill policy: **only when the ticket's `province` is blank** (skip the whole ticket otherwise). Partial resolve is valid (province-only fills province; success). Province unresolved → that row is `unresolved`, skipped.
- Region dataset is `china-divisions.json` (flat `{code,name,parent}`); resolution cascades province→city→district. Name matching: exact, then suffix-tolerant (strip 省/市/区/县/自治区/自治州/盟/地区/特别行政区), then prefix.
- Only enrich 省/市/区 (+ their codes). Do NOT touch recipient/phone/address. No overwrite, no column-mapping UI, no alias matching (YAGNI).
- After `npm run dev`, run `npm run rebuild:node` before vitest.

---

### Task 1: Region data + resolver moved to shared (pure)

**Files:**
- Move: `src/renderer/china-divisions.json` → `src/shared/china-divisions.json` (use `git mv`)
- Create: `src/shared/region-data.ts`
- Modify: `src/renderer/region.ts` (import `REGIONS`/`Region` from shared instead of the local json)
- Test: `tests/shared/region-data.test.ts`

**Interfaces:**
- Produces (`src/shared/region-data.ts`):
  - `interface Region { code: string; name: string; parent: string }`
  - `const REGIONS: Region[]`
  - `interface ResolvedRegion { provinceCode: string; province: string; cityCode: string; city: string; districtCode: string; district: string }`
  - `resolveRegion(p: string, c: string, d: string): ResolvedRegion` (cascade; `province===''` means province unresolved)
  - `splitRegionCell(cell: string): { p: string; c: string; d: string }`

- [ ] **Step 1: Write the failing test** — `tests/shared/region-data.test.ts`

```ts
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
```

- [ ] **Step 2: Run — expect FAIL** `npx vitest run tests/shared/region-data.test.ts`

- [ ] **Step 3: Implement**
  - `git mv src/renderer/china-divisions.json src/shared/china-divisions.json`
  - `src/shared/region-data.ts`:
    ```ts
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
        ?? kids.find((r) => r.name.startsWith(n) || n.startsWith(r.name))
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
      let parts = raw.split(/[/\\·,，>\s-]+/).map((s) => s.trim()).filter(Boolean)
      if (parts.length === 1) {
        const m = raw.match(/^(.+?(?:省|自治区|特别行政区|市))(.+?(?:市|自治州|地区|盟))?(.+)?$/)
        if (m) parts = [m[1], m[2] ?? '', m[3] ?? ''].map((s) => (s || '').trim()).filter(Boolean)
      }
      return { p: parts[0] ?? '', c: parts[1] ?? '', d: parts[2] ?? '' }
    }
    ```
  - `src/renderer/region.ts`: replace `import data from './china-divisions.json'` + `const ALL = data as Region[]` with `import { REGIONS as ALL, type Region } from '@shared/region-data'`, and remove the local `interface Region` (re-export it: `export type { Region } from '@shared/region-data'` if other renderer files import `Region` from `'../region'` — check with grep and keep those imports working). Keep `childrenOfIn`/`childrenOf`/`regionLabel` unchanged.

- [ ] **Step 4: Run — expect PASS** `npm run rebuild:node && npx vitest run tests/shared/region-data.test.ts tests/renderer/region.test.tsx` (run the existing region test too if present — keep it green; if its path differs, run `npx vitest run` filtered to region).
- [ ] **Step 5: Commit** `git add -A && git commit -m "refactor(region): move china-divisions + add resolveRegion/splitRegionCell to shared"`

---

### Task 2: Enrich core — parseSheet + detectColumns + planEnrich (pure)

**Files:**
- Modify: `src/main/services/ticket-importer.ts` (add `parseSheet`)
- Create: `src/main/services/enrich-region.ts`
- Modify: `src/shared/types.ts` (add `EnrichResult`)
- Test: `tests/services/enrich-region.test.ts`

**Interfaces:**
- Consumes: `resolveRegion`, `splitRegionCell` (Task 1); `Ticket` (`@shared/types`).
- Produces:
  - `src/main/services/ticket-importer.ts`: `parseSheet(path: string): string[][]` (xlsx/xls/csv via `XLSX.read`).
  - `src/shared/types.ts`: `interface EnrichResult { rows: number; withRegion: number; matchedTickets: number; updated: number; skippedHasRegion: number; noTicket: number; unresolved: number }`
  - `src/main/services/enrich-region.ts`:
    - `interface EnrichColumns { order: number; region: number; prov: number; city: number; dist: number }`
    - `interface RegionPatch { provinceCode: string; province: string; cityCode: string; city: string; districtCode: string; district: string }`
    - `detectColumns(header: string[]): EnrichColumns` (throws if no order col / no region col)
    - `planEnrich(dataRows: string[][], cols: EnrichColumns, tickets: Ticket[]): { patches: { aftersaleNo: string; patch: RegionPatch }[]; result: EnrichResult }`

- [ ] **Step 1: Write the failing test** — `tests/services/enrich-region.test.ts`

```ts
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
```

- [ ] **Step 2: Run — expect FAIL** `npm run rebuild:node && npx vitest run tests/services/enrich-region.test.ts`

- [ ] **Step 3: Implement**
  - In `ticket-importer.ts` add (alongside `parseXlsx`, same body — SheetJS `XLSX.read` auto-detects xlsx/xls/csv):
    ```ts
    /** Read the first sheet of an .xlsx/.xls/.csv file into a 2-D string array. */
    export function parseSheet(path: string): string[][] {
      const wb = XLSX.read(readFileSync(path), { type: 'buffer' })
      const name = wb.SheetNames[0]
      const sheet = name ? wb.Sheets[name] : undefined
      if (!sheet) return []
      return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
    }
    ```
  - Add `EnrichResult` to `src/shared/types.ts` (the interface above).
  - `src/main/services/enrich-region.ts`:
    ```ts
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

    export function planEnrich(dataRows: string[][], cols: EnrichColumns, tickets: Ticket[]): { patches: { aftersaleNo: string; patch: RegionPatch }[]; result: EnrichResult } {
      const regionByOrder = new Map<string, RegionPatch>()
      let withRegion = 0
      let unresolved = 0
      for (const row of dataRows) {
        const orderNo = (row[cols.order] ?? '').trim()
        if (!orderNo) continue
        let p = '', c = '', d = ''
        if (cols.region >= 0) { const s = splitRegionCell(row[cols.region] ?? ''); p = s.p; c = s.c; d = s.d }
        else { p = (row[cols.prov] ?? '').trim(); c = cols.city >= 0 ? (row[cols.city] ?? '').trim() : ''; d = cols.dist >= 0 ? (row[cols.dist] ?? '').trim() : '' }
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
    ```

- [ ] **Step 4: Run — expect PASS** `npx vitest run tests/services/enrich-region.test.ts`
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(enrich): parseSheet + detectColumns + planEnrich core"`

---

### Task 3: IPC + preload glue

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `parseSheet`, `detectColumns`, `planEnrich` (Task 2); `tickets` repo (`list()`, `update(no, patch)`); `EnrichResult`.
- Produces: preload `enrichRegion(): Promise<EnrichResult | null>` (null on cancel).

- [ ] **Step 1:** In `ipc.ts` add the handler:
  ```ts
  ipcMain.handle('tickets:enrichRegion', async (): Promise<import('../shared/types').EnrichResult | null> => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: '数据表', extensions: ['xlsx', 'xls', 'csv'] }] })
    if (r.canceled || !r.filePaths[0]) return null
    const grid = parseSheet(r.filePaths[0])
    if (grid.length < 2) throw new Error('文件没有数据行')
    const cols = detectColumns(grid[0])
    const { patches, result } = planEnrich(grid.slice(1), cols, await tickets.list())
    for (const { aftersaleNo, patch } of patches) await tickets.update(aftersaleNo, patch)
    return result
  })
  ```
  Add imports: `parseSheet` from `./services/ticket-importer` (extend the existing `{ parseXlsx }` import), `detectColumns, planEnrich` from `./services/enrich-region`. `dialog` and `tickets` are already in scope.
- [ ] **Step 2:** In `preload/index.ts` add: `enrichRegion: (): Promise<EnrichResult | null> => ipcRenderer.invoke('tickets:enrichRegion'),` and import the `EnrichResult` type (add to the existing `@shared/types`-equivalent import from `'../shared/types'`).
- [ ] **Step 3: Verify** `npx tsc --noEmit` → 0; `npm run lint` → clean; `npm run build` → clean.
- [ ] **Step 4: Commit** `git commit -am "feat(enrich): tickets:enrichRegion ipc + preload"`

---

### Task 4: Renderer — 补充信息 button + result dialog

**Files:**
- Create: `src/renderer/components/EnrichResultDialog.tsx`
- Modify: `src/renderer/views/TicketsView.tsx`

**Interfaces:**
- Consumes: `api.enrichRegion()` (Task 3); `EnrichResult`.

- [ ] **Step 1: Build `EnrichResultDialog.tsx`** — mirror `ImportResultDialog.tsx` (scrim + modal-card): `Props { result: EnrichResult | null; onClose: () => void }`; title 「补充完成」; list: 数据行 `{rows}`、含地区 `{withRegion}`、匹配售后单 `{matchedTickets}`、已补充地区 `{updated}`、跳过(已有地区) `{skippedHasRegion}`、无匹配订单 `{noTicket}`、地名无法解析 `{unresolved}`; 完成 button → onClose.
- [ ] **Step 2: Wire into `TicketsView.tsx`:**
  - Add state `const [enrichResult, setEnrichResult] = useState<EnrichResult | null>(null)` (import `EnrichResult` from `@shared/types`).
  - Add `async function enrich() { try { const r = await api.enrichRegion(); if (r) { setEnrichResult(r); await load() } } catch (e) { setError(\`补充失败:${(e as Error).message}\`) } }` (mirror the existing `importTickets`; `setError`/`load` already exist).
  - In the list-tab toolbar (the `right` slot of `ViewTabs`, beside 导入售后单 `<button ... onClick={importTickets}>`), add `<button className="btn-ghost px-3 py-1.5 text-sm" onClick={enrich}><IconImport className="text-[15px]" /> 补充信息</button>`.
  - Render `<EnrichResultDialog result={enrichResult} onClose={() => setEnrichResult(null)} />` next to `<ImportResultDialog .../>`.
- [ ] **Step 3: Verify** `npx tsc --noEmit` → 0; `npm run lint` → clean; `npm run build` → clean; `npm run rebuild:node && npx vitest run` → all pass (if `material-watch.test.ts` is the only failure, re-run it once).
- [ ] **Step 4: Launch-verify** `npm run dev`: 补充信息 → pick the sample `fad1c67…xlsx` → result dialog shows non-zero 已补充/含地区; a ticket whose order is in the file gets its 省/市/区 filled. (Then `npm run rebuild:node` before further vitest.)
- [ ] **Step 5: Commit** `git commit -am "feat(enrich): 补充信息 button + result dialog"`

---

## Self-Review

**Spec coverage:** csv/xls/xlsx parse (T2 parseSheet) ✓; match by order number (T2 planEnrich) ✓; fill blank only / skip ticket with region (T2) ✓; partial-resolve valid + province-unresolved→unresolved (T1 resolveRegion + T2) ✓; region cell single-col + separate cols (T2 detectColumns + splitRegionCell) ✓; name→code via shared resolver, data moved to shared (T1) ✓; result counts {rows,withRegion,matchedTickets,updated,skippedHasRegion,noTicket,unresolved} (T2 EnrichResult, T4 dialog) ✓; missing column → throw → error toast (T2 detectColumns, T3, T4) ✓; entry button beside 导入售后单 (T4) ✓; only region touched, no overwrite/mapping/alias (all) ✓.

**Placeholder scan:** none — full code for the pure cores (T1/T2) and exact handler/wiring for T3/T4; the dialog (T4) is specified as a mirror of the existing `ImportResultDialog` with the exact field list.

**Type consistency:** `ResolvedRegion`/`RegionPatch` share the 6 fields used by `tickets.update`'s `CustomerFields` patch; `EnrichColumns` shape matches T2↔(detectColumns/planEnrich); `EnrichResult` field names identical across T2 (type), T3 (return), T4 (dialog); `parseSheet`/`detectColumns`/`planEnrich` names match T2↔T3. `region.ts` consuming `REGIONS`/`Region` from `@shared/region-data` matches T1.
