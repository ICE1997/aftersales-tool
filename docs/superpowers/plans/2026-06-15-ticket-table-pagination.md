# 售后单分页表格 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把售后单列表从左侧卡片列表改为全宽分页表格,布局改为"列表/详情"两态,视觉沿用既有设计系统。

**Architecture:** 纯前端分页(百级规模,一次取回);新增 `table.ts`(paginate/formatTime 纯函数)+ `TicketTable.tsx`;`App` 增 `view: 'list'|'detail'`;`TicketDetail` 加 `onBack`;删除 `TicketList`。后端/IPC/repo 不变。

**Tech Stack:** React + TS, Tailwind(既有设计令牌), Vitest(jsdom)。

---

## File Structure

```
src/renderer/table.ts                        # 新增:paginate / formatTime(纯函数)
src/renderer/components/TicketTable.tsx       # 新增:分页表格
src/renderer/App.tsx                          # 改:list/detail 两态;移除 aside/TicketList/EmptyState
src/renderer/components/TicketDetail.tsx      # 改:加 onBack + 返回按钮
(delete) src/renderer/components/TicketList.tsx

tests/renderer/table.test.ts                  # 新增:paginate/formatTime
tests/renderer/TicketTable.test.tsx           # 新增:分页/翻页/行点击/单页隐藏翻页
```

> 测试在 system Node ABI 下跑(`npm run rebuild:node` 后 `npx vitest run`)。`npm run dev` 前 `npm run rebuild:electron`。

---

## Task 1: 纯函数 table.ts(paginate / formatTime)

**Files:**
- Create: `src/renderer/table.ts`
- Test: `tests/renderer/table.test.ts`

- [ ] **Step 1: 写失败测试** `tests/renderer/table.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { paginate, formatTime } from '../../src/renderer/table'

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i)
  it('returns the requested page slice', () => {
    expect(paginate(items, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(paginate(items, 3, 10)).toEqual([20, 21, 22, 23, 24])
  })
  it('clamps an out-of-range page to the last page', () => {
    expect(paginate(items, 9, 10)).toEqual([20, 21, 22, 23, 24])
  })
  it('clamps a page below 1 to the first page', () => {
    expect(paginate(items, 0, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('returns empty for an empty array', () => {
    expect(paginate([], 1, 10)).toEqual([])
  })
})

describe('formatTime', () => {
  it('formats a local time as YYYY-MM-DD HH:mm', () => {
    const ms = new Date(2024, 0, 9, 8, 5).getTime() // local 2024-01-09 08:05
    expect(formatTime(ms)).toBe('2024-01-09 08:05')
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/renderer/table.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现** `src/renderer/table.ts`

```ts
/** Slice `items` to page `page` (1-based). Out-of-range pages clamp into [1, pageCount]. */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  if (items.length === 0) return []
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const p = Math.min(Math.max(1, page), pageCount)
  const start = (p - 1) * pageSize
  return items.slice(start, start + pageSize)
}

/** Format an epoch-ms timestamp as local `YYYY-MM-DD HH:mm`. */
export function formatTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
```

- [ ] **Step 4: 运行,确认通过 + 全套**

Run: `npx vitest run tests/renderer/table.test.ts` → PASS
Run: `npx vitest run` → 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/table.ts tests/renderer/table.test.ts
git commit -m "feat: paginate + formatTime helpers for ticket table"
```

---

## Task 2: TicketTable 组件

**Files:**
- Create: `src/renderer/components/TicketTable.tsx`
- Test: `tests/renderer/TicketTable.test.tsx`

