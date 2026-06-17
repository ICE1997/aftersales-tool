# 售后单表格过滤 + 排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在售后单列表上叠加纯客户端的过滤(状态/类型/发货状态多选 + 申请时间区间)与排序(申请时间、状态两列),不改 IPC/DB。

**Architecture:** 纯逻辑下沉到 `src/renderer/ticket-filter.ts`(可单测);UI 由 `MultiSelectMenu` + `TicketFilterBar` 组成;`TicketsView` 持 filter 状态并 `applyFilter` 后传表;`TicketTable` 自持 sort 状态、内部 `applySort` 后分页。分层:搜索 → 过滤 → 排序 → 分页。

**Tech Stack:** React + TypeScript、Vitest(jsdom 项目跑 `tests/renderer/**`)。

**ABI 提示:** 跑 vitest 前若报 `NODE_MODULE_VERSION`,先 `npm run rebuild:node`。

---

## File Structure
- **Create:** `src/renderer/ticket-filter.ts`(纯逻辑 + 日期工具)、`src/renderer/components/MultiSelectMenu.tsx`、`src/renderer/components/TicketFilterBar.tsx`、`tests/renderer/ticket-filter.test.ts`。
- **Modify:** `src/renderer/components/TicketTable.tsx`(排序表头 + 页码重置 + 去掉 `query` prop)、`tests/renderer/TicketTable.test.tsx`(同步 prop 变更)、`src/renderer/views/TicketsView.tsx`(接线)。

---

## Task 1: 纯逻辑模块 `ticket-filter.ts` + 单测

**Files:** Create `src/renderer/ticket-filter.ts`, `tests/renderer/ticket-filter.test.ts`

