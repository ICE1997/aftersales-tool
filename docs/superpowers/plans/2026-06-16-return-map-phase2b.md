# 下钻地图 2b 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「统计」页加「排行 / 地图」子切换;地图为 ECharts choropleth,按售后单数着色,支持 全国 → 省 → 市 → 区县 下钻,GeoJSON 全量打包、按 adcode 懒加载。复用 `StatsRepo.regionCounts`,后端不改。

**Architecture:** 纯函数 `toAdcode`/`mapData`(可单测)+ `loadGeo`(import.meta.glob 懒加载 + 缓存);`gen-geo.mjs` 构建期从 DataV 下载 GeoJSON 入 `src/renderer/geo/`;`ReturnMap` 组件用 echarts MapChart 下钻;`StatsView` 加子切换。

**Tech Stack:** ECharts(MapChart/VisualMap)、Vite import.meta.glob、React + TS、Vitest。

> 测试在 system Node ABI 下跑(若 better-sqlite3 NODE_MODULE_VERSION 错误,先 `npm run rebuild:node`)。`npm run dev` 前 `npm run rebuild:electron`。

---

## File Structure
```
src/renderer/geo.ts                       # toAdcode / mapData(纯)+ makeGeoLoader / loadGeo
src/renderer/geo/<adcode>.json            # 由 gen-geo.mjs 生成(全国/各省/各市)
scripts/gen-geo.mjs                       # 构建期从 DataV 下载 GeoJSON
src/renderer/components/ReturnMap.tsx     # ECharts 下钻 choropleth
src/renderer/views/StatsView.tsx          # + 排行/地图 子切换
tests/renderer/geo.test.ts                # toAdcode / mapData / makeGeoLoader 缓存
```

---

## Task 1: geo.ts 纯函数 + 懒加载器

**Files:** Create `src/renderer/geo.ts`; Test `tests/renderer/geo.test.ts`

- [ ] **Step 0: 核对编码格式**

Run: `node -e "const a=require('./src/renderer/china-divisions.json'); const byLen={}; for(const r of a){byLen[r.code.length]=(byLen[r.code.length]||0)+1} console.log(byLen); console.log(a.find(r=>r.parent===''))"`
记录省/市/区县 code 的位数(预期省 6 位如 `440000`,或短码 `44`)。`toAdcode` 下面用"右补 0 到 6 位"对两种都正确;此步只为确认。

- [ ] **Step 1: failing test** `tests/renderer/geo.test.ts`
```ts
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
```

- [ ] **Step 2: run, confirm FAIL** — `npx vitest run tests/renderer/geo.test.ts` → FAIL.

- [ ] **Step 3: implement** `src/renderer/geo.ts`
```ts
/** Normalize a GB region code to a 6-digit adcode (right-pad with 0). */
export function toAdcode(code: string): string {
  return code.length >= 6 ? code.slice(0, 6) : code.padEnd(6, '0')
}

interface Feature { properties: { adcode: number | string; name: string } }

/** Build echarts map data (name→value by adcode, 0 when missing) + the max value. */
export function mapData(features: Feature[], counts: Record<string, number>): { rows: { name: string; value: number }[]; max: number } {
  const rows = features.map((f) => ({ name: f.properties.name, value: counts[String(f.properties.adcode)] ?? 0 }))
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  return { rows, max }
}

type GeoModules = Record<string, () => Promise<{ default: unknown }>>

/** Cached loader over a Vite glob module map (injectable for tests). */
export function makeGeoLoader(modules: GeoModules) {
  const cache = new Map<string, unknown>()
  return async (adcode: string): Promise<unknown> => {
    if (cache.has(adcode)) return cache.get(adcode)
    const loader = modules[`./geo/${adcode}.json`]
    if (!loader) throw new Error(`geo not found: ${adcode}`)
    const geo = (await loader()).default
    cache.set(adcode, geo)
    return geo
  }
}

// Vite statically collects ./geo/*.json into a lazy module map.
export const loadGeo = makeGeoLoader(import.meta.glob('./geo/*.json') as GeoModules)
```

