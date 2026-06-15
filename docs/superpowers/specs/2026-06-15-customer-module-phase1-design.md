# 投诉客户信息模块 — 阶段一(客户 + 地址 + 售后单关联)设计文档

**日期**:2026-06-15
**状态**:已确认,待编写实现计划
**关联**:在已完成的 vhelper 上新增"投诉客户信息管理"模块。整体分两阶段——**阶段一(本文):客户实体 + 结构化地址 + 与售后单关联 + 客户管理 UI**;阶段二(后续单独 spec):图表统计 + 地图可视化。

---

## 1. 概述

新增独立的"客户"模块:记录客户**昵称、姓名、结构化地址(省/市/区县 + 详细地址)**;客户与售后单**一对多、可选关联**;顶部「售后单 / 客户」视图切换,客户为独立分页表格页(列表/详情/新建/编辑)。结构化地址为阶段二(按区域聚合的图表 + 地图)打基础。

---

## 2. 数据模型与主进程

### 2.1 schema(SQLite,沿用 `ensureColumn` 迁移)
新增 `customers` 表:
```
id            INTEGER PRIMARY KEY AUTOINCREMENT
nickname      TEXT NOT NULL DEFAULT ''
name          TEXT NOT NULL DEFAULT ''
province_code TEXT NOT NULL DEFAULT ''
province      TEXT NOT NULL DEFAULT ''
city_code     TEXT NOT NULL DEFAULT ''
city          TEXT NOT NULL DEFAULT ''
district_code TEXT NOT NULL DEFAULT ''
district      TEXT NOT NULL DEFAULT ''
address_detail TEXT NOT NULL DEFAULT ''
created_at    INTEGER NOT NULL
updated_at    INTEGER NOT NULL
```
`tickets` 表**新增可空列**:
```
customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL
```
- 同时存 `*_code` 与名称:名称用于展示,编码用于阶段二精确聚合/地图 join。
- 迁移:`migrate()` 中 `CREATE TABLE IF NOT EXISTS customers ...`;`ensureColumn(db, 'tickets', 'customer_id', 'customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL')`(新库建表也含该列)。
  - 注意:SQLite 对**已存在表**用 `ALTER TABLE ADD COLUMN` 添加带 `REFERENCES` 的列是允许的(外键在该表后续操作时才检查);`ON DELETE SET NULL` 依赖 `PRAGMA foreign_keys=ON`(已开启)。

### 2.2 行政区数据集(级联选择器)
- 打包一份成熟开源的**中国省/市/区县数据集**(例如 npm `china-division` 提供的 province/city/area 数据,含 `code`/`name`/`parent`),作为**渲染层静态资源直接 import**(无需 IPC、无需联网)。
- 渲染层据它构建级联选项;选定后把 `code` + `name` 三级一起写入客户记录。
- 抽纯函数便于单测:`childrenOf(parentCode?): {code,name}[]`(顶层返回省份)、`regionLabel({province,city,district}): string`(合并展示,如「广东 · 深圳 · 南山区」,空段省略)。

### 2.3 仓储 / IPC
- 新增 `src/main/db/customers.ts` 的 `CustomerRepo`(单一职责,与 `tickets.ts` 平行):
  - `create(NewCustomer): number`、`get(id)`、`update(id, patch)`、`delete(id)`、`search(q): CustomerRow[]`(昵称/姓名/省市区/详细地址 LIKE)、`list(): CustomerRow[]`(带 `ticketCount` 子查询,按 `updated_at DESC`)、`ticketsOf(id): Ticket[]`。
- `TicketRepo`:查询投影补 `customer_id AS customerId`;新增 `setCustomer(aftersaleNo, customerId | null)`(更新 `customer_id` + `updated_at`,并同步 FTS 行不变——FTS 不含 customer)。
- 新增 IPC + preload:`customers:list/search/get/create/update/delete`、`customers:ticketsOf`、`tickets:setCustomer`。
- 共享类型(`src/shared/types.ts`):
```ts
export interface Customer {
  id: number; nickname: string; name: string
  provinceCode: string; province: string
  cityCode: string; city: string
  districtCode: string; district: string
  addressDetail: string
  createdAt: number; updatedAt: number
}
export type NewCustomer = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>
export interface CustomerRow extends Customer { ticketCount: number }
```
  `Ticket` 增加 `customerId: number | null`。

---