- [ ] **Step 1: 写失败测试** — `tests/renderer/ticket-filter.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import type { Ticket } from '../../src/shared/types'
import {
  applyFilter, applySort, EMPTY_FILTER, DEFAULT_SORT,
  dayStartMs, dayEndMs, msToDateInput, type TicketFilter
} from '../../src/renderer/ticket-filter'

const EMPTY_CUSTOMER = {
  recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: ''
}
const EMPTY_AFTERSALE = {
  aftersaleType: '', aftersaleReason: '', shippingStatus: '',
  amount: null, refundAmount: null, appliedAt: null, returnLogistics: ''
} as const

function mk(over: Partial<Ticket> = {}): Ticket {
  return {
    aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '',
    status: '待商家处理', note: '', createdAt: 0, updatedAt: 0,
    ...EMPTY_CUSTOMER, ...EMPTY_AFTERSALE, ...over,
  }
}
const f = (over: Partial<TicketFilter> = {}): TicketFilter => ({ ...EMPTY_FILTER, ...over })

describe('applyFilter', () => {
  const list = [
    mk({ aftersaleNo: 'A', status: '待商家处理', aftersaleType: '退款', shippingStatus: '未发货', appliedAt: 100 }),
    mk({ aftersaleNo: 'B', status: '退款成功', aftersaleType: '换货', shippingStatus: '已发货', appliedAt: 200 }),
    mk({ aftersaleNo: 'C', status: '退款成功', aftersaleType: '退款', shippingStatus: '已发货', appliedAt: null }),
  ]
  const ids = (ts: Ticket[]) => ts.map((t) => t.aftersaleNo)

  it('empty filter returns all (unchanged length)', () => {
    expect(applyFilter(list, EMPTY_FILTER)).toHaveLength(3)
  })
  it('status multi-select (OR within facet)', () => {
    expect(ids(applyFilter(list, f({ statuses: ['退款成功'] })))).toEqual(['B', 'C'])
  })
  it('type multi-select', () => {
    expect(ids(applyFilter(list, f({ types: ['退款'] })))).toEqual(['A', 'C'])
  })
  it('shipping-status multi-select', () => {
    expect(ids(applyFilter(list, f({ shippingStatuses: ['已发货'] })))).toEqual(['B', 'C'])
  })
  it('facets combine with AND', () => {
    expect(ids(applyFilter(list, f({ statuses: ['退款成功'], types: ['退款'] })))).toEqual(['C'])
  })
  it('date from (inclusive) excludes null appliedAt', () => {
    expect(ids(applyFilter(list, f({ appliedFrom: 200 })))).toEqual(['B'])
  })
  it('date to (inclusive)', () => {
    expect(ids(applyFilter(list, f({ appliedTo: 100 })))).toEqual(['A'])
  })
  it('date range both bounds', () => {
    expect(ids(applyFilter(list, f({ appliedFrom: 100, appliedTo: 200 })))).toEqual(['A', 'B'])
  })
})

describe('applySort', () => {
  const ids = (ts: Ticket[]) => ts.map((t) => t.aftersaleNo)
  it('appliedAt asc, nulls last', () => {
    const list = [mk({ aftersaleNo: 'n', appliedAt: null }), mk({ aftersaleNo: 'b', appliedAt: 200 }), mk({ aftersaleNo: 'a', appliedAt: 100 })]
    expect(ids(applySort(list, { key: 'appliedAt', dir: 'asc' }))).toEqual(['a', 'b', 'n'])
  })
  it('appliedAt desc, nulls still last', () => {
    const list = [mk({ aftersaleNo: 'n', appliedAt: null }), mk({ aftersaleNo: 'a', appliedAt: 100 }), mk({ aftersaleNo: 'b', appliedAt: 200 })]
    expect(ids(applySort(list, { key: 'appliedAt', dir: 'desc' }))).toEqual(['b', 'a', 'n'])
  })
  it('status by STATUS_ORDER asc', () => {
    const list = [mk({ aftersaleNo: 'x', status: '退款成功' }), mk({ aftersaleNo: 'y', status: '待商家处理' })]
    expect(ids(applySort(list, { key: 'status', dir: 'asc' }))).toEqual(['y', 'x'])
  })
  it('is stable for equal keys', () => {
    const list = [mk({ aftersaleNo: '1', appliedAt: 5 }), mk({ aftersaleNo: '2', appliedAt: 5 }), mk({ aftersaleNo: '3', appliedAt: 5 })]
    expect(ids(applySort(list, { key: 'appliedAt', dir: 'asc' }))).toEqual(['1', '2', '3'])
    expect(ids(applySort(list, { key: 'appliedAt', dir: 'desc' }))).toEqual(['1', '2', '3'])
  })
  it('does not mutate the input', () => {
    const list = [mk({ aftersaleNo: 'a', appliedAt: 2 }), mk({ aftersaleNo: 'b', appliedAt: 1 })]
    applySort(list, DEFAULT_SORT)
    expect(ids(list)).toEqual(['a', 'b'])
  })
})

describe('date helpers', () => {
  it('dayStartMs is local midnight; dayEndMs is local 23:59:59.999', () => {
    const start = dayStartMs('2026-05-28')!
    const end = dayEndMs('2026-05-28')!
    expect(new Date(start).getHours()).toBe(0)
    expect(new Date(start).getMinutes()).toBe(0)
    expect(end - start).toBe(24 * 3600 * 1000 - 1)
  })
  it('invalid / empty input → null', () => {
    expect(dayStartMs('')).toBeNull()
    expect(dayStartMs('nope')).toBeNull()
    expect(dayEndMs('2026-5-8')).toBeNull()
  })
  it('msToDateInput round-trips with dayStartMs', () => {
    const ms = dayStartMs('2026-05-28')!
    expect(msToDateInput(ms)).toBe('2026-05-28')
    expect(msToDateInput(null)).toBe('')
  })
})
```
Run: `npm run rebuild:node && npx vitest run tests/renderer/ticket-filter.test.ts` → FAIL (module missing).

