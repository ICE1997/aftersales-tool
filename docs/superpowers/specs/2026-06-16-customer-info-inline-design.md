# 客户信息内嵌售后单 + 派生客户视图 设计文档

**日期**:2026-06-16
**状态**:已确认,待编写实现计划
**关联**:重构既有「客户模块」(阶段一的独立客户表 + 手动关联 + CustomerPicker/CustomerDialog)。动机:手动关联不实用;改为在创建售后单时直接填写客户信息。客户的「名称」字段拆为更具体的 收货人姓名 / 手机号 / 联系地址。

---

## 1. 概述

把客户信息从「独立实体 + 手动关联」改为「内嵌在售后单上的字段」,在**创建/编辑售后单时直接填写**。客户字段为:**昵称、收货人姓名、手机号、联系地址(结构化 省/市/区县 + 详细地址)**。

「客户」标签页保留,但变为**只读的派生视图**:按 `nickname` 对售后单聚合,展示某买家的复诉次数与地区分布。**不再有 customers 表、customer_id 外键、关联/选择/客户增删改**。

统计页(退货地区地图 + 排行柱状图)的地区数据改为直接来自售后单自带的地区列(不再 JOIN customers),行为不变。全文搜索扩展为可按买家信息检索售后单。

口径:以 `nickname` 作为「客户」聚合键;昵称为空的售后单不计入客户聚合(但仍按其地区计入统计)。

---

## 2. 数据模型与迁移

### 2.1 共享类型(`src/shared/types.ts`)

`NewTicket` 与 `Ticket` 新增内嵌客户字段:

```ts
export interface NewTicket {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  note: string
  // 内嵌客户信息(均选填)
  nickname: string
  recipientName: string
  phone: string
  provinceCode: string
  province: string
  cityCode: string
  city: string
  districtCode: string
  district: string
  addressDetail: string
}

export interface Ticket extends NewTicket {
  status: TicketStatus
  createdAt: number
  updatedAt: number
}
```

**移除**:`Ticket.customerId`、`Customer`、`NewCustomer`、`CustomerRow` 类型。

**新增**派生聚合类型:

```ts
export interface CustomerSummary {
  nickname: string
  ticketCount: number   // 复诉次数 = 该昵称的售后单数
  recipientName: string // 代表值:取该昵称最近更新售后单
  phone: string
  province: string
  city: string
  district: string
  lastUpdatedAt: number
}
```

`RegionLevel` / `RegionCount` / `StatsSummary` 不变。

### 2.2 表结构(`src/main/db/database.ts`)

`migrate(db)` 内对 `tickets` 表用现有 `ensureColumn` 追加列(TEXT,`DEFAULT ''`):
`nickname, recipient_name, phone, province_code, province, city_code, city, district_code, district, address_detail`。

### 2.3 一次性迁移(回填 + 拆除旧结构)

在 `migrate(db)` 中,**仅当 `customers` 表仍存在**时执行(用 `sqlite_master` 判断,保证幂等、可重复运行安全):

1. 回填:对所有 `customer_id IS NOT NULL` 的售后单,从 `customers` 拷贝到 ticket 自身列:
   `nickname←customers.nickname`、`recipient_name←customers.name`、
   `province_code/province/city_code/city/district_code/district/address_detail←同名列`;`phone` 保持 `''`(旧模型无手机号)。
   SQL(单条 UPDATE…FROM 或带子查询的 UPDATE)。
2. `DROP INDEX IF EXISTS idx_tickets_customer`。
3. `DROP TABLE customers`。
4. `ALTER TABLE tickets DROP COLUMN customer_id`(better-sqlite3 内置 SQLite ≥3.35 支持 DROP COLUMN;tickets_fts 为外部内容表且不索引该列,删除安全)。

迁移后再次运行:`customers` 表已不存在 → 跳过,幂等。

### 2.4 全文索引(FTS5,`tickets_fts`)

`tickets_fts` 当前为 external-content 表,索引售后单号/订单号/发货/退货号。本次**重建** FTS schema,纳入买家字段,使搜索覆盖买家信息:

列集合:`aftersale_no, order_no, shipping_no, return_no, nickname, recipient_name, phone, province, city, district, address_detail`。

实现:`DROP TABLE IF EXISTS tickets_fts` → 按新列重建 → 从 `tickets` 全量重填(`INSERT INTO tickets_fts(rowid, …) SELECT …`)。`TicketRepo` 的 `ftsInsert`/`ftsDelete` 同步改为写入/删除全部新列(沿用既有 external-content 的 `VALUES('delete', …)` 删除语法)。

> 重建判定(幂等,避免每次启动重复重建):用 `PRAGMA table_info(tickets_fts)` 取现有列名集合,若不包含 `nickname`(代表新 schema 尚未应用)则执行重建,否则跳过。

---

## 3. 后端仓库与 IPC

### 3.1 TicketRepo(`src/main/db/tickets.ts`)
- `ROW`/`create`/`update` 纳入新列;`update` 的 patch 类型扩展为可改 `nickname/recipientName/phone/省市区/addressDetail`(以及原有 orderNo/shippingNo/returnNo/status/note)。
- 移除 `setCustomer`。
- FTS 同步包含新列。

