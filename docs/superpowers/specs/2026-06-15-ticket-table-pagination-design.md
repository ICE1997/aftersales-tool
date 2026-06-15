# 售后单列表改为分页表格 — 设计文档

**日期**:2026-06-15
**状态**:已确认,待编写实现计划
**关联**:在已完成的 vhelper 上,把售后单列表从左侧卡片列表改为全宽分页表格,布局从主从改为"列表/详情"两态。视觉沿用既有设计系统并用 frontend-design 打磨。

---

## 1. 概述

将售后单的呈现从"左侧卡片列表 + 右侧详情(主从)"改为:
- **列表态**:全宽**分页表格**页;
- **详情态**:点表格某行进入该售后单的材料详情页,顶部「← 返回」回列表。

规模为百级,采用**前端分页**(一次取回全部、前端切片),不新增后端/IPC/repo。

---

## 2. 架构与数据流

### 2.1 视图两态(`src/renderer/App.tsx`)
- 新增 `view: 'list' | 'detail'` 状态(与现有 `selected`、`query` 等并存)。
- 列表态:全宽渲染 `TicketTable`;详情态:全宽渲染 `TicketDetail`。
- 移除现有 `<aside>` 左栏与 `TicketList` 组件(删除 `src/renderer/components/TicketList.tsx`)。
- 交互:
  - 行点击 → `setSelected(no); setView('detail')`。
  - `TicketDetail.onBack` → `setView('list')`。
  - `TicketDetail.onDeleted` → `setView('list')` + `load()`。
  - 新建成功(`createTicket`)→ 留在列表态并 `load()`(表格随之刷新)。

### 2.2 数据流(后端不变)
- 仍用 `api.listTickets()` / `api.searchTickets(q)`(返回全部)。`App` 持有过滤后的 `tickets: Ticket[]` 传给 `TicketTable`。
- 分页在 `TicketTable` 内部前端完成(对 `tickets` 按 `page`/`pageSize` 切片)。
- 不新增 IPC / repo 方法;`tickets`/`materials`/`Importer`/迁移 等均不改。

### 2.3 组件与纯函数
- 新增 `src/renderer/components/TicketTable.tsx`:props `{ tickets: Ticket[]; onOpen: (no: string) => void; onNew: () => void }`;内部 `page`、`pageSize` 状态。
- 新增 `src/renderer/table.ts`(纯函数,便于单测):
  - `paginate<T>(items: T[], page: number, pageSize: number): T[]` — 返回该页切片;`page` 从 1 起;越界(超过总页数)按最后一页处理;空数组返回 `[]`。
  - `formatTime(ms: number): string` — `YYYY-MM-DD HH:mm`(本地时间字段拼装,补零)。
- `src/renderer/components/TicketDetail.tsx`:新增 `onBack: () => void` prop,头部最左加「← 返回」按钮;其余不变。
- 删除 `src/renderer/components/TicketList.tsx` 及 `App` 中对它的 import/使用。

---

## 3. 表格 UI、视觉与分页

### 3.1 列
顺序:**售后单号 · 状态 · 订单号 · 发货单号 · 退货单号 · 更新时间**。
- 售后单号 / 订单号 / 发货单号 / 退货单号:等宽字体(`tnum`),空值显示「—」。
- 状态:彩色胶囊,复用 `src/renderer/status.ts` 的 `STATUS_META`(待处理/处理中/已解决)。
- 更新时间:`formatTime(updatedAt)`;表格默认按 `updatedAt` 倒序(数据已由 repo `ORDER BY updated_at DESC` 返回,表格不再二次排序)。
- 整行可点击进详情(行用 `<tr>` + `onClick`,`cursor-pointer`,hover 高亮;或行内首个单元格为按钮以保证键盘可达 —— 实现时保证可点击 + 基本可达即可)。

### 3.2 视觉(既有设计系统 + frontend-design 打磨)
- 表格置于圆角 `surface` 卡片(`rounded-xl2`、`border border-line`、`shadow-card`),外层留白(`p-6`)。
- 表头:小字号、大写字距(`uppercase tracking`)、`text-muted`,底部 1px 分隔;**`sticky` 吸顶**。
- 行:`border-b border-line` 细分隔、hover 暖色高亮(如 `hover:bg-paper-2`)、`transition`;首屏行轻微错位淡入(`animate-rise`,按行 index 加 `animation-delay`,封顶)。
- 表格上方工具条:左「售后单 N」标题,右「+ 新建售后单」(`btn-primary`,复用 `NewTicketDialog`)。
- 空状态:居中图标(`IconBox`)+「暂无售后单」。

### 3.3 分页(表格底部工具条)
- 每页条数下拉:**10 / 20 / 50,默认 20**。
- 「上一页 / 下一页」+ 页码 + 「共 N 条」。
- 仅一页时隐藏翻页控件(只显示「共 N 条」)。
- 改每页条数或搜索时回到第 1 页;当前页超出总页数时自动回退到最后一页(由 `paginate` 越界处理 + `page` 钳制)。

### 3.4 搜索联动
- 顶部搜索框照旧,输入即过滤(`App` 传入过滤后的数组)。
- `TicketTable` 在传入的 `tickets` 变化(或 `query` 变化)时重置到第 1 页 —— 用 `query` 作为 reset 依据(`App` 把当前 `query` 作为 `key` 或 prop 传入触发重置)。

---

## 4. 详情返回
- `TicketDetail` 头部最左「← 返回」按钮(`onBack`)。
- `App` 在 `view==='detail'` 渲染 `<TicketDetail aftersaleNo={selected} onBack={() => setView('list')} onChanged={() => load()} onDeleted={() => { setView('list'); load() }} />`。

---

## 5. 测试策略
- **纯函数(TDD)** `src/renderer/table.ts`:
  - `paginate`:25 条、pageSize 10 → 第 1 页 10 条、第 3 页 5 条;越界页(如第 9 页)回退到最后一页;空数组 → `[]`。
  - `formatTime`:对一个固定的本地时间(用 `new Date(year,month,day,hh,mm)` 构造的毫秒)断言输出 `YYYY-MM-DD HH:mm`(格式与补零),避免 UTC 时区漂移。
- **TicketTable 组件测试(jsdom)**:25 条 + pageSize 10 → 首页 10 行 + 「共 25 条」;点「下一页」→ 显示第 11–20 行;点某行 → `onOpen` 收到该行 `aftersaleNo`;切到每页 50 → 一页显示完且翻页按钮隐藏。
- **既有测试不回归**:`TicketDetail` 新增 `onBack` 不破坏现有渲染;删除 `TicketList` 无测试引用。
- **dev 手验**:列表↔详情切换、分页(上一页/下一页/页码/每页条数)、搜索过滤 + 分页联动、新建后回列表刷新、删除回列表、返回按钮。

---

## 6. 明确不做(YAGNI)
- 不做后端分页(LIMIT/OFFSET)。
- 不做点击列排序、列宽拖拽、多选批量操作、行内编辑。
- 不改动材料详情/导入/导出/粘贴/缩略图/迁移等既有功能。