- [ ] **Step 2: 实现** — `src/renderer/ticket-filter.ts`
```ts
import type { Ticket, TicketStatus } from '@shared/types'
import { STATUS_ORDER } from './status'

export interface TicketFilter {
  statuses: TicketStatus[]
  types: string[]
  shippingStatuses: string[]
  appliedFrom: number | null
  appliedTo: number | null
}

export const EMPTY_FILTER: TicketFilter = {
  statuses: [], types: [], shippingStatuses: [], appliedFrom: null, appliedTo: null
}

export type SortKey = 'appliedAt' | 'status'
export type SortDir = 'asc' | 'desc'
export interface Sort { key: SortKey; dir: SortDir }

export const DEFAULT_SORT: Sort = { key: 'appliedAt', dir: 'desc' }

/** True when no facet is active. */
export function isFilterActive(f: TicketFilter): boolean {
  return f.statuses.length > 0 || f.types.length > 0 || f.shippingStatuses.length > 0 ||
    f.appliedFrom != null || f.appliedTo != null
}

/** Keep tickets passing every active facet (empty array / null facet = no constraint). */
export function applyFilter(tickets: Ticket[], f: TicketFilter): Ticket[] {
  return tickets.filter((t) => {
    if (f.statuses.length && !f.statuses.includes(t.status)) return false
    if (f.types.length && !f.types.includes(t.aftersaleType)) return false
    if (f.shippingStatuses.length && !f.shippingStatuses.includes(t.shippingStatus)) return false
    if (f.appliedFrom != null && (t.appliedAt == null || t.appliedAt < f.appliedFrom)) return false
    if (f.appliedTo != null && (t.appliedAt == null || t.appliedAt > f.appliedTo)) return false
    return true
  })
}

function statusRank(s: TicketStatus): number {
  const i = STATUS_ORDER.indexOf(s)
  return i === -1 ? STATUS_ORDER.length : i
}

/** Stable sort into a NEW array. appliedAt nulls always sort last (both directions). */
export function applySort(tickets: Ticket[], sort: Sort): Ticket[] {
  const dir = sort.dir === 'desc' ? -1 : 1
  return tickets
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      let cmp: number
      if (sort.key === 'appliedAt') {
        const av = a.t.appliedAt, bv = b.t.appliedAt
        if (av == null && bv == null) cmp = 0
        else if (av == null) return 1
        else if (bv == null) return -1
        else cmp = (av - bv) * dir
      } else {
        cmp = (statusRank(a.t.status) - statusRank(b.t.status)) * dir
      }
      return cmp !== 0 ? cmp : a.i - b.i
    })
    .map((x) => x.t)
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 'YYYY-MM-DD' → local 00:00:00.000 ms, or null if malformed/empty. */
export function dayStartMs(input: string): number | null {
  const m = DATE_RE.exec(input.trim())
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime()
}

/** 'YYYY-MM-DD' → local 23:59:59.999 ms, or null if malformed/empty. */
export function dayEndMs(input: string): number | null {
  const m = DATE_RE.exec(input.trim())
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime()
}

/** epoch ms → local 'YYYY-MM-DD' for <input type=date>; null → ''. */
export function msToDateInput(ms: number | null): string {
  if (ms == null) return ''
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
```

- [ ] **Step 3: 跑测试** — `npx vitest run tests/renderer/ticket-filter.test.ts` → 全 PASS。

- [ ] **Step 4: Commit**
```bash
git add src/renderer/ticket-filter.ts tests/renderer/ticket-filter.test.ts
git commit -m "feat(table): pure ticket filter + sort logic with tests"
```

---

## Task 2: `MultiSelectMenu` 复用组件

**Files:** Create `src/renderer/components/MultiSelectMenu.tsx`

