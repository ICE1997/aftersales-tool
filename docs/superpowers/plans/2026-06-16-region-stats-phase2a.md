# 区域统计 2a 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按关联客户的 省/市/区县 聚合售后单计数,新增「统计」tab,用 ECharts 横向柱状图展示各级别 Top 20 排行 + 汇总(总/已归类/未归类)。

**Architecture:** 新增只读 `StatsRepo`(SQL group-by);新增 IPC `stats:regionCounts`/`stats:summary`;渲染层新增纯函数 `barOption`(可单测)+ `RegionBarChart`(ECharts 封装)+ `StatsView`;App 增加第三个 tab。

**Tech Stack:** better-sqlite3, ECharts(tree-shaken), React + TS, Vitest。

> 测试在 system Node ABI 下跑(若 better-sqlite3 NODE_MODULE_VERSION 错误,先 `npm run rebuild:node`)。`npm run dev` 前 `npm run rebuild:electron`。

---

## File Structure
```
src/shared/types.ts                          # + RegionLevel / RegionCount / StatsSummary
src/main/db/stats.ts                          # 新增 StatsRepo
src/main/ipc.ts                               # + stats:regionCounts / stats:summary
src/preload/index.ts                          # + regionCounts / statsSummary
src/renderer/charts.ts                        # 纯函数 barOption
src/renderer/components/RegionBarChart.tsx    # ECharts 封装
src/renderer/views/StatsView.tsx              # 统计页(级别切换 + 汇总 + 图表)
src/renderer/App.tsx                          # 第三个 tab「统计」

tests/db/stats.test.ts
tests/renderer/charts.test.ts
```

---

## Task 1: 共享类型

**Files:** Modify `src/shared/types.ts`

- [ ] **Step 1:** append:
```ts
export type RegionLevel = 'province' | 'city' | 'district'
export interface RegionCount { code: string; name: string; count: number }
export interface StatsSummary { total: number; classified: number; unclassified: number }
```
- [ ] **Step 2:** `npx vitest run` → green (if ABI error, `npm run rebuild:node`). Commit:
```bash
git add src/shared/types.ts
git commit -m "feat: region stats types"
```

---

## Task 2: StatsRepo

**Files:** Create `src/main/db/stats.ts`; Test `tests/db/stats.test.ts`

- [ ] **Step 1: failing test** `tests/db/stats.test.ts`
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { CustomerRepo } from '../../src/main/db/customers'
import { TicketRepo } from '../../src/main/db/tickets'
import { StatsRepo } from '../../src/main/db/stats'

let db: Database
let stats: StatsRepo
let customers: CustomerRepo
let tickets: TicketRepo

const cust = (over: Partial<Parameters<CustomerRepo['create']>[0]> = {}) => customers.create({
  nickname: '', name: '客户', provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市',
  districtCode: '440305', district: '南山区', addressDetail: '', ...over
})

let n = 0
function ticketFor(customerId: number | null) {
  const no = `AS-${++n}`
  tickets.create({ aftersaleNo: no, orderNo: '', shippingNo: '', returnNo: '', note: '' })
  if (customerId != null) tickets.setCustomer(no, customerId)
  return no
}

beforeEach(() => {
  db = createDatabase(':memory:')
  stats = new StatsRepo(db)
  customers = new CustomerRepo(db, () => 1)
  tickets = new TicketRepo(db, () => 1)
  n = 0
})

describe('StatsRepo.regionCounts', () => {
  it('counts tickets by province (desc), excluding unlinked / no-region', () => {
    const gd1 = cust({ provinceCode: '44', province: '广东省' })
    const gd2 = cust({ provinceCode: '44', province: '广东省' })
    const zj = cust({ provinceCode: '33', province: '浙江省', cityCode: '3301', city: '杭州市', districtCode: '330106', district: '西湖区' })
    const noRegion = cust({ provinceCode: '', province: '', cityCode: '', city: '', districtCode: '', district: '' })
    ticketFor(gd1); ticketFor(gd2); ticketFor(zj); ticketFor(noRegion); ticketFor(null)
    const rows = stats.regionCounts('province')
    expect(rows).toEqual([
      { code: '44', name: '广东省', count: 2 },
      { code: '33', name: '浙江省', count: 1 }
    ])
  })

  it('counts by city and district', () => {
    const a = cust() // 广东/深圳/南山
    ticketFor(a); ticketFor(a)
    expect(stats.regionCounts('city')).toEqual([{ code: '4403', name: '深圳市', count: 2 }])
    expect(stats.regionCounts('district')).toEqual([{ code: '440305', name: '南山区', count: 2 }])
  })
})