## 3. 界面与交互

### 3.1 顶部模块切换 + App 重构
- 顶栏:品牌 + **分段切换「售后单 / 客户」** + 设置。**搜索框移入各模块**(售后单搜索 / 客户搜索),不再全局共用。
- 把现有售后单列表/详情逻辑抽为 `TicketsView`,新增 `CustomersView`;`App` 成为外壳(头部 tabs + 当前模块 + `SettingsDialog`)。两模块各自维护搜索/分页/选中。
- App 提供跨模块跳转回调:从客户详情点某关联售后单 → 切到「售后单」tab 并打开该单详情。

### 3.2 客户列表页 `CustomerTable`(复用 `paginate`/`formatTime` 与表格风格)
- 列:**昵称 · 姓名 · 地区(`regionLabel`)· 关联售后单数 · 更新时间**。
- 顶部「客户 N」+「+ 新建客户」;行点击 → 客户详情;分页 10/20/50(默认 20),搜索重置到第 1 页。空状态「暂无客户」。

### 3.3 客户详情 `CustomerDetail`
- 展示 昵称 / 姓名 / 完整地址(`regionLabel` + 详细地址);「编辑」(打开表单弹窗)、「← 返回」、「删除」(确认后删,关联售后单 `customer_id` 置空)。
- 下方列出该客户**关联售后单**(售后单号 / 状态胶囊 / 更新时间);点某条 → 跨模块跳转打开该售后单详情。

### 3.4 客户表单弹窗 `CustomerDialog`(新建/编辑)
- 字段:昵称、姓名、**省/市/区县级联**(三个联动 `<select>`,数据来自内置数据集;改省清空市/区,改市清空区)、详细地址文本。
- 校验:昵称与姓名**至少填一个**;地址可全空。保存 → `customers:create` / `customers:update`。

### 3.5 售后单关联客户(`TicketDetail`)
- 详情头部新增「客户」行:显示已关联客户姓名/昵称(或「未关联」)+「关联 / 更换」→ 打开**客户选择弹窗**(搜索现有客户列表 + 「新建客户」入口);选中即 `tickets:setCustomer(aftersaleNo, id)`;另有「取消关联」(`setCustomer(no, null)`)。
- 新建售后单对话框本期不加客户选择(创建后在详情关联)。

---

## 4. 校验与错误处理
- 客户表单:昵称/姓名至少一个非空(否则禁用保存);级联按省→市→区依赖,改上级清空下级。
- 删除客户:确认后删除;`ON DELETE SET NULL` 使关联售后单自动解除关联(不删单)。
- 关联弹窗:选中即写入;支持取消关联。
- 售后单详情读取关联客户:若 `customerId` 指向已删客户(理论上已被 SET NULL),按「未关联」处理。

---

## 5. 测试策略
- **CustomerRepo(TDD)**:create→get round-trip(含地址各字段);`update`/`delete`;`list` 的 `ticketCount` 子查询正确(建 ticket 关联后计数为 1);`search` 命中昵称/姓名/地址;`delete` 后被关联 ticket 的 `customerId` 变 `null`。
- **TicketRepo**:`setCustomer(no, id)` 写入、`setCustomer(no, null)` 清空;查询投影返回 `customerId`。
- **迁移**:新库 `createDatabase` 含 `customers` 表与 `tickets.customer_id`;旧库(无 `customer_id`)经迁移补列(沿用既有 `ensureColumn` 测试范式)。
- **纯函数**:`childrenOf`(顶层=省列表;给省 code 返回其市;给市 code 返回其区)、`regionLabel`(全字段、部分空、全空)。
- **组件(jsdom 轻量)**:`CustomerTable` 分页/行点击;`CustomerDialog` 级联(选省后市选项变化、改省清空市/区、保存以正确 `NewCustomer` 调用);客户选择弹窗搜索+选中回调。
- **dev 手验**:tab 切换、新建/编辑客户(级联地址)、客户分页/搜索、客户详情看关联售后单并跳转、售后单详情关联/更换/取消客户、删除客户后单解除关联。

---

## 6. 明确不做(YAGNI / 阶段二)
- 不做图表、地图(阶段二单独 spec)。
- 客户字段仅 昵称/姓名/结构化地址(不加电话/邮箱)。
- 不做客户去重/合并、批量导入。
- 新建售后单对话框不加客户选择。
- 不提供编辑行政区数据集。
