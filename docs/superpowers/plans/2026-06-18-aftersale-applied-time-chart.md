# 售后单申请时间分布条形图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在售后单列表页嵌入一个按「申请时间」分布的条形图，随筛选条件实时联动，并提供今日/昨日/近7/30/90日快捷范围与自定义时间范围。

**Architecture:** 纯前端聚合，复用已有的 `tickets:list` + `applyFilter`，不新增数据库查询。把「日期预设计算」和「时间分桶聚合」抽成两个无副作用模块，分别单测；条形图用已集成的 ECharts（树摇导入，参照 `RegionBarChart`）。快捷范围与自定义日期写入同一份 `filter.appliedFrom/appliedTo`，因此表格与图表完全联动。视觉沿用现有 terracotta/paper 设计令牌。

**Tech Stack:** React 19 + Electron + electron-vite，TypeScript，Tailwind 3（自定义 CSS 变量），ECharts 6.x，Vitest + @testing-library/react。

## Global Constraints

- 不引入新依赖（ECharts、react-day-picker、tailwind 均已存在）。
- 测试文件放在 `tests/renderer/`，单文件运行用 `npx vitest run <path>`；全量用 `npm test`。
- 日期一律用本地 epoch-ms 日界，复用 `src/renderer/date-util.ts` 的 `startOfDayMs` / `endOfDayMs`，与现有筛选保持一致。
- 纯逻辑模块（date-presets、applied-time-buckets）的「当前时间」必须以参数 `now` 注入（默认 `Date.now()`），以便测试确定性。
- 主题色 terracotta 为 `#bd4f2a`（图表），UI 用 CSS 变量类（`bg-accent`、`text-ink-soft`、`border-line`、`bg-paper-2` 等）。
- ECharts 组件必须 mount 时 `init`、window resize 时 `resize`、unmount 时 `dispose`（参照 `src/renderer/components/RegionBarChart.tsx`）。
- 提交信息以 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 结尾。

---

### Task 1: 日期预设模块 date-presets

**Files:**
- Create: `src/renderer/date-presets.ts`
- Test: `tests/renderer/date-presets.test.ts`

**Interfaces:**
- Consumes: `startOfDayMs(d: Date): number`、`endOfDayMs(d: Date): number`（来自 `./date-util`）。
- Produces:
  - `type PresetKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90'`
  - `interface PresetRange { from: number; to: number }`
  - `interface PresetDef { key: PresetKey; label: string; days: number; offset: number }`
  - `const PRESETS: PresetDef[]`
  - `presetRange(key: PresetKey, now?: number): PresetRange`
  - `matchPreset(from: number | null, to: number | null, now?: number): PresetKey | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/date-presets.test.ts
import { describe, it, expect } from 'vitest'
import { startOfDayMs, endOfDayMs } from '../../src/renderer/date-util'
import { PRESETS, presetRange, matchPreset } from '../../src/renderer/date-presets'

// Fixed "now": 2026-06-18 15:30 local.
const NOW = new Date(2026, 5, 18, 15, 30, 0, 0).getTime()
const dayStart = (y: number, m: number, d: number) => startOfDayMs(new Date(y, m, d))
const dayEnd = (y: number, m: number, d: number) => endOfDayMs(new Date(y, m, d))

describe('PRESETS', () => {
  it('lists the five quick ranges in order', () => {
    expect(PRESETS.map((p) => p.key)).toEqual(['today', 'yesterday', 'last7', 'last30', 'last90'])
    expect(PRESETS.map((p) => p.label)).toEqual(['今日', '昨日', '近7日', '近30日', '近90日'])
  })
})

describe('presetRange', () => {
  it('today = start..end of the current local day', () => {
    expect(presetRange('today', NOW)).toEqual({ from: dayStart(2026, 5, 18), to: dayEnd(2026, 5, 18) })
  })
  it('yesterday = the previous whole day', () => {
    expect(presetRange('yesterday', NOW)).toEqual({ from: dayStart(2026, 5, 17), to: dayEnd(2026, 5, 17) })
  })
  it('last7 spans today and the previous 6 days (inclusive)', () => {
    expect(presetRange('last7', NOW)).toEqual({ from: dayStart(2026, 5, 12), to: dayEnd(2026, 5, 18) })
  })
  it('last30 spans 30 inclusive days ending today', () => {
    expect(presetRange('last30', NOW)).toEqual({ from: dayStart(2026, 4, 20), to: dayEnd(2026, 5, 18) })
  })
  it('last90 spans 90 inclusive days ending today', () => {
    expect(presetRange('last90', NOW)).toEqual({ from: dayStart(2026, 2, 21), to: dayEnd(2026, 5, 18) })
  })
})

describe('matchPreset', () => {
  it('returns the preset key when from/to exactly match', () => {
    const r = presetRange('last7', NOW)
    expect(matchPreset(r.from, r.to, NOW)).toBe('last7')
  })
  it('returns null for a custom range and for null bounds', () => {
    expect(matchPreset(1, 2, NOW)).toBeNull()
    expect(matchPreset(null, null, NOW)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/date-presets.test.ts`