describe('StatsRepo.summary', () => {
  it('computes total / classified / unclassified', () => {
    const gd = cust()
    const noRegion = cust({ provinceCode: '', province: '' })
    ticketFor(gd); ticketFor(noRegion); ticketFor(null)
    expect(stats.summary()).toEqual({ total: 3, classified: 1, unclassified: 2 })
  })
})
```

- [ ] **Step 2: run, confirm FAIL** — `npx vitest run tests/db/stats.test.ts` → FAIL.

- [ ] **Step 3: implement** `src/main/db/stats.ts`
```ts
import type { Database } from 'better-sqlite3'
import type { RegionLevel, RegionCount, StatsSummary } from '../../shared/types'

const COLS: Record<RegionLevel, { code: string; name: string }> = {
  province: { code: 'province_code', name: 'province' },
  city: { code: 'city_code', name: 'city' },
  district: { code: 'district_code', name: 'district' }
}

export class StatsRepo {
  constructor(private db: Database) {}

  regionCounts(level: RegionLevel): RegionCount[] {
    const col = COLS[level] // fixed mapping — never interpolate arbitrary input
    return this.db.prepare(
      `SELECT c.${col.code} AS code, c.${col.name} AS name, COUNT(*) AS count
       FROM tickets t JOIN customers c ON t.customer_id = c.id
       WHERE c.${col.code} != ''
       GROUP BY c.${col.code}, c.${col.name}
       ORDER BY count DESC, name ASC`
    ).all() as RegionCount[]
  }

  summary(): StatsSummary {
    const total = (this.db.prepare('SELECT COUNT(*) AS n FROM tickets').get() as { n: number }).n
    const classified = (this.db.prepare(
      `SELECT COUNT(*) AS n FROM tickets t JOIN customers c ON t.customer_id = c.id WHERE c.province_code != ''`
    ).get() as { n: number }).n
    return { total, classified, unclassified: total - classified }
  }
}
```

- [ ] **Step 4: run, confirm PASS + full suite** — `npx vitest run tests/db/stats.test.ts` → PASS; `npx vitest run` → green.

- [ ] **Step 5: commit**
```bash
git add src/main/db/stats.ts tests/db/stats.test.ts
git commit -m "feat: StatsRepo region counts + summary"
```

---

## Task 3: IPC + Preload

**Files:** Modify `src/main/ipc.ts`, `src/preload/index.ts`

- [ ] **Step 1: ipc.ts**
1. Add import: `import { StatsRepo } from './db/stats'`
2. Construct in `registerIpc` (next to other repos): `const statsRepo = new StatsRepo(db)`
3. Add handlers (after customers handlers):
```ts
  ipcMain.handle('stats:regionCounts', (_e, level: import('../shared/types').RegionLevel) => statsRepo.regionCounts(level))
  ipcMain.handle('stats:summary', () => statsRepo.summary())
```

- [ ] **Step 2: preload** — add `RegionLevel, RegionCount, StatsSummary` to the type import; add methods:
```ts
  regionCounts: (level: RegionLevel): Promise<RegionCount[]> => ipcRenderer.invoke('stats:regionCounts', level),
  statsSummary: (): Promise<StatsSummary> => ipcRenderer.invoke('stats:summary')
```

- [ ] **Step 3: verify** — `npm run build` → clean; `npx vitest run` → green.

- [ ] **Step 4: commit**
```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat: stats IPC + preload"
```

---

## Task 4: echarts + barOption + RegionBarChart

**Files:** Create `src/renderer/charts.ts`, `src/renderer/components/RegionBarChart.tsx`; Test `tests/renderer/charts.test.ts`; install echarts

- [ ] **Step 1: install echarts**
```bash
npm i echarts --legacy-peer-deps
```
(`--legacy-peer-deps` matches the project's existing install convention.)

- [ ] **Step 2: failing test** `tests/renderer/charts.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { barOption } from '../../src/renderer/charts'
import type { RegionCount } from '../../src/shared/types'

