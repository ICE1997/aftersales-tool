# 区域统计(阶段二·2a:聚合 + 统计页 + 排行图表)设计文档

**日期**:2026-06-16
**状态**:已确认,待编写实现计划
**关联**:阶段二("图表 + 退货地图")拆为两步。本文是 **2a:聚合查询 + 统计页 + 按 省/市/区县 的排行柱状图(ECharts)**。**2b(中国地图下钻着色)** 为后续独立 spec。依赖阶段一(客户 + 结构化地址 + ticket.customer_id)。

---

## 1. 概述

新增"统计"模块:把售后单按其关联客户的 **省/市/区县** 聚合计数,在新的「统计」tab 用 **ECharts 横向柱状图** 展示各级别"售后单最多的地区 Top 20",并显示总量/已归类/未归类汇总。口径:**所有"关联了带地址客户"的售后单都计入**(不区分是否退货);无客户或无该级地址的单不计入对应级别。

---

## 2. 聚合后端与数据流

### 2.1 StatsRepo(`src/main/db/stats.ts`,只读聚合)
```ts
import type { Database } from 'better-sqlite3'
import type { RegionCount, RegionLevel, StatsSummary } from '../../shared/types'

export class StatsRepo {
  constructor(private db: Database) {}
  regionCounts(level: RegionLevel): RegionCount[] { /* group by <level>_code,<level> where code!='' */ }
  summary(): StatsSummary { /* total / classified / unclassified */ }
}
```
- `regionCounts(level)`:`level ∈ 'province'|'city'|'district'`,映射到列 `province_code/province`、`city_code/city`、`district_code/district`(列名由固定映射决定,不接受任意字符串——避免 SQL 注入)。SQL:
  ```sql
  SELECT c.<level>_code AS code, c.<level> AS name, COUNT(*) AS count
  FROM tickets t JOIN customers c ON t.customer_id = c.id
  WHERE c.<level>_code != ''
  GROUP BY c.<level>_code, c.<level>
  ORDER BY count DESC, name ASC
  ```
- `summary()`:
  - `total` = `SELECT COUNT(*) FROM tickets`
  - `classified` = `SELECT COUNT(*) FROM tickets t JOIN customers c ON t.customer_id = c.id WHERE c.province_code != ''`
  - `unclassified = total - classified`

### 2.2 共享类型(`src/shared/types.ts`)
```ts
export type RegionLevel = 'province' | 'city' | 'district'
export interface RegionCount { code: string; name: string; count: number }
export interface StatsSummary { total: number; classified: number; unclassified: number }
```

### 2.3 IPC / preload
- 主进程:`registerIpc` 构造 `const statsRepo = new StatsRepo(db)`;
  - `ipcMain.handle('stats:regionCounts', (_e, level: RegionLevel) => statsRepo.regionCounts(level))`
  - `ipcMain.handle('stats:summary', () => statsRepo.summary())`
- preload:`regionCounts: (level) => invoke('stats:regionCounts', level)`、`statsSummary: () => invoke('stats:summary')`。

### 2.4 依赖
- 新增 `echarts`(渲染层),tree-shake 引入:`echarts/core` + `BarChart` + `GridComponent` + `TooltipComponent` + `CanvasRenderer`(2b 再加 `MapChart`/`VisualMapComponent`)。

---

## 3. 界面与交互

### 3.1 顶部 tab
`App` 的 `tab` 扩展为 `'tickets' | 'customers' | 'stats'`,nav 增加「统计」,渲染 `StatsView`。

### 3.2 `StatsView`(`src/renderer/views/StatsView.tsx`)
- 顶部行:**级别分段切换**「省 / 市 / 区县」(默认 `province`)+ 右侧汇总「共 {total} 单 · 已归类 {classified} · 未归类 {unclassified}」。
- 主体:`RegionBarChart`,放圆角 `surface` 卡片 + `shadow-card`;为空显示「暂无可统计的数据(请先给售后单关联带地址的客户)」。
- 进页 `useEffect`:取 `statsSummary()` 一次 + `regionCounts('province')`;切换级别 → 重新取 `regionCounts(level)`。

### 3.3 `RegionBarChart`(`src/renderer/components/RegionBarChart.tsx`,封装 ECharts)
- props:`{ data: RegionCount[] }`。
- `useEffect`:`echarts.init(ref)` → `setOption(barOption(data))`;监听 window `resize` → `chart.resize()`;卸载 `dispose()`;`data` 变化 → `setOption`。
- 纯函数 `barOption(data: RegionCount[])`(同文件导出,便于单测):取 **Top 20**(已降序的取前 20)、横向条形(yAxis = 地区名 category,xAxis = value),陶土主色,数值标签。

### 3.4 视觉
沿用既有设计系统(暖纸底、陶土主色作条形、等宽数值);卡片留白与现有表格一致。

---

## 4. 测试策略
- **StatsRepo(TDD)**:
  - `regionCounts('province')`:多客户(广东×2、浙江×1 等)+ 关联售后单,断言按省计数且 `count DESC`;无 customer 或 `province_code=''` 的单不计入;`city`/`district` 同理(只计有该级 code 的)。
  - `summary()`:total=全部单;classified=关联了 `province_code!=''` 客户的单;unclassified=差值。
- **纯函数 `barOption(data)`**:Top 20 截断、保持降序、option 含类目轴(地区名)与 series 数值数组。
- **不**对 `RegionBarChart` 做渲染单测(echarts 需 canvas,jsdom 不支持)——靠 `barOption` 单测 + dev 手验。
- **StatsView**(可选):`vi.mock('../components/RegionBarChart')` + mock `api`,验证切换级别调用 `regionCounts(level)`、汇总文字渲染;成本高则并入 dev 手验。
- **dev 手验**:统计 tab、省/市/区县切换、汇总数字、Top 排行条形、空状态;造数据核对计数与未归类。

---

## 5. 明确不做(YAGNI / 2b)
- 不做地图(2b 独立 spec)。
- 不做时间范围/状态筛选、图表导出、条形下钻。
- Top N 固定 20,不可配置。
- 不改动既有售后单/客户/材料功能。