Expected: FAIL — cannot resolve `../../src/renderer/date-presets`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/date-presets.ts
import { startOfDayMs, endOfDayMs } from './date-util'

export type PresetKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'last90'
export interface PresetRange { from: number; to: number }
export interface PresetDef { key: PresetKey; label: string; days: number; offset: number }

// `offset` = whole days back from today for the END of the range.
// `days`   = inclusive day span of the range.
export const PRESETS: PresetDef[] = [
  { key: 'today', label: '今日', days: 1, offset: 0 },
  { key: 'yesterday', label: '昨日', days: 1, offset: 1 },
  { key: 'last7', label: '近7日', days: 7, offset: 0 },
  { key: 'last30', label: '近30日', days: 30, offset: 0 },
  { key: 'last90', label: '近90日', days: 90, offset: 0 },
]

/** A local calendar date `deltaDays` away from `now` (DST/month-end safe). */
function dayFrom(now: number, deltaDays: number): Date {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + deltaDays)
}

/** [from, to] local day bounds for a preset, relative to `now`. */
export function presetRange(key: PresetKey, now: number = Date.now()): PresetRange {
  const def = PRESETS.find((p) => p.key === key)
  if (!def) throw new Error(`unknown preset: ${key}`)
  const endDay = dayFrom(now, -def.offset)
  const startDay = dayFrom(now, -def.offset - (def.days - 1))
  return { from: startOfDayMs(startDay), to: endOfDayMs(endDay) }
}