- [ ] **Step 1: 实现** — `src/renderer/components/MultiSelectMenu.tsx`
```tsx
import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}

/** A button showing `label` (+ a count badge when any selected) that opens a
 * checkbox popover. Closes on outside click. Pure string options. */
export function MultiSelectMenu({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])

  return (
    <div ref={ref} className="relative">
      <button
        className={`btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm ${selected.length ? 'border-accent text-accent-ink' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {selected.length > 0 && (
          <span className="tnum rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-tight text-white">{selected.length}</span>
        )}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-[180px] overflow-auto rounded-xl2 border border-line bg-surface p-1.5 shadow-card">
          {options.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper-2">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              <span className="text-ink">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 验证** — `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep "MultiSelectMenu" | grep -vE "Cannot find (name|module).*(node:|react)"` → 无真实错误。`npm run build` → success。

- [ ] **Step 3: Commit**
```bash
git add src/renderer/components/MultiSelectMenu.tsx
git commit -m "feat(table): reusable MultiSelectMenu popover"
```

---

## Task 3: `TicketFilterBar` 过滤工具条

**Files:** Create `src/renderer/components/TicketFilterBar.tsx`

- [ ] **Step 1: 实现** — `src/renderer/components/TicketFilterBar.tsx`
```tsx
import { MultiSelectMenu } from './MultiSelectMenu'
import { STATUS_ORDER } from '../status'
import { TYPE_OPTIONS, SHIPPING_OPTIONS } from '../aftersale-options'
import { EMPTY_FILTER, isFilterActive, dayStartMs, dayEndMs, msToDateInput, type TicketFilter } from '../ticket-filter'
import type { TicketStatus } from '@shared/types'

interface Props { filter: TicketFilter; onChange: (f: TicketFilter) => void }

export function TicketFilterBar({ filter, onChange }: Props) {
  const active = isFilterActive(filter)
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper-2 px-6 py-2.5">
      <MultiSelectMenu
        label="状态" options={STATUS_ORDER as unknown as string[]} selected={filter.statuses}
        onChange={(v) => onChange({ ...filter, statuses: v as TicketStatus[] })}
      />
      <MultiSelectMenu
        label="类型" options={TYPE_OPTIONS} selected={filter.types}
        onChange={(v) => onChange({ ...filter, types: v })}
      />
      <MultiSelectMenu
        label="发货状态" options={SHIPPING_OPTIONS} selected={filter.shippingStatuses}
        onChange={(v) => onChange({ ...filter, shippingStatuses: v })}
      />
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <span>申请时间</span>
        <input
          type="date" aria-label="申请时间起" className="field tnum w-[140px] py-1"
          value={msToDateInput(filter.appliedFrom)}
          onChange={(e) => onChange({ ...filter, appliedFrom: dayStartMs(e.target.value) })}
        />
        <span>至</span>
        <input
          type="date" aria-label="申请时间止" className="field tnum w-[140px] py-1"
          value={msToDateInput(filter.appliedTo)}
          onChange={(e) => onChange({ ...filter, appliedTo: dayEndMs(e.target.value) })}
        />
      </div>
      <button
        className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-40"
        disabled={!active}
        onClick={() => onChange(EMPTY_FILTER)}
      >清除</button>
    </div>
  )
}
```

- [ ] **Step 2: 验证** — `npm run build` → success。

- [ ] **Step 3: Commit**
```bash
git add src/renderer/components/TicketFilterBar.tsx
git commit -m "feat(table): TicketFilterBar toolbar (status/type/shipping/date)"
```

---

## Task 4: `TicketTable` 排序表头 + 去掉 `query` prop

**Files:** Modify `src/renderer/components/TicketTable.tsx`, `tests/renderer/TicketTable.test.tsx`

- [ ] **Step 1: 改组件** — `src/renderer/components/TicketTable.tsx`

1. Imports — 增加 sort 逻辑:
```ts
import { applySort, DEFAULT_SORT, type SortKey } from '../ticket-filter'
```
2. Props 接口 — 去掉 `query`:
```ts
interface Props { tickets: Ticket[]; onOpen: (no: string) => void; onNew: () => void; onImport?: () => void }
```
3. 函数签名同步去掉 `query`:
```ts
export function TicketTable({ tickets, onOpen, onNew, onImport }: Props) {
```
4. 加 sort 状态,并把页码重置改为按 `tickets` 引用:
```ts
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState(DEFAULT_SORT)
  useEffect(() => { setPage(1) }, [tickets])

  const total = tickets.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  const rows = paginate(applySort(tickets, sort), current, pageSize)

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '')
```
5. 把「售后状态」「申请时间」两个 `<th>` 改为可点击(其余 `<th>` 不变):
```tsx
                <th className="px-4 py-2.5 text-left font-medium">售后单号</th>
                <th className="px-4 py-2.5 text-left font-medium">
                  <button className="inline-flex items-center font-medium uppercase tracking-wider hover:text-accent-ink" onClick={() => toggleSort('status')}>售后状态{arrow('status')}</button>
                </th>
                <th className="px-4 py-2.5 text-left font-medium">售后类型</th>
                <th className="px-4 py-2.5 text-left font-medium">收件人</th>
                <th className="px-4 py-2.5 text-left font-medium">地区</th>
                <th className="px-4 py-2.5 text-left font-medium">订单号</th>
                <th className="px-4 py-2.5 text-left font-medium">发货快递单号</th>
                <th className="px-4 py-2.5 text-left font-medium">退货快递单号</th>
                <th className="px-4 py-2.5 text-left font-medium">退货物流状态</th>
                <th className="px-4 py-2.5 text-left font-medium">
                  <button className="inline-flex items-center font-medium uppercase tracking-wider hover:text-accent-ink" onClick={() => toggleSort('appliedAt')}>申请时间{arrow('appliedAt')}</button>
                </th>
```

- [ ] **Step 2: 改测试** — `tests/renderer/TicketTable.test.tsx`
  - 删除所有 `query=""` / `query="x"` 入参(组件不再有该 prop)。
  - 把 "resets to page 1 when the query changes" 用例改为按 `tickets` 引用变化重置:
```tsx
  it('resets to page 1 when the tickets list changes', () => {
    const { rerender } = render(<TicketTable tickets={mks(25)} onOpen={() => {}} onNew={() => {}} />)
    fireEvent.click(screen.getByText('下一页'))
    expect(screen.getByText('AS-21')).toBeTruthy()
    rerender(<TicketTable tickets={mks(25)} onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('AS-1')).toBeTruthy()
    expect(screen.queryByText('AS-21')).toBeNull()
  })
```
  - 其余用例同样去掉 `query` 入参(保持断言不变)。
  - 新增一个排序用例:
```tsx
  it('sorts by 申请时间 when its header is clicked', () => {
    const tickets = [mk({ aftersaleNo: 'OLD', appliedAt: 100 }), mk({ aftersaleNo: 'NEW', appliedAt: 200 })]
    render(<TicketTable tickets={tickets} onOpen={() => {}} onNew={() => {}} />)
    // default desc → NEW first
    let rows = screen.getAllByRole('row')
    expect(rows[1].textContent).toContain('NEW')
    fireEvent.click(screen.getByText(/申请时间/))
    rows = screen.getAllByRole('row')
    expect(rows[1].textContent).toContain('OLD') // now asc
  })
```

- [ ] **Step 3: 跑测试** — `npx vitest run tests/renderer/TicketTable.test.tsx` → 全 PASS。

- [ ] **Step 4: Commit**
```bash
git add src/renderer/components/TicketTable.tsx tests/renderer/TicketTable.test.tsx
git commit -m "feat(table): sortable 申请时间/售后状态 headers; reset page on list change"
```

---

## Task 5: `TicketsView` 接线

**Files:** Modify `src/renderer/views/TicketsView.tsx`

- [ ] **Step 1: 接线**
1. Imports:
```ts
import { useEffect, useMemo, useState } from 'react'
import { TicketFilterBar } from '../components/TicketFilterBar'
import { applyFilter, EMPTY_FILTER, type TicketFilter } from '../ticket-filter'
```
2. 新增状态 + 派生列表(放在其它 `useState` 旁):
```ts
  const [filter, setFilter] = useState<TicketFilter>(EMPTY_FILTER)
  const filtered = useMemo(() => applyFilter(tickets, filter), [tickets, filter])
```
3. 在搜索栏区块之后、表格容器之前,渲染过滤条;并把表格的 `tickets` 改为 `filtered`、去掉 `query`:
```tsx
          <div className="shrink-0 border-b border-line bg-paper-2 px-6 py-3"><div className="max-w-xl"><SearchBar onSearch={onSearch} /></div></div>
          <TicketFilterBar filter={filter} onChange={setFilter} />
          <div className="flex min-h-0 flex-1 flex-col">
            <TicketTable tickets={filtered} onOpen={(no) => { setSelected(no); setView('detail') }} onNew={() => setNewOpen(true)} onImport={importTickets} />
          </div>
```
> `TicketFilterBar` 自带 `border-b`,放在 `flex-col` 容器里默认 `shrink-0`(不会被压缩),无需额外类。

- [ ] **Step 2: 验证**
Run: `npm run build` → success。
Run: `npm run rebuild:node && npx vitest run` → 0 failures(汇报数量)。

- [ ] **Step 3: Commit**
```bash
git add src/renderer/views/TicketsView.tsx
git commit -m "feat(table): wire filter bar + filtered list into TicketsView"
```

---

## 手验清单(dev)
`npm run rebuild:electron && npm run dev`:
- 搜索框下出现工具条:状态/类型/发货状态三个多选(选中显示计数角标)、申请时间起止两个日期框、`清除`。
- 多选某状态 → 列表只剩该状态;组合多个 facet 为 AND。
- 设申请时间区间 → 仅区间内(含边界)的单子;无申请时间的单子被排除。
- `清除` → 过滤复位,但搜索词与排序不变。
- 点「申请时间」「售后状态」表头 → 升/降序切换,箭头正确;默认进入按申请时间倒序。
- 过滤/搜索/排序后页码回到第 1 页。
- 验证后 `npm run rebuild:node` 还原 ABI。

---

## Self-Review(已核对 spec)
- **§2.1 ticket-filter.ts(类型/EMPTY_FILTER/applyFilter/applySort/DEFAULT_SORT/日期工具/isFilterActive)**:Task 1。✓
- **§2.2 MultiSelectMenu**:Task 2。✓
- **§2.3 TicketFilterBar(三多选 + 日期区间 + 清除仅重置过滤)**:Task 3。✓
- **§2.4 TicketTable(自持 sort、applySort 后分页、两列可点表头、页码改按 tickets 重置、去 query)**:Task 4。✓
- **§2.5 TicketsView(filter 状态 + useMemo + 渲染 FilterBar + 传 filtered)**:Task 5。✓
- **§3 数据流(搜索→过滤→排序→分页;计数=filtered.length)**:Task 4/5。✓
- **§5 测试(applyFilter 各 facet/组合/日期边界、applySort null末尾/STATUS_ORDER/稳定/不可变、日期工具边界 round-trip)**:Task 1。✓
- **类型一致**:`TicketFilter`/`Sort`/`SortKey`/`applyFilter`/`applySort`/`isFilterActive`/`dayStartMs`/`dayEndMs`/`msToDateInput` 全程一致;`TicketTable` Props 去 `query` 后所有调用处(TicketsView + 测试)同步。✓
- **占位符扫描**:无 TBD;每步完整代码。✓
- **YAGNI**:无地区/金额过滤、无全列排序、不持久化、无服务端、不加空结果文案。✓