- [ ] **Step 4: run, confirm PASS + full suite** — `npx vitest run tests/renderer/geo.test.ts` → PASS; `npx vitest run` → green. `npm run build` → clean (empty glob is fine until Task 2 adds files).

- [ ] **Step 5: commit**
```bash
git add src/renderer/geo.ts tests/renderer/geo.test.ts
git commit -m "feat: geo helpers (toAdcode, mapData, cached loadGeo)"
```

---

## Task 2: gen-geo.mjs — 下载并打包 GeoJSON（构建期联网）

**Files:** Create `scripts/gen-geo.mjs`; generates `src/renderer/geo/*.json`

> ⚠️ 该任务需联网访问 DataV.GeoAtlas。若环境无法访问,**报 BLOCKED 并说明**;Task 1/3 不依赖这些文件即可构建与单测,只有 Task 4 的真机地图需要它们。

- [ ] **Step 1: write `scripts/gen-geo.mjs`**
```js
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = 'src/renderer/geo'
mkdirSync(OUT, { recursive: true })

// adcodes to fetch: 100000 (national) + each province (_full gives its cities) + each city (_full gives its districts)
const divisions = JSON.parse(readFileSync('src/renderer/china-divisions.json', 'utf-8'))
const toAdcode = (code) => (code.length >= 6 ? code.slice(0, 6) : code.padEnd(6, '0'))
const provinces = divisions.filter((r) => r.parent === '')
const cities = divisions.filter((r) => provinces.some((p) => p.code === r.parent))

// "_full" GeoJSON of a parent contains its children's polygons
const targets = new Set(['100000'])
for (const p of provinces) targets.add(toAdcode(p.code))
for (const c of cities) targets.add(toAdcode(c.code))

const url = (adcode) => `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`

let ok = 0, fail = 0
for (const adcode of targets) {
  const dest = `${OUT}/${adcode}.json`
  if (existsSync(dest)) { ok++; continue }
  try {
    const res = await fetch(url(adcode))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (!json || json.type !== 'FeatureCollection') throw new Error('not a FeatureCollection')
    writeFileSync(dest, JSON.stringify(json))
    ok++
  } catch (e) {
    fail++
    console.warn('skip', adcode, String(e))
  }
  await sleep(120) // be polite
}
console.log(`done: ${ok} ok, ${fail} failed, ${targets.size} targets`)
```
> 注:`<adcode>_full.json` 是该级"包含下级多边形"的文件——全国含各省、某省含其地市、某市含其区县,正好支撑逐级下钻。

- [ ] **Step 2: run it**

Run: `node scripts/gen-geo.mjs`
Expected: 打印 `done: N ok, M failed, T targets`(T 约 370+;少量 failed 可接受——个别市无下级)。若 0 ok 或网络不可达 → 报 BLOCKED。

- [ ] **Step 3: verify samples**

Run: `node -e "for(const a of ['100000','440000','440300']){const g=require('./src/renderer/geo/'+a+'.json'); console.log(a, g.type, (g.features||[]).length)}"`
Expected:每个为 `FeatureCollection` 且 features 数 > 0(全国≈34、广东≈21 市、深圳≈?区)。

- [ ] **Step 4: confirm build picks up the glob + size**

Run: `npm run build` → clean(`import.meta.glob('./geo/*.json')` 现在解析到这些文件;懒加载 chunk 不进主包)。

- [ ] **Step 5: commit**
```bash
git add scripts/gen-geo.mjs src/renderer/geo
git commit -m "chore: bundle China province/city/district GeoJSON (DataV)"
```

---

## Task 3: ReturnMap + StatsView 子切换

**Files:** Create `src/renderer/components/ReturnMap.tsx`; Modify `src/renderer/views/StatsView.tsx`

