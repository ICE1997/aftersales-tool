# 售后单表格过滤 + 排序 设计文档

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:售后单列表当前把全部单子加载进渲染进程内存,客户端分页(`src/renderer/table.ts` 的 `paginate`),搜索框走服务端 FTS(`api.searchTickets`)。本 spec 在内存数组上叠加**纯客户端**的过滤与排序,无需改动 IPC/DB。

---

## 1. 概述

为售后单表格增加:

- **过滤工具条**(搜索框下方),覆盖 4 个维度:
  - 售后状态(多选)
  - 售后类型(多选)
  - 发货状态(多选)
  - 申请时间(日期区间)
- **列排序**:`申请时间`、`售后状态` 两列可点击表头切换升/降序;默认按申请时间倒序(最新在前)。

分层顺序固定为:**搜索结果 → 过滤 → 排序 → 分页**。搜索框、过滤、排序三者独立叠加。

---

## 2. 架构

### 2.1 纯逻辑模块 `src/renderer/ticket-filter.ts`(无 React / 无 IO,可单测)

类型:

```ts
import type { Ticket, TicketStatus } from '@shared/types'

export interface TicketFilter {
  statuses: TicketStatus[]
  types: string[]            // 售后类型
  shippingStatuses: string[] // 发货状态
  appliedFrom: number | null // epoch ms,含
  appliedTo: number | null   // epoch ms,含
}

export const EMPTY_FILTER: TicketFilter = {
  statuses: [], types: [], shippingStatuses: [], appliedFrom: null, appliedTo: null
}

export type SortKey = 'appliedAt' | 'status'
export type SortDir = 'asc' | 'desc'
export interface Sort { key: SortKey; dir: SortDir }

export const DEFAULT_SORT: Sort = { key: 'appliedAt', dir: 'desc' }
```

函数:

- `applyFilter(tickets: Ticket[], filter: TicketFilter): Ticket[]`
  - 每个 facet 为空数组 / null = 无约束(不过滤)。
  - `statuses` / `types` / `shippingStatuses`:成员判断(`facet.includes(ticket.x)`)。`types` 比对 `ticket.aftersaleType`,`shippingStatuses` 比对 `ticket.shippingStatus`。
  - 日期:`appliedFrom != null` 时要求 `ticket.appliedAt != null && ticket.appliedAt >= appliedFrom`;`appliedTo != null` 时要求 `ticket.appliedAt != null && ticket.appliedAt <= appliedTo`。即设了任一日期边界时,`appliedAt` 为 null 的单子被排除。
  - 多个 facet 之间是 **AND**;同一多选 facet 内是 **OR**。

- `applySort(tickets: Ticket[], sort: Sort): Ticket[]`
  - 返回新数组,**稳定排序**(基于原数组下标做 tie-break)。
  - `appliedAt`:按数值比较;`null` 永远排在末尾(与 `dir` 无关)。
  - `status`:按 `STATUS_ORDER`(`src/renderer/status.ts`)的序号比较;未知状态序号视为 `STATUS_ORDER.length`(排末尾)。
  - `dir==='desc'` 时反转非 null 项的比较结果(null 仍在末尾)。

> `applySort` 从 `./status` 导入 `STATUS_ORDER`(纯数据,无副作用,不引入循环依赖)。

### 2.2 `src/renderer/components/MultiSelectMenu.tsx`(轻量复用组件)

供 3 个多选过滤器复用的小弹层:

- Props:`{ label: string; options: string[]; selected: string[]; onChange: (next: string[]) => void }`。
- 一个按钮显示 `label` + 选中计数角标(选中数 > 0 时);点击展开一个绝对定位的弹层,内含每个 option 的复选框;点击复选框 toggle。点击弹层外部关闭(监听 document mousedown)。
- 不依赖具体业务,纯字符串列表。

### 2.3 `src/renderer/components/TicketFilterBar.tsx`(过滤工具条)

- Props:`{ filter: TicketFilter; onChange: (f: TicketFilter) => void }`。
- 渲染于搜索框下方一行:
  - 状态多选 `MultiSelectMenu`(options = `STATUS_ORDER`)
  - 类型多选 `MultiSelectMenu`(options = `TYPE_OPTIONS`,来自 `../aftersale-options`)
  - 发货状态多选 `MultiSelectMenu`(options = `SHIPPING_OPTIONS`)
  - 申请时间:两个 `<input type="date">`(起、止)。`onChange` 时把起 → 当日 `00:00:00.000` 的 ms;止 → 当日 `23:59:59.999` 的 ms;清空输入 → `null`。
  - `[清除]` 按钮:`onChange(EMPTY_FILTER)`,**仅重置过滤,不动搜索框、不动排序**。仅当存在任一激活过滤时可点(否则禁用/隐藏)。