- [ ] **Step 1: 写失败测试** `tests/renderer/TicketTable.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Ticket } from '../../src/shared/types'
import { TicketTable } from '../../src/renderer/components/TicketTable'

afterEach(() => cleanup())

function mk(n: number): Ticket[] {
  return Array.from({ length: n }, (_, i) => ({
    aftersaleNo: `AS-${i + 1}`, orderNo: `O${i + 1}`, shippingNo: '', returnNo: '',
    status: 'pending' as const, note: '', createdAt: i, updatedAt: i
  }))
}

describe('TicketTable', () => {
  it('shows the first page (default 20 rows) and the total count', () => {
    render(<TicketTable tickets={mk(25)} query="" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('共 25 条')).toBeTruthy()
    expect(screen.getAllByRole('row').length).toBe(1 + 20) // header + 20 body rows
  })

  it('goes to the next page', () => {
    render(<TicketTable tickets={mk(25)} query="" onOpen={() => {}} onNew={() => {}} />)
    fireEvent.click(screen.getByText('下一页'))
    expect(screen.getAllByRole('row').length).toBe(1 + 5)
    expect(screen.getByText('AS-21')).toBeTruthy()
  })

  it('calls onOpen with the row aftersaleNo when a row is clicked', () => {
    const onOpen = vi.fn()
    render(<TicketTable tickets={mk(3)} query="" onOpen={onOpen} onNew={() => {}} />)
    fireEvent.click(screen.getByText('AS-2'))
    expect(onOpen).toHaveBeenCalledWith('AS-2')
  })

  it('hides the pager when everything fits on one page', () => {
    render(<TicketTable tickets={mk(5)} query="" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.queryByText('下一页')).toBeNull()
    expect(screen.getByText('共 5 条')).toBeTruthy()
  })

  it('shows the empty state when there are no tickets', () => {
    render(<TicketTable tickets={[]} query="" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('暂无售后单')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/renderer/TicketTable.test.tsx`
Expected: FAIL — 组件不存在。

- [ ] **Step 3: 实现** `src/renderer/components/TicketTable.tsx`

