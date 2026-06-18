# 售后单申请时间分布条形图 — 设计文档

日期：2026-06-18

## 背景与目标

售后单列表页（`TicketsView`）需要增加一个**条形图**，按 **申请时间（`appliedAt`）** 展示当前筛选条件下的售后单分布。要求：

- 图表数据始终反映现有筛选条件（状态 / 类型 / 发货状态 / 申请时间范围）过滤后的结果。
- 支持自定义时间范围。
- 提供快捷范围：**今日、昨日、近 7 日、近 30 日、近 90 日**。
- UI / UX 与现有 terracotta/paper 设计语言一致（实现阶段用 frontend-design skill 打磨）。

## 整体思路与数据流

复用现有**前端聚合**架构，**不新增数据库查询**。`tickets:list` 已将全部售后单加载到 renderer，`ticket-filter.ts` 已在前端完成过滤。在过滤后的结果上按 `appliedAt` 做时间分桶聚合，喂给 ECharts（已集成，版本 6.x）。

```
tickets:list ──► 全量 tickets
                    │
        TicketFilter（状态/类型/发货状态/申请时间 range）
                    │
            filteredTickets ──┬──► TicketTable（表格，已有）
                              └──► bucketByAppliedTime() ──► AppliedTimeBarChart（新）
```

要点：

- 快捷范围（今日/昨日/近 7/30/90 日）= 设置 `appliedFrom` / `appliedTo`，表格和图表同时响应、完全联动。
- 没有 `appliedAt` 的售后单不计入图表（柱状只统计有申请时间的单）。
- 沿用现有 ECharts 集成方式（参照 `RegionBarChart` + `charts.ts` 的模式：mount 时 init、window resize 时 resize、unmount 时 dispose）。

## UI / UX 布局

位置：`TicketsView` 列表页内，筛选栏（`TicketFilterBar`）下方、表格（`TicketTable`）上方。做成**可折叠面板，默认展开**，避免长期占用列表竖向空间。

```
┌─ TicketFilterBar（已有：状态 / 类型 / 发货状态 / 申请时间）──────────┐
├─────────────────────────────────────────────────────────────────┤
│  申请时间分布                                          [▾ 收起]     │
│  ┌─ 快捷范围 ──────────────────────────────────────────────┐      │
│  │ [今日] [昨日] [近7日] [近30日] [近90日]   自定义 ▸ 📅 ──📅 │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                    │
│   12│            ▆                                                  │
│    8│   ▆    ▆   █    ▆                                            │
│    4│   █  ▆ █   █  ▆ █   ▆                                        │
│    0└───────────────────────────────────────  共 64 单 / 7 天      │
│      6/12 6/13 ...                                                  │
├─────────────────────────────────────────────────────────────────┤
│  TicketTable（表格，已有）                                          │
└─────────────────────────────────────────────────────────────────┘
```

- 快捷范围为一排 **chip 按钮**，当前选中态用主题色 `--accent`（terracotta）高亮。选中某快捷键时该 chip 高亮；手动修改自定义日期后，所有快捷 chip 取消高亮。
- "自定义"沿用现有 `DateFields`（react-day-picker）的双日期控件（即现有"申请时间"控件）；快捷 chip 与该控件写入同一份 `appliedFrom` / `appliedTo`。
- 图表右下角显示汇总：`共 N 单 / M 天（或 周 / 月，随粒度变化）`。
- 视觉/排版细节（间距、字号、chip 样式、空状态）在实现阶段用 frontend-design skill 打磨，保持与现有设计语言一致。

## 自适应时间粒度

根据所选范围天数决定分桶粒度：

| 范围天数 | 粒度 | 示例（柱子数） |
|---|---|---|
| ≤ 31 天 | 按天 | 今日 = 1；近 30 日 ≤ 31 |
| 32–180 天 | 按周（ISO 周，周一为起始） | 近 90 日 ≈ 13 |
| > 180 天 | 按月 | 多年 = 月数 |

- "全部（不限时间）"时，跨度 = 最早到最晚 `appliedAt`，按上表自动选粒度。
- X 轴标签随粒度变化：天 = `6/13`，周 = 该周起始日 `6/9`，月 = `2026-06`。
- 汇总行单位词跟随粒度（天 / 周 / 月）。
- 阈值（31 / 180 天）集中为常量，便于调整。

## 默认行为

- 页面首次加载默认选中 **今日**：`appliedFrom`/`appliedTo` 设为当天起止。
- 注意：因快捷范围与表格筛选联动，默认"今日"意味着进页面时**表格也只显示当天的售后单**。这是对现有列表默认行为的有意改变；默认值集中定义，便于后续一键调整。

## 要改 / 新增的文件

| 文件 | 改动 |
|---|---|
| `src/renderer/date-presets.ts` | **新增** —— `今日 / 昨日 / 近 7/30/90 日` → `{ from, to }`（epoch ms）计算，纯函数，可单测。 |
| `src/renderer/applied-time-buckets.ts` | **新增** —— 纯函数 `bucketByAppliedTime(tickets, from, to)`：粒度判定 + 分桶聚合，返回 `{ label, count, granularity }` 等，可单测。 |
| `src/renderer/charts.ts` | 新增 `appliedTimeBarOption(buckets)` ECharts 选项构建器（仿现有 `barOption`）。 |
| `src/renderer/components/AppliedTimeBarChart.tsx` | **新增** —— ECharts 柱状图组件（仿 `RegionBarChart` 的 init/resize/dispose 模式），含空状态。 |
| `src/renderer/components/TicketFilterBar.tsx` | 增加一排快捷 chip（写入 `appliedFrom`/`appliedTo`），选中态高亮逻辑。 |
| `src/renderer/views/TicketsView.tsx` | 嵌入可折叠图表面板；默认范围设为今日。 |

纯逻辑（预设计算、分桶聚合）抽成独立无副作用模块，便于 TDD 单测。

## 边界与测试

边界：

- **空数据**：过滤后 0 单 → 图表区显示空状态（"该范围内暂无售后单"），不绘制空轴。
- **全部无 `appliedAt`**：按空状态处理。
- **跨时区 / 日界**：沿用现有 `date-util.ts` 的 startOfDay / endOfDay（epoch ms），与现有筛选保持一致。

测试：

- 单测 `date-presets`：今日 / 昨日 / 近 N 日的边界（起止 epoch、日界）。
- 单测 `applied-time-buckets`：粒度切换阈值（31 / 180 天）、跨桶归并、`null` appliedAt 过滤、ISO 周起始、空输入。
- 手动验证：启动 app 观察图表随筛选条件与快捷键实时变化（参照 memory 中的 launch-verify 提醒：CJS named-import / 启动崩溃）。

## 技术约束

- React 19 + Electron + electron-vite，Tailwind 3 + 自定义 CSS 变量（terracotta/paper）。
- ECharts 6.x（已集成）。
- 不引入新依赖。