describe('barOption', () => {
  it('takes the top 20 and puts the highest at the top of the horizontal bar', () => {
    const data: RegionCount[] = Array.from({ length: 25 }, (_, i) => ({ code: String(i), name: 'R' + i, count: 25 - i }))
    const o = barOption(data) as any
    expect(o.yAxis.data.length).toBe(20)
    expect(o.series[0].data.length).toBe(20)
    // highest count (R0=25) is rendered last → top of a horizontal category axis
    expect(o.yAxis.data[19]).toBe('R0')
    expect(o.series[0].data[19]).toBe(25)
  })
  it('handles fewer than 20 rows', () => {
    const o = barOption([{ code: 'a', name: '甲', count: 3 }]) as any
    expect(o.yAxis.data).toEqual(['甲'])
    expect(o.series[0].data).toEqual([3])
  })
})
```

- [ ] **Step 3: run, confirm FAIL** — `npx vitest run tests/renderer/charts.test.ts` → FAIL.

- [ ] **Step 4: implement** `src/renderer/charts.ts` (pure, no echarts import)
```ts
import type { RegionCount } from '@shared/types'

/** Build an ECharts option for a horizontal Top-20 ranking bar (highest at top). */
export function barOption(data: RegionCount[]): Record<string, unknown> {
  const rows = [...data.slice(0, 20)].reverse() // reverse so the largest sits at the top of the y category axis
  return {
    grid: { left: 8, right: 48, top: 12, bottom: 12, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: rows.map((r) => r.name) },
    series: [{
      type: 'bar',
      data: rows.map((r) => r.count),
      label: { show: true, position: 'right' },
      itemStyle: { color: '#bd4f2a', borderRadius: [0, 4, 4, 0] }
    }]
  }
}
```

- [ ] **Step 5: run, confirm PASS** — `npx vitest run tests/renderer/charts.test.ts` → PASS.

- [ ] **Step 6: implement** `src/renderer/components/RegionBarChart.tsx`
```tsx
import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { RegionCount } from '@shared/types'
import { barOption } from '../charts'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

export function RegionBarChart({ data }: { data: RegionCount[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chartRef.current = chart
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); chartRef.current = null }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(barOption(data) as echarts.EChartsCoreOption, true)
  }, [data])

  // height scales with row count (min 240); each bar ~28px
  const height = Math.max(240, Math.min(data.length, 20) * 28 + 40)
  return <div ref={ref} style={{ width: '100%', height }} />
}
```
(`echarts/core` exports the `ECharts` and `EChartsCoreOption` types. If a type name differs in the installed version, adjust the import/casts so `npm run build` is clean.)

- [ ] **Step 7: verify** — `npm run build` → clean (echarts bundles); `npx vitest run` → green (charts.test passes; RegionBarChart has no test).

- [ ] **Step 8: commit**
```bash
git add package.json package-lock.json src/renderer/charts.ts src/renderer/components/RegionBarChart.tsx tests/renderer/charts.test.ts
git commit -m "feat: echarts + barOption + RegionBarChart"
```

---

## Task 5: 统计 tab + StatsView

**Files:** Create `src/renderer/views/StatsView.tsx`; Modify `src/renderer/App.tsx`

- [ ] **Step 1: create `src/renderer/views/StatsView.tsx`**
```tsx
import { useEffect, useState } from 'react'
import type { RegionCount, RegionLevel, StatsSummary } from '@shared/types'
import { api } from '../api'
import { RegionBarChart } from '../components/RegionBarChart'

const LEVELS: { key: RegionLevel; label: string }[] = [
  { key: 'province', label: '省' },
  { key: 'city', label: '市' },
  { key: 'district', label: '区县' }
]