- [ ] **Step 1: implement `src/renderer/components/ReturnMap.tsx`**(echarts 地图;无渲染单测,dev 手验)
```tsx
import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { MapChart } from 'echarts/charts'
import { TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { RegionLevel } from '@shared/types'
import { api } from '../api'
import { loadGeo, mapData, toAdcode } from '../geo'

echarts.use([MapChart, TooltipComponent, VisualMapComponent, CanvasRenderer])

interface Frame { adcode: string; level: RegionLevel; name: string }
const NEXT: Record<RegionLevel, RegionLevel | null> = { province: 'city', city: 'district', district: null }

interface GeoFC { features: { properties: { adcode: number | string; name: string } }[] }

export function ReturnMap() {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const featuresRef = useRef<GeoFC['features']>([])
  const [stack, setStack] = useState<Frame[]>([{ adcode: '100000', level: 'province', name: '全国' }])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const current = stack[stack.length - 1]

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chartRef.current = chart
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    chart.on('click', (p: { name?: string }) => {
      const next = NEXT[current.level]
      if (!next || !p.name) return
      const f = featuresRef.current.find((x) => x.properties.name === p.name)
      if (!f) return
      setStack((s) => [...s, { adcode: toAdcode(String(f.properties.adcode)), level: next, name: p.name! }])
    })
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); chartRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // rebind click when current.level changes (closure captures current)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.off('click')
    chart.on('click', (p: { name?: string }) => {
      const next = NEXT[current.level]
      if (!next || !p.name) return
      const f = featuresRef.current.find((x) => x.properties.name === p.name)
      if (!f) return
      setStack((s) => [...s, { adcode: toAdcode(String(f.properties.adcode)), level: next, name: p.name! }])
    })
  }, [current.level])

  useEffect(() => {
    let alive = true
    setStatus('loading')
    Promise.all([loadGeo(current.adcode), api.regionCounts(current.level)])
      .then(([geo, counts]) => {
        if (!alive) return
        const fc = geo as GeoFC
        featuresRef.current = fc.features
        const countsByAdcode: Record<string, number> = {}
        for (const c of counts) countsByAdcode[toAdcode(c.code)] = c.count
        const { rows, max } = mapData(fc.features, countsByAdcode)
        echarts.registerMap(current.adcode, geo as object)
        chartRef.current?.setOption({
          tooltip: { trigger: 'item', formatter: (p: { name?: string; value?: number }) => `${p.name}:${p.value || 0} 单` },
          visualMap: { min: 0, max: Math.max(1, max), inRange: { color: ['#f6e9e2', '#bd4f2a'] }, left: 8, bottom: 8 },
          series: [{ type: 'map', map: current.adcode, data: rows, label: { show: false } }]
        }, true)
        chartRef.current?.resize()
        setStatus('ready')
      })
      .catch(() => { if (alive) setStatus('error') })
    return () => { alive = false }
  }, [current.adcode, current.level])

  return (
    <div>
      <div className="mb-3 flex items-center gap-1 text-sm text-muted">
        {stack.map((f, i) => (
          <span key={f.adcode + i} className="flex items-center gap-1">
            {i > 0 && <span>/</span>}
            <button className="btn-ghost px-2 py-0.5 text-xs" disabled={i === stack.length - 1} onClick={() => setStack((s) => s.slice(0, i + 1))}>{f.name}</button>
          </span>
        ))}
      </div>
      <div className="relative rounded-xl2 border border-line bg-surface p-2 shadow-card">
        {status === 'loading' && <div className="absolute inset-0 z-10 grid place-items-center text-sm text-muted">地图加载中…</div>}
        {status === 'error' && <div className="absolute inset-0 z-10 grid place-items-center text-sm text-danger">地图数据缺失</div>}
        <div ref={ref} style={{ width: '100%', height: 560 }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: add 排行/地图 toggle to `src/renderer/views/StatsView.tsx`**
1. Add import: `import { ReturnMap } from '../components/ReturnMap'`
2. Add a mode state (next to the others): `const [mode, setMode] = useState<'rank' | 'map'>('rank')`
3. In the top toolbar, add a「排行 / 地图」segmented control to the LEFT of the existing 省/市/区县 switch, and only render the 省/市/区县 switch when `mode==='rank'`. Replace the toolbar's left side with:
```tsx
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
            <button className={`rounded-md px-3 py-1.5 ${mode === 'rank' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setMode('rank')}>排行</button>
            <button className={`rounded-md px-3 py-1.5 ${mode === 'map' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setMode('map')}>地图</button>
          </div>
          {mode === 'rank' && (
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
              {LEVELS.map((l) => (
                <button key={l.key} className={`rounded-md px-3 py-1.5 ${level === l.key ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setLevel(l.key)}>{l.label}</button>
              ))}
            </div>
          )}
        </div>
```
(The existing summary `<div>` on the right stays.)
4. In the body, render map vs rank. Replace the body section (the `<div className="mb-3 ...">售后最多的地区...` + chart/empty block) with:
```tsx
      <div className="flex-1 overflow-auto p-6">
        {mode === 'map' ? (
          <ReturnMap />
        ) : (
          <>
            <div className="mb-3 font-display text-sm font-bold tracking-tight text-ink">售后最多的地区(Top 20)</div>
            {error ? (
              <div className="rounded-xl2 border border-danger-soft bg-danger-soft py-20 text-center text-sm text-danger shadow-card">{error}</div>
            ) : data.length === 0 ? (
              <div className="rounded-xl2 border border-line bg-surface py-20 text-center text-sm text-muted shadow-card">暂无可统计的数据(请先给售后单关联带地址的客户)</div>
            ) : (
              <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
                <RegionBarChart data={data} />
              </div>
            )}
          </>
        )}
      </div>
```
(Keep the existing `level`/`data`/`summary`/`error` state and effects unchanged.)

- [ ] **Step 3: verify**
Run `npm run build` → clean. Run `npx vitest run` → green. Run `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -vE "node_modules|Cannot find (type definition|module).*node:|Cannot find name '(Buffer|process|console|HTMLElement|File|Blob|URL|window|document|Image|DataTransfer|ClipboardEvent)'" | grep -E "ReturnMap|StatsView|geo.ts" || echo "no feature type errors"` → `no feature type errors`.

- [ ] **Step 4: commit**
```bash
git add src/renderer/components/ReturnMap.tsx src/renderer/views/StatsView.tsx
git commit -m "feat: drill-down ReturnMap + 排行/地图 toggle in StatsView"
```

---

## Task 4: dev 真机验证

**Files:** 无(需 Task 2 已生成 geo 文件)

- [ ] **Step 1:** `npm run rebuild:electron` → `npm run dev`
- [ ] **Step 2: 手动验证清单**
  1. 造数据(几个不同省/市/区县的客户 + 关联售后单)。
  2. 统计页「地图」:全国省级着色(有售后的省更深);hover 显示「省名:N 单」。
  3. 点某省 → 下钻到该省地市着色;点某市 → 下钻到区县;区县级不再下钻。
  4. 面包屑「全国 / 广东省 / 深圳市」点上级逐级返回。
  5. 无数据省/市最浅色;颜色深浅与「排行」一致。
  6. 「排行 / 地图」子切换正常;排行模式仍有省/市/区县。
- [ ] **Step 3:** `npm run rebuild:node` → `npx vitest run` 仍全绿。

---

## Self-Review 记录
- **Spec 覆盖**:toAdcode/mapData/loadGeo(Task 1)、GeoJSON 生成打包(Task 2)、ReturnMap 下钻+面包屑+visualMap+tooltip+加载/错误态(Task 3)、统计页排行/地图子切换(Task 3)、dev 手验(Task 4)。
- **复用**:`api.regionCounts(level)` 直接复用,后端不改;count 按 `toAdcode(code)` 匹配 GeoJSON adcode。
- **类型一致**:`RegionLevel`(已存在)贯穿;`toAdcode(code)` 单参(spec 提过 level,简化为右补零,对省/市/区县皆正确)。
- **离线/风险**:`loadGeo` 用 import.meta.glob 懒加载;Task 2 联网仅构建期,失败则 BLOCKED 且不影响 Task1/3 的构建与单测。
- **echarts 匹配**:map series 按 `name` 匹配 GeoJSON 区域名(同源,必匹配);adcode 仅用于 count 查找。
- **占位符**:无。