/** Which preset (if any) a from/to pair exactly matches — for chip highlighting. */
export function matchPreset(from: number | null, to: number | null, now: number = Date.now()): PresetKey | null {
  if (from == null || to == null) return null
  for (const p of PRESETS) {
    const r = presetRange(p.key, now)
    if (r.from === from && r.to === to) return p.key
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/date-presets.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/date-presets.ts tests/renderer/date-presets.test.ts
git commit -m "feat: date-preset ranges for aftersale applied-time chart

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 申请时间分桶聚合模块 applied-time-buckets

**Files:**
- Create: `src/renderer/applied-time-buckets.ts`
- Test: `tests/renderer/applied-time-buckets.test.ts`

**Interfaces:**
- Consumes: `Ticket`（来自 `@shared/types`，关键字段 `appliedAt: number | null`）。
- Produces:
  - `type Granularity = 'day' | 'week' | 'month'`
  - `interface Bucket { key: string; label: string; count: number }`
  - `interface BucketResult { granularity: Granularity; buckets: Bucket[]; total: number }`
  - `spanDays(from: number, to: number): number`（含两端的日历天数）
  - `chooseGranularity(days: number): Granularity`
  - `bucketByAppliedTime(tickets: Ticket[], from: number | null, to: number | null): BucketResult`
  - `summaryText(result: BucketResult): string`

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/applied-time-buckets.test.ts
import { describe, it, expect } from 'vitest'
import type { Ticket } from '../../src/shared/types'
import {
  spanDays, chooseGranularity, bucketByAppliedTime, summaryText,
} from '../../src/renderer/applied-time-buckets'

const EMPTY_CUSTOMER = {
  recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: '',
}
const EMPTY_AFTERSALE = {
  aftersaleType: '', aftersaleReason: '', shippingStatus: '',
  amount: null, refundAmount: null, appliedAt: null, returnLogistics: '',
} as const
function mk(over: Partial<Ticket> = {}): Ticket {
  return {
    aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '',
    status: '待商家处理', note: '', createdAt: 0, updatedAt: 0,
    ...EMPTY_CUSTOMER, ...EMPTY_AFTERSALE, ...over,
  }
}
const at = (y: number, m: number, d: number) => new Date(y, m, d, 10, 0, 0).getTime()

describe('spanDays', () => {
  it('counts both endpoints (same day = 1)', () => {
    expect(spanDays(at(2026, 5, 18), at(2026, 5, 18))).toBe(1)
    expect(spanDays(at(2026, 5, 12), at(2026, 5, 18))).toBe(7)
  })
})

describe('chooseGranularity', () => {
  it('day ≤31, week ≤180, else month', () => {
    expect(chooseGranularity(1)).toBe('day')
    expect(chooseGranularity(31)).toBe('day')
    expect(chooseGranularity(32)).toBe('week')
    expect(chooseGranularity(180)).toBe('week')
    expect(chooseGranularity(181)).toBe('month')
  })
})

describe('bucketByAppliedTime', () => {
  it('buckets by day across the given range, zero-filling gaps', () => {
    const tickets = [
      mk({ appliedAt: at(2026, 5, 12) }),
      mk({ appliedAt: at(2026, 5, 12) }),
      mk({ appliedAt: at(2026, 5, 14) }),
    ]
    const r = bucketByAppliedTime(tickets, at(2026, 5, 12), at(2026, 5, 14))
    expect(r.granularity).toBe('day')
    expect(r.buckets.map((b) => b.label)).toEqual(['6/12', '6/13', '6/14'])
    expect(r.buckets.map((b) => b.count)).toEqual([2, 0, 1])
    expect(r.total).toBe(3)
  })

  it('ignores tickets without appliedAt', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: null }), mk({ appliedAt: at(2026, 5, 18) })],
      at(2026, 5, 18), at(2026, 5, 18))
    expect(r.total).toBe(1)
  })

  it('derives the range from min/max appliedAt when from/to are null', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: at(2026, 5, 10) }), mk({ appliedAt: at(2026, 5, 12) })], null, null)
    expect(r.granularity).toBe('day')
    expect(r.buckets.map((b) => b.label)).toEqual(['6/10', '6/11', '6/12'])
    expect(r.total).toBe(2)
  })

  it('switches to weekly buckets for spans over a month', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: at(2026, 3, 1) })], at(2026, 2, 1), at(2026, 4, 30))
    expect(r.granularity).toBe('week')
    expect(r.total).toBe(1)
  })

  it('switches to monthly buckets for spans over ~half a year', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: at(2025, 1, 15) })], at(2025, 0, 1), at(2025, 11, 31))
    expect(r.granularity).toBe('month')
    expect(r.buckets[0].label).toBe('2025-01')
    expect(r.buckets.length).toBe(12)
  })

  it('returns an empty result when no ticket has appliedAt', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: null })], null, null)
    expect(r).toEqual({ granularity: 'day', buckets: [], total: 0 })
  })
})