export function StatsView() {
  const [level, setLevel] = useState<RegionLevel>('province')
  const [data, setData] = useState<RegionCount[]>([])
  const [summary, setSummary] = useState<StatsSummary>({ total: 0, classified: 0, unclassified: 0 })

  useEffect(() => { api.statsSummary().then(setSummary) }, [])
  useEffect(() => { api.regionCounts(level).then(setData) }, [level])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-2 px-6 py-3">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          {LEVELS.map((l) => (
            <button key={l.key} className={`rounded-md px-3 py-1.5 ${level === l.key ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setLevel(l.key)}>{l.label}</button>
          ))}
        </div>
        <div className="text-sm text-muted">
          共 <span className="tnum text-ink-soft">{summary.total}</span> 单 · 已归类 <span className="tnum text-ink-soft">{summary.classified}</span> · 未归类 <span className="tnum text-ink-soft">{summary.unclassified}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-3 font-display text-sm font-bold tracking-tight text-ink">售后最多的地区(Top 20)</div>
        {data.length === 0 ? (
          <div className="rounded-xl2 border border-line bg-surface py-20 text-center text-sm text-muted shadow-card">暂无可统计的数据(请先给售后单关联带地址的客户)</div>
        ) : (
          <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
            <RegionBarChart data={data} />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: add the 统计 tab in `src/renderer/App.tsx`**
1. Change the `Tab` type: `type Tab = 'tickets' | 'customers' | 'stats'`
2. Add import: `import { StatsView } from './views/StatsView'`
3. Add a nav button after the 客户 button:
```tsx
          <button className={`rounded-md px-3 py-1.5 ${tab === 'stats' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setTab('stats')}>统计</button>
```
4. Update the main render to handle the third tab:
```tsx
      <main className="flex-1 overflow-hidden">
        {tab === 'tickets'
          ? <TicketsView jumpTo={jumpTicket} onJumpHandled={() => setJumpTicket(undefined)} />
          : tab === 'customers'
          ? <CustomersView onOpenTicket={(no) => { setJumpTicket(no); setTab('tickets') }} />
          : <StatsView />}
      </main>
```

- [ ] **Step 3: verify** — `npm run build` → clean; `npx vitest run` → green; `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -vE "node_modules|Cannot find (type definition|module).*node:|Cannot find name '(Buffer|process|console|HTMLElement|File|Blob|URL|window|document|Image|DataTransfer|ClipboardEvent)'" | grep -E "StatsView|App.tsx|RegionBarChart|charts.ts|stats.ts" || echo "no feature type errors"` → `no feature type errors`.

- [ ] **Step 4: commit**
```bash
git add src/renderer/views/StatsView.tsx src/renderer/App.tsx
git commit -m "feat: 统计 tab with region ranking bar chart"
```

---

## Task 6: dev 真机验证

**Files:** 无

- [ ] **Step 1:** `npm run rebuild:electron` → `npm run dev`
- [ ] **Step 2: 手动验证清单**
  1. 顶部出现「统计」tab。
  2. 造数据:在「客户」建几个不同省/市/区的客户,在「售后单」详情把若干售后单关联到这些客户(留一两单不关联)。
  3. 统计 tab:省级排行条形(各省售后单数,降序);切「市」「区县」排行随之变化。
  4. 汇总「共 N 单 · 已归类 M · 未归类 K」与造的数据一致(未关联/无地址计入未归类)。
  5. 没有任何带地址客户关联时显示空状态。
- [ ] **Step 3:** `npm run rebuild:node` → `npx vitest run` 仍全绿。

---

## Self-Review 记录
- **Spec 覆盖**:StatsRepo regionCounts(级别→列固定映射、JOIN、过滤空 code、降序)+ summary → Task 2;类型 → Task 1;IPC/preload → Task 3;echarts 依赖 + barOption(Top20/降序/option)纯函数 + RegionBarChart 封装 → Task 4;统计 tab + StatsView(级别切换 + 汇总 + 空状态)→ Task 5;dev 手验 → Task 6。
- **类型一致性**:`RegionLevel`/`RegionCount`/`StatsSummary`(Task 1)贯穿 StatsRepo(2)、ipc/preload(3)、charts/StatsView(4/5);`barOption(RegionCount[])`(4)被 RegionBarChart 使用;preload `regionCounts(level)`/`statsSummary()` 与 StatsView 调用一致。
- **安全**:`regionCounts` 的列名来自固定 `COLS` 映射,绝不插入任意输入。
- **占位符**:无。
- **echarts/jsdom**:`RegionBarChart` 不做渲染单测(echarts 需 canvas);纯 `barOption` 单测覆盖排序/截断逻辑。