- 日期 ms 与 `<input type=date>` 字符串(`YYYY-MM-DD`)互转的小工具放在本组件内(或 `ticket-filter.ts` 暴露 `dayStartMs`/`dayEndMs`/`msToDateInput`,以便单测)。本 spec 选择放在 `ticket-filter.ts` 暴露并单测。

### 2.4 `src/renderer/components/TicketTable.tsx`(改造)

- 自持 `const [sort, setSort] = useState<Sort>(DEFAULT_SORT)`。
- 渲染前:`const sorted = applySort(tickets, sort)`,再 `paginate(sorted, current, pageSize)`。
- `申请时间`、`售后状态` 两个 `<th>` 改为可点击按钮:点击切换该列 `dir`(若当前不是该列则切到该列并用默认方向 desc;若已是该列则 asc↔desc 翻转),并显示升/降箭头;非激活列不显示箭头。
- 把现有 `useEffect(() => setPage(1), [query])` 改为 `useEffect(() => setPage(1), [tickets])`(列表引用变化即回到第 1 页:过滤、搜索、排序、重载都触发),并从 Props 移除 `query`(它原本只用于这个重置)。

> 移除 `query` prop:`TicketsView` 调用处同步删掉 `query={query}`。

### 2.5 `src/renderer/views/TicketsView.tsx`(接线)

- 新增 `const [filter, setFilter] = useState<TicketFilter>(EMPTY_FILTER)`。
- `const filtered = useMemo(() => applyFilter(tickets, filter), [tickets, filter])`。
- 在搜索框那一行的容器与表格容器之间,渲染 `<TicketFilterBar filter={filter} onChange={setFilter} />`(放在现有 `shrink-0 border-b ...` 搜索栏区块内或紧随其后的 `shrink-0` 区块)。
- 把传给 `TicketTable` 的 `tickets={tickets}` 改为 `tickets={filtered}`,删除 `query` prop。

---

## 3. 数据流

```
api.listTickets/searchTickets → tickets (内存全量/FTS结果)
  → applyFilter(tickets, filter)            [TicketsView useMemo]
  → applySort(filtered, sort)               [TicketTable 内部]
  → paginate(sorted, page, pageSize)        [TicketTable 内部]
  → 渲染当前页
```

表头显示的计数 = `filtered.length`(即 `TicketTable` 收到的 `tickets.length`),已反映过滤结果。

---

## 4. 错误处理 / 边界

- 纯函数无 IO,异常面小。
- 非法日期输入:组件转换得到 `null`,等同未设。
- 起 > 止:不特判,结果自然为空(可接受);不报错。
- 过滤后 0 条:沿用 `TicketTable` 现有"暂无售后单"空态(不新增文案,保持范围收敛)。
- `appliedAt` 为 null:排序时排末尾;设了日期区间时被过滤掉。

---

## 5. 测试策略

`tests/renderer/ticket-filter.test.ts`(node 项目,纯函数):

- `applyFilter`:
  - 空 filter → 原样返回(长度不变)。
  - 单 facet:状态多选、类型多选、发货状态多选各命中/不命中。
  - 多 facet 组合为 AND;同 facet 内为 OR。
  - 日期:仅起、仅止、起止区间(含边界 `>=` / `<=`);`appliedAt=null` 在设了区间时被排除。
- `applySort`:
  - `appliedAt` asc / desc;`null` 两种方向都在末尾。
  - `status` 按 `STATUS_ORDER`;未知状态排末尾。
  - 稳定性:相等键保持原相对顺序。
- 日期工具 `dayStartMs` / `dayEndMs` / `msToDateInput`:边界(00:00:00.000 / 23:59:59.999)、round-trip。

> `MultiSelectMenu` / `TicketFilterBar` / `TicketTable` 的交互不做 DOM 单测(项目现有渲染组件以手验为主),逻辑已全部下沉到 `ticket-filter.ts` 单测覆盖。

手验(dev):工具条三个多选 + 日期区间生效;`清除` 重置过滤但保留搜索词与排序;点 `申请时间`/`售后状态` 表头切换升降序且箭头正确;过滤/搜索/排序后页码回到第 1 页;默认进入按申请时间倒序。

---

## 6. 明确不做(YAGNI)

- 不做地区 / 收件人 / 金额等列的过滤(自由文本已由搜索框覆盖;金额区间暂无需求)。
- 不做"全部列可排序"(仅申请时间 + 状态)。
- 不持久化过滤/排序状态(切走再回来重置)。
- 不做服务端过滤/排序(数据量小,内存足够)。
- 不为空结果加单独文案。