```tsx
import { useEffect, useState } from 'react'
import type { Ticket } from '@shared/types'
import { STATUS_META } from '../status'
import { paginate, formatTime } from '../table'
import { IconBox, IconPlus } from './icons'

interface Props { tickets: Ticket[]; query: string; onOpen: (no: string) => void; onNew: () => void }

const SIZES = [10, 20, 50]

export function TicketTable({ tickets, query, onOpen, onNew }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [query, pageSize])

  const total = tickets.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  const rows = paginate(tickets, current, pageSize)

  return (
    <div className="p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-sm font-bold tracking-tight text-ink">售后单</span>
          <span className="tnum text-xs text-muted">{total}</span>
        </div>
        <button className="btn-primary px-3 py-1.5 text-sm" onClick={onNew}><IconPlus className="text-[15px]" /> 新建售后单</button>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-line bg-surface py-20 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-paper-2 text-muted"><IconBox className="text-2xl" /></div>
          <p className="text-sm text-muted">暂无售后单</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-paper-2 text-[11px] uppercase tracking-wider text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 text-left font-medium">售后单号</th>
                <th className="px-4 py-2.5 text-left font-medium">状态</th>
                <th className="px-4 py-2.5 text-left font-medium">订单号</th>
                <th className="px-4 py-2.5 text-left font-medium">发货单号</th>
                <th className="px-4 py-2.5 text-left font-medium">退货单号</th>
                <th className="px-4 py-2.5 text-left font-medium">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const meta = STATUS_META[t.status]
                return (
                  <tr
                    key={t.aftersaleNo}
                    className="animate-rise cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-paper-2"
                    style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
                    onClick={() => onOpen(t.aftersaleNo)}
                  >
                    <td className="tnum px-4 py-3 font-medium text-ink">{t.aftersaleNo}</td>
                    <td className="px-4 py-3"><span className={`chip ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span></td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.orderNo || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.shippingNo || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.returnNo || '—'}</td>
                    <td className="px-4 py-3 text-muted">{formatTime(t.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between gap-3 border-t border-line bg-paper-2 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-muted">
              <span>共 {total} 条</span>
              <select className="rounded border border-line bg-surface px-1.5 py-1 text-xs" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {SIZES.map((s) => <option key={s} value={s}>{s} / 页</option>)}
              </select>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <button className="btn-ghost px-2.5 py-1 text-xs disabled:opacity-50" disabled={current <= 1} onClick={() => setPage(current - 1)}>上一页</button>
                <span className="tnum text-xs text-ink-soft">{current} / {pageCount}</span>
                <button className="btn-ghost px-2.5 py-1 text-xs disabled:opacity-50" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>下一页</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 运行,确认通过 + 全套**

Run: `npx vitest run tests/renderer/TicketTable.test.tsx` → PASS(5 例)。
Run: `npx vitest run` → 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TicketTable.tsx tests/renderer/TicketTable.test.tsx
git commit -m "feat: paginated TicketTable component"
```

---

## Task 3: App 两态布局 + TicketDetail 返回 + 删除 TicketList

**Files:**
- Modify: `src/renderer/App.tsx` (full rewrite)
- Modify: `src/renderer/components/TicketDetail.tsx`
- Delete: `src/renderer/components/TicketList.tsx`

- [ ] **Step 1: 给 TicketDetail 加 onBack + 返回按钮**

在 `src/renderer/components/TicketDetail.tsx`:
1. 改函数签名为:
```ts
export function TicketDetail({ aftersaleNo, onChanged, onDeleted, onBack }: { aftersaleNo: string; onChanged: () => void; onDeleted: () => void; onBack: () => void }) {
```
2. 在头部 `<div className="flex items-start gap-3">` 之后,作为它的第一个子元素插入返回按钮(放在 `<div className="min-w-0">` 之前):
```tsx
          <button className="btn-ghost mt-0.5 px-2.5" onClick={onBack} aria-label="返回">← 返回</button>
```
其余逻辑不变。

- [ ] **Step 2: 重写 `src/renderer/App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { NewTicket, Ticket } from '@shared/types'
import { api } from './api'
import { SearchBar } from './components/SearchBar'
import { TicketTable } from './components/TicketTable'
import { TicketDetail } from './components/TicketDetail'
import { SettingsDialog } from './components/SettingsDialog'
import { NewTicketDialog } from './components/NewTicketDialog'
import { IconSettings, IconClose, IconBox } from './components/icons'

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selected, setSelected] = useState<string | undefined>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load(q = query) { setTickets(q ? await api.searchTickets(q) : await api.listTickets()) }
  useEffect(() => { load('') }, [])

  function onSearch(q: string) { setQuery(q); load(q) }

  async function createTicket(t: NewTicket) {
    try {
      await api.createTicket(t)
      setNewOpen(false)
      setError(null)
      await load()
    } catch (e) {
      setError(`创建失败:${(e as Error).message}`)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl2 bg-accent text-white shadow-sm">
            <IconBox className="text-[18px]" />
          </span>
          <div className="leading-tight">
            <div className="font-display text-[17px] font-extrabold tracking-tight">vhelper</div>
            <div className="-mt-0.5 text-[11px] text-muted">售后材料管理</div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-xl"><SearchBar onSearch={onSearch} /></div>
        <button className="btn-ghost shrink-0 px-3" onClick={() => setSettingsOpen(true)} aria-label="设置">
          <IconSettings className="text-[16px]" />
          <span className="hidden sm:inline">设置</span>
        </button>
      </header>

      {error && (
        <div className="flex animate-slidedown items-center justify-between gap-3 border-b border-danger-soft bg-danger-soft px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button className="rounded p-1 hover:bg-white/40" onClick={() => setError(null)} aria-label="关闭"><IconClose className="text-[14px]" /></button>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        {view === 'detail' && selected ? (
          <TicketDetail
            aftersaleNo={selected}
            onBack={() => setView('list')}
            onChanged={() => load()}
            onDeleted={() => { setView('list'); load() }}
          />
        ) : (
          <TicketTable
            tickets={tickets}
            query={query}
            onOpen={(no) => { setSelected(no); setView('detail') }}
            onNew={() => setNewOpen(true)}
          />
        )}
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewTicketDialog open={newOpen} onCreate={createTicket} onCancel={() => setNewOpen(false)} />
    </div>
  )
}
```
(移除了 `TicketList` import、`<aside>`、`EmptyState` 函数;`createTicket` 不再 `setSelected`/跳转,仅刷新列表。)

- [ ] **Step 3: 删除 TicketList**

```bash
git rm src/renderer/components/TicketList.tsx
```

- [ ] **Step 4: 验证**

Run: `npx vitest run` → 全绿(既有渲染测试不受影响;无对 TicketList 的测试引用)。
Run: `npm run build` → 干净打包。
Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -vE "node_modules|Cannot find (type definition|module).*node:|Cannot find name '(Buffer|process|console|HTMLElement|File|Blob|URL|window|document|Image|DataTransfer|ClipboardEvent)'" | grep -E "App.tsx|TicketDetail|TicketTable|TicketList" || echo "no feature type errors"`
Expected: `no feature type errors`(无 TicketList 残留引用、TicketDetail onBack 一致)。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/TicketDetail.tsx
git commit -m "feat: list/detail layout with TicketTable; TicketDetail back button; drop TicketList"
```

---

## Task 4: dev 真机验证

**Files:** 无(仅验证)

- [ ] **Step 1: 启动**

```bash
npm run rebuild:electron
npm run dev
```

- [ ] **Step 2: 手动验证清单**

1. 启动后默认显示全宽售后单表格;无数据显示「暂无售后单」。
2. 「+ 新建售后单」→ 填单号创建 → 留在列表,表格出现新行。
3. 多建几条 → 底部「共 N 条」;每页条数切 10/20/50,翻页「上一页/下一页」与「current/总页」正确;仅一页时翻页控件隐藏。
4. 点某行 → 进入该售后单材料详情;顶部「← 返回」回到表格(且保持之前的搜索/页基本可用)。
5. 详情里删除售后单 → 回到表格并刷新(该行消失)。
6. 顶部搜索单号片段 → 表格过滤且回到第 1 页;清空恢复。
7. 状态胶囊颜色、等宽单号、更新时间格式正确;表头吸顶、行 hover 高亮。

- [ ] **Step 3: 还原 ABI**

```bash
npm run rebuild:node
npx vitest run   # 仍全绿
```

---

## Self-Review 记录

- **Spec 覆盖**:list/detail 两态 + 移除 aside/TicketList → Task 3;数据流不变(listTickets/searchTickets,前端切片)→ Task 2/3;`paginate`/`formatTime` → Task 1;TicketTable 列(售后单号/状态/订单/发货/退货/更新时间)、状态胶囊、tnum、空值「—」、空状态、表头吸顶、行 hover/错位淡入、顶部「新建」、底部每页条数(10/20/50 默认 20)+ 翻页 + 共 N 条 + 单页隐藏 → Task 2;搜索重置到第 1 页(query 依赖)→ Task 2;TicketDetail `onBack` 返回按钮 → Task 3;测试(paginate/formatTime TDD、TicketTable 组件测、dev 手验)→ Task 1/2/4;不做后端分页/排序/列宽/多选 → 未引入。
- **类型一致性**:`TicketTable` props `{tickets, query, onOpen, onNew}`(Task 2)与 App 用法(Task 3)一致;`TicketDetail` 新增 `onBack`(Task 3 Step1)与 App 传参(Task 3 Step2)一致;`paginate`/`formatTime`(Task 1)被 TicketTable(Task 2)按签名使用;删除 `TicketList` 后 App 不再 import 它(Task 3)。
- **占位符**:无。
- **注意**:vitest 渲染测试已能解析 `@shared` 别名(既有组件测试如此);`table.ts` 不依赖别名。`getAllByRole('row')` 计入表头行,故断言为 `1 + N`。