### 3.2 CustomerRepo(`src/main/db/customers.ts`,改为只读聚合)
不再增删改;改为对 `tickets` 的只读查询:
- `listByNickname(): CustomerSummary[]`:
  ```sql
  SELECT nickname,
         COUNT(*) AS ticketCount,
         MAX(updated_at) AS lastUpdatedAt
    FROM tickets WHERE nickname != ''
   GROUP BY nickname
   ORDER BY ticketCount DESC, lastUpdatedAt DESC
  ```
  代表值(recipientName/phone/province/city/district)取该昵称 `updated_at` 最大的那条售后单(用关联子查询或窗口函数取 latest row;实现计划给出具体 SQL)。
- `search(q)`:对上面结果按 昵称/收货人/手机号 过滤(LIKE,转义 `% _ \`,沿用既有转义方式)。
- `ticketsOfNickname(nickname): Ticket[]`:`SELECT … FROM tickets WHERE nickname = ? ORDER BY updated_at DESC`。

### 3.3 StatsRepo(`src/main/db/stats.ts`,改为查 tickets)
- `regionCounts(level)`:直接对 `tickets` 聚合(列名固定映射防注入,沿用现有做法):
  ```sql
  SELECT <level>_code AS code, <level> AS name, COUNT(*) AS count
    FROM tickets WHERE <level>_code != ''
   GROUP BY <level>_code, <level>
   ORDER BY count DESC, name ASC
  ```
- `summary()`:`total = COUNT(*) FROM tickets`;`classified = COUNT(*) WHERE province_code != ''`;`unclassified = total - classified`。
- 移除对 customers 的 JOIN。

### 3.4 IPC / preload(`src/main/ipc.ts`, `src/preload/index.ts`)
- 移除:`tickets:setCustomer`、`customers:create/update/delete/get`、`customers:ticketsOf`(关联式)。
- 客户相关改为:`customers:list`(→ listByNickname)、`customers:search`、`customers:ticketsOf`(→ ticketsOfNickname,入参由 id 改为 nickname)。
- preload `api` 同步调整方法签名;`Api = typeof api` 自动生效。

---

## 4. 界面与交互

### 4.1 可复用地区级联选择器 `RegionCascader`(`src/renderer/components/RegionCascader.tsx`)
把现有(内置于 CustomerDialog 的)省/市/区县级联选择抽成独立组件:
props `{ value: {provinceCode,province,cityCode,city,districtCode,district}, onChange }`。供「新建售后单」与「详情编辑」复用。底层数据沿用已打包的 `china-divisions.json` 与现有 `region.ts` 纯函数。

### 4.2 新建售后单弹窗(`NewTicketDialog`)
在售后单号/订单号/快递单号字段下方新增「客户信息」分区:**昵称、收货人姓名、手机号、`RegionCascader`、详细地址**。均选填。提交时一并写入 `NewTicket`。

### 4.3 详情页「基本信息」栏(`TicketDetail`)
- 展示:昵称 / 收货人姓名 / 手机号 / 地区(省市区拼接) / 详细地址,以及原有 订单号 / 发货快递单号 / 退货快递单号。
- 现有「编辑/保存」内联开关扩展为同时编辑上述客户字段(地址用 `RegionCascader`)。
- 移除原「客户 关联/更换/取消关联」行与 `CustomerPicker` 的使用。

### 4.4 「客户」标签页(只读派生)
- `CustomersView` + `CustomerTable`:列表展示 昵称 / 收货人 / 手机号 / 地区 / 售后单数(复诉),支持搜索(按 昵称/收货人/手机号)。
- `CustomerDetail`:点击某昵称 → 展示其代表信息(收货人/手机号/地区)+ 该昵称的售后单列表;点击售后单跳转到详情(沿用 App 的 `jumpTicket`)。
- **删除**:`CustomerDialog`(新建/编辑客户)、`CustomerPicker`(关联)。

### 4.5 搜索框(`SearchBar`)
占位符更新为可按买家信息检索(如「搜索 售后单号 / 订单号 / 快递单号 / 昵称 / 收货人 / 手机号」)。

---

## 5. 测试策略

- **TicketRepo(TDD)**:create/get/update 含新客户字段;FTS 搜索命中 昵称/收货人/手机号/详细地址/地区名。
- **迁移**:构造「带 customers 表 + 关联售后单」的旧库,运行 `migrate`,断言字段已回填到 ticket、customers 表与 customer_id 列已移除;再次运行 `migrate` 幂等不报错。
- **CustomerRepo(只读聚合)**:`listByNickname` 返回每昵称的 售后单数 与「最近售后单」的代表值,按 count 降序;`ticketsOfNickname` 返回该昵称全部售后单;`search` 转义 `%`/`_` 不误匹配。
- **StatsRepo**:`regionCounts` 改为直接查 tickets 的地区列;`summary` 的 total/classified/unclassified。
- **RegionCascader**:沿用既有 `region.ts` 纯函数测试(`childrenOf`/`regionLabel` 等),不新增渲染单测。
- **手验**:新建售后单填客户信息 → 详情/客户页/统计地图一致;编辑售后单客户字段后客户聚合与地图更新;搜索昵称/手机号命中。

---

## 6. 明确不做(YAGNI)

- 不做客户的独立增删改(客户为派生只读)。
- 不做按手机号/收货人聚合(聚合键固定为昵称)。
- 不做跨售后单的客户信息「统一编辑」(各售后单各存一份,代表值取最近)。
- 不改售后单号(主键,关联材料目录)、不改材料/导出等既有功能。
- 不做地址自由文本解析成省市区(地址走结构化级联)。