describe('summaryText', () => {
  it('reads "共 N 单 / M 天" with the unit matching granularity', () => {
    const r = bucketByAppliedTime([mk({ appliedAt: at(2026, 5, 12) })], at(2026, 5, 12), at(2026, 5, 14))
    expect(summaryText(r)).toBe('共 1 单 / 3 天')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/applied-time-buckets.test.ts`
Expected: FAIL — cannot resolve `../../src/renderer/applied-time-buckets`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/applied-time-buckets.ts
import type { Ticket } from '@shared/types'

export type Granularity = 'day' | 'week' | 'month'
export interface Bucket { key: string; label: string; count: number }
export interface BucketResult { granularity: Granularity; buckets: Bucket[]; total: number }

const DAY_MS = 86_400_000
const UNIT: Record<Granularity, string> = { day: '天', week: '周', month: '月' }
const pad = (n: number) => String(n).padStart(2, '0')
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** Monday (local) of the week containing `d`. */
const mondayOf = (d: Date) => {
  const s = startOfDay(d)
  const back = (s.getDay() + 6) % 7 // Mon=0 … Sun=6
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - back)
}

/** Inclusive count of local calendar days between two instants. */
export function spanDays(from: number, to: number): number {
  const a = startOfDay(new Date(from)).getTime()
  const b = startOfDay(new Date(to)).getTime()
  return Math.floor((b - a) / DAY_MS) + 1
}

export function chooseGranularity(days: number): Granularity {
  if (days <= 31) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

function keyOf(ms: number, g: Granularity): string {
  const d = new Date(ms)
  if (g === 'day') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  if (g === 'week') { const m = mondayOf(d); return `${m.getFullYear()}-${pad(m.getMonth() + 1)}-${pad(m.getDate())}` }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function labelOf(key: string, g: Granularity): string {
  if (g === 'month') return key // 'YYYY-MM'
  const [, mo, da] = key.split('-') // 'YYYY-MM-DD'
  return `${Number(mo)}/${Number(da)}` // 'M/D'
}

/** Every bucket key from `from`..`to` inclusive, chronological (gaps included). */
function enumerateKeys(from: number, to: number, g: Granularity): string[] {
  const keys: string[] = []
  const start = new Date(from)
  let cur =
    g === 'day' ? startOfDay(start)
    : g === 'week' ? mondayOf(start)
    : new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur.getTime() <= to) {
    keys.push(keyOf(cur.getTime(), g))
    cur =
      g === 'day' ? new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
      : g === 'week' ? new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7)
      : new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
  }
  return keys
}

/**
 * Aggregate tickets by `appliedAt` into chronological buckets across [from, to].
 * Tickets without appliedAt are ignored. When from/to are null, the range is
 * derived from the min/max appliedAt present.
 */
export function bucketByAppliedTime(tickets: Ticket[], from: number | null, to: number | null): BucketResult {
  const applied = tickets.map((t) => t.appliedAt).filter((v): v is number => v != null)
  if (applied.length === 0) return { granularity: 'day', buckets: [], total: 0 }

  const rangeFrom = from ?? Math.min(...applied)
  const rangeTo = to ?? Math.max(...applied)
  const g = chooseGranularity(spanDays(rangeFrom, rangeTo))

  const counts = new Map<string, number>()
  for (const key of enumerateKeys(rangeFrom, rangeTo, g)) counts.set(key, 0)

  let total = 0
  for (const ms of applied) {
    if (ms < rangeFrom || ms > rangeTo) continue
    const key = keyOf(ms, g)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    total++
  }

  const buckets: Bucket[] = [...counts.entries()].map(([key, count]) => ({ key, label: labelOf(key, g), count }))
  return { granularity: g, buckets, total }
}

/** "共 64 单 / 7 天" — unit word follows granularity. */
export function summaryText(result: BucketResult): string {
  return `共 ${result.total} 单 / ${result.buckets.length} ${UNIT[result.granularity]}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/applied-time-buckets.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/applied-time-buckets.ts tests/renderer/applied-time-buckets.test.ts
git commit -m "feat: applied-time bucket aggregation with adaptive granularity

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ECharts 选项构建器 appliedTimeBarOption

**Files:**
- Modify: `src/renderer/charts.ts`
- Test: `tests/renderer/charts.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `Bucket`（来自 `./applied-time-buckets`）。
- Produces: `appliedTimeBarOption(buckets: Bucket[]): Record<string, unknown>`（纵向柱状图：x 轴 category 用 `label`，series 用 `count`）。

- [ ] **Step 1: Write the failing test**

Append to `tests/renderer/charts.test.ts`:

```ts
import { appliedTimeBarOption } from '../../src/renderer/charts'
import type { Bucket } from '../../src/renderer/applied-time-buckets'

describe('appliedTimeBarOption', () => {
  const buckets: Bucket[] = [
    { key: '2026-06-12', label: '6/12', count: 2 },
    { key: '2026-06-13', label: '6/13', count: 0 },
    { key: '2026-06-14', label: '6/14', count: 1 },
  ]
  it('maps labels to the category x-axis and counts to the bar series', () => {
    const o = appliedTimeBarOption(buckets) as any
    expect(o.xAxis.type).toBe('category')
    expect(o.xAxis.data).toEqual(['6/12', '6/13', '6/14'])
    expect(o.yAxis.type).toBe('value')
    expect(o.series[0].type).toBe('bar')
    expect(o.series[0].data).toEqual([2, 0, 1])
  })
  it('handles an empty bucket list', () => {
    const o = appliedTimeBarOption([]) as any
    expect(o.xAxis.data).toEqual([])
    expect(o.series[0].data).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/charts.test.ts`
Expected: FAIL — `appliedTimeBarOption` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/renderer/charts.ts`:

```ts
import type { Bucket } from './applied-time-buckets'

/** Vertical bar option for the applied-time distribution chart. */
export function appliedTimeBarOption(buckets: Bucket[]): Record<string, unknown> {
  return {
    grid: { left: 8, right: 12, top: 20, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: buckets.map((b) => b.label), axisTick: { alignWithLabel: true } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar',
      data: buckets.map((b) => b.count),
      label: { show: true, position: 'top' },
      itemStyle: { color: '#bd4f2a', borderRadius: [4, 4, 0, 0] },
    }],
  }
}
```

(Keep the existing `import type { RegionCount }` line at the top; add the new `import type { Bucket }` alongside it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/charts.test.ts`
Expected: PASS (both old `barOption` and new `appliedTimeBarOption` cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/charts.ts tests/renderer/charts.test.ts
git commit -m "feat: appliedTimeBarOption echarts builder

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 快捷范围 chip 组件 DatePresetChips

**Files:**
- Create: `src/renderer/components/DatePresetChips.tsx`
- Test: `tests/renderer/DatePresetChips.test.tsx`

**Interfaces:**
- Consumes: `PRESETS`、`PresetKey`（来自 `../date-presets`）。
- Produces: `DatePresetChips({ active, onSelect }: { active: PresetKey | null; onSelect: (key: PresetKey) => void })`。每个 chip 是 `<button>`，`aria-pressed` 标记选中态。

- [ ] **Step 1: Write the failing test**

```tsx
// tests/renderer/DatePresetChips.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DatePresetChips } from '../../src/renderer/components/DatePresetChips'

describe('DatePresetChips', () => {
  it('renders all five quick-range chips', () => {
    render(<DatePresetChips active={null} onSelect={() => {}} />)
    for (const label of ['今日', '昨日', '近7日', '近30日', '近90日']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('marks the active chip with aria-pressed', () => {
    render(<DatePresetChips active="last7" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: '近7日' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '今日' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onSelect with the chip key when clicked', () => {
    const onSelect = vi.fn()
    render(<DatePresetChips active={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '近30日' }))
    expect(onSelect).toHaveBeenCalledWith('last30')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/renderer/DatePresetChips.test.tsx`
Expected: FAIL — cannot resolve `DatePresetChips`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/renderer/components/DatePresetChips.tsx
import { PRESETS, type PresetKey } from '../date-presets'

interface Props { active: PresetKey | null; onSelect: (key: PresetKey) => void }

/** A row of quick-range chips; the active one is highlighted in the accent color. */
export function DatePresetChips({ active, onSelect }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => {
        const on = p.key === active
        return (
          <button
            key={p.key}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(p.key)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              on ? 'bg-accent text-white' : 'btn-ghost text-ink-soft'
            }`}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/renderer/DatePresetChips.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/DatePresetChips.tsx tests/renderer/DatePresetChips.test.tsx
git commit -m "feat: date-preset chip row component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 条形图组件 AppliedTimeBarChart

**Files:**
- Create: `src/renderer/components/AppliedTimeBarChart.tsx`

**Interfaces:**
- Consumes: `appliedTimeBarOption`（来自 `../charts`）、`Bucket`（来自 `../applied-time-buckets`）。
- Produces: `AppliedTimeBarChart({ buckets }: { buckets: Bucket[] })` — 一个固定高度的 ECharts 纵向柱状图 div。

> 说明：ECharts 在 jsdom 下需要 canvas，按现有约定（`RegionBarChart` 无单测）此组件**不做单测**，靠 typecheck + 启动验证。本任务的可交付物 = 通过 lint/build 且能在 app 中渲染。

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/components/AppliedTimeBarChart.tsx
import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import { appliedTimeBarOption } from '../charts'
import type { Bucket } from '../applied-time-buckets'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

export function AppliedTimeBarChart({ buckets }: { buckets: Bucket[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const option = useMemo(() => appliedTimeBarOption(buckets), [buckets])

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chartRef.current = chart
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setOption(option as EChartsCoreOption, true)
    chart.resize()
  }, [option])

  return <div ref={ref} style={{ width: '100%', height: 220 }} />
}
```

- [ ] **Step 2: Verify it typechecks / builds**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors involving `AppliedTimeBarChart`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/AppliedTimeBarChart.tsx
git commit -m "feat: AppliedTimeBarChart echarts component

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 可折叠面板 AppliedTimePanel

**Files:**
- Create: `src/renderer/components/AppliedTimePanel.tsx`

**Interfaces:**
- Consumes: `DatePresetChips`、`AppliedTimeBarChart`、`DateRangeField`（来自 `./DateFields`）、`bucketByAppliedTime` / `summaryText`（来自 `../applied-time-buckets`）、`presetRange` / `matchPreset` / `PresetKey`（来自 `../date-presets`）、`Ticket`。
- Produces:
  - `AppliedTimePanel({ tickets, from, to, onRangeChange }: Props)`
  - `interface Props { tickets: Ticket[]; from: number | null; to: number | null; onRangeChange: (from: number | null, to: number | null) => void }`
  - `tickets` 已是过滤后的列表；`from`/`to` 即 `filter.appliedFrom`/`appliedTo`。

> 说明：本组件含折叠状态与条件渲染，但依赖 ECharts canvas，遵循约定**不做单测**，靠启动验证。可交付物 = build 通过并在 app 中正确显示/折叠/空状态。

- [ ] **Step 1: Write the component**

```tsx
// src/renderer/components/AppliedTimePanel.tsx
import { useMemo, useState } from 'react'
import type { Ticket } from '@shared/types'
import { DatePresetChips } from './DatePresetChips'
import { AppliedTimeBarChart } from './AppliedTimeBarChart'
import { DateRangeField } from './DateFields'
import { bucketByAppliedTime, summaryText } from '../applied-time-buckets'
import { presetRange, matchPreset, type PresetKey } from '../date-presets'

interface Props {
  tickets: Ticket[]
  from: number | null
  to: number | null
  onRangeChange: (from: number | null, to: number | null) => void
}

/** Collapsible panel: quick-range chips + custom date + applied-time bar chart. */
export function AppliedTimePanel({ tickets, from, to, onRangeChange }: Props) {
  const [open, setOpen] = useState(true)
  const result = useMemo(() => bucketByAppliedTime(tickets, from, to), [tickets, from, to])
  const activePreset = matchPreset(from, to)

  function selectPreset(key: PresetKey) {
    const r = presetRange(key)
    onRangeChange(r.from, r.to)
  }

  return (
    <div className="shrink-0 border-b border-line bg-paper-2 px-6 py-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm text-ink-soft">申请时间分布</span>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen((o) => !o)}>
          {open ? '收起' : '展开'}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <DatePresetChips active={activePreset} onSelect={selectPreset} />
            <DateRangeField from={from} to={to} onChange={onRangeChange} />
          </div>
          {result.total === 0 ? (
            <div className="grid h-[180px] place-items-center text-sm text-muted">该范围内暂无售后单</div>
          ) : (
            <>
              <AppliedTimeBarChart buckets={result.buckets} />
              <div className="text-right text-xs text-muted tnum">{summaryText(result)}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it typechecks / builds**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/AppliedTimePanel.tsx
git commit -m "feat: collapsible AppliedTimePanel wiring chips, custom range and chart

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 接入 TicketsView 并默认「今日」

**Files:**
- Modify: `src/renderer/views/TicketsView.tsx`

**Interfaces:**
- Consumes: `AppliedTimePanel`（Task 6）、`presetRange`（Task 1）。
- Produces: 无新导出。改动两处：(a) `filter` 初始值默认今日范围；(b) 在 `TicketFilterBar` 与列表 `TicketTable` 之间插入 `AppliedTimePanel`，复用 `filtered` 与 `setFilter`。

- [ ] **Step 1: Add imports**

在现有 import 区加入（与第 11–12 行的 import 同组）：

```tsx
import { AppliedTimePanel } from '../components/AppliedTimePanel'
import { applyFilter, EMPTY_FILTER, type TicketFilter } from '../ticket-filter'
import { presetRange } from '../date-presets'
```

(原有 `import { applyFilter, EMPTY_FILTER, type TicketFilter } from '../ticket-filter'` 保留，仅新增 `AppliedTimePanel` 与 `presetRange` 两行。)

- [ ] **Step 2: Default the filter to today**

把第 22 行：

```tsx
const [filter, setFilter] = useState<TicketFilter>(EMPTY_FILTER)
```

替换为：

```tsx
const [filter, setFilter] = useState<TicketFilter>(() => {
  const r = presetRange('today')
  return { ...EMPTY_FILTER, appliedFrom: r.from, appliedTo: r.to }
})
```

- [ ] **Step 3: Embed the panel between the filter bar and the table**

把现有的：

```tsx
<TicketFilterBar filter={filter} onChange={setFilter} />
<div className="flex min-h-0 flex-1 flex-col">
  <TicketTable tickets={filtered} selected={selected} onOpen={(no) => { setSelected(no); setView('detail') }} onNew={() => setNewOpen(true)} onImport={importTickets} />
</div>
```

替换为：

```tsx
<TicketFilterBar filter={filter} onChange={setFilter} />
<AppliedTimePanel
  tickets={filtered}
  from={filter.appliedFrom}
  to={filter.appliedTo}
  onRangeChange={(appliedFrom, appliedTo) => setFilter({ ...filter, appliedFrom, appliedTo })}
/>
<div className="flex min-h-0 flex-1 flex-col">
  <TicketTable tickets={filtered} selected={selected} onOpen={(no) => { setSelected(no); setView('detail') }} onNew={() => setNewOpen(true)} onImport={importTickets} />
</div>
```

- [ ] **Step 4: Verify build + full test suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass (existing `ticket-filter`, `charts`, plus new `date-presets`, `applied-time-buckets`, `DatePresetChips`).

- [ ] **Step 5: Launch-verify (manual)**

Run: `npm run dev`
Verify in the app (参照 memory: CJS named-import / 启动崩溃 检查):
- 进入售后单页面，筛选栏下方出现「申请时间分布」面板，默认选中「今日」chip，表格与图表都只显示今日的单（若无今日数据则显示空状态「该范围内暂无售后单」）。
- 点「近30日」「近90日」，图表柱子随之变化、粒度自动切换（90 天应为按周），表格同步过滤，右下角汇总文字随之更新。
- 手动用日期控件选一个区间，chip 高亮全部取消。
- 点「收起 / 展开」面板正常折叠。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/views/TicketsView.tsx
git commit -m "feat: embed applied-time distribution panel in tickets view, default today

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage:**
- 按申请时间条形图 → Task 2 (聚合) + Task 3 (option) + Task 5 (chart) + Task 6 (panel)。
- 随筛选条件联动 → Task 7：图表吃 `filtered`（已过滤），与表格同源。
- 自定义时间范围 → Task 6 复用 `DateRangeField`。
- 快捷范围 今日/昨日/近7/30/90日 → Task 1 (`PRESETS`/`presetRange`) + Task 4 (chips) + Task 6 (接线)。
- 自适应粒度（31/180 阈值，天/周/月） → Task 2 `chooseGranularity` + 单测。
- 默认今日 → Task 7 Step 2。
- 空状态 → Task 6 (`result.total === 0`)。
- 无 appliedAt 过滤 → Task 2 + 单测。
- 视觉与设计令牌一致 → Task 4 / 6 使用 `bg-accent`/`text-ink-soft`/`bg-paper-2` 等。

**与 spec 文件表的偏差（有意细化）：** spec 文件表里写「在 `TicketFilterBar` 增加快捷 chip」。本计划改为独立的 `DatePresetChips` + `AppliedTimePanel`，把快捷 chip 放进图表面板（与 spec 的布局示意图一致），`TicketFilterBar` 不动。理由：chip 与图表同属一个可折叠面板更内聚，且 chip 与自定义日期写的是同一份 `appliedFrom/appliedTo`，联动语义不变。

**Placeholder scan:** 无 TBD/TODO；每个改码步骤均给出完整代码或精确替换。

**Type consistency:** `Bucket` / `BucketResult` / `Granularity` 在 Task 2 定义，Task 3/5/6 一致引用；`PresetKey` / `PresetRange` / `presetRange` / `matchPreset` 在 Task 1 定义，Task 4/6/7 一致引用；`AppliedTimePanel` 的 props（`tickets`/`from`/`to`/`onRangeChange`）在 Task 6 定义、Task 7 一致传入。
