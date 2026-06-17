# 搜索覆盖全部文本字段(扩展 FTS5)设计文档

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:售后单搜索走 FTS5(`tickets_fts`),当前仅索引 11 列。用户希望"所有(文本)字段都能查询"。本 spec 把缺失的 5 个文本字段加入 FTS 索引。数值/日期字段仍由过滤器处理,不进全文。

---

## 1. 概述

`tickets_fts` 当前索引:`aftersale_no, order_no, shipping_no, return_no, note, recipient_name, phone, province, city, district, address_detail`(11 列)。

新增 5 个文本列:`extension, aftersale_type, aftersale_reason, shipping_status, return_logistics`(分机号 / 售后类型 / 售后原因 / 发货状态 / 退货物流状态)。

`search()` 用 `tickets_fts MATCH ?` 检索全部 FTS 列 —— 只要把这 5 列加入索引,搜索即自动覆盖,**search 查询逻辑不改**。

---

## 2. 架构

### 2.1 新迁移 `0002_fts_expand`(`src/main/db/migrations.ts`)

在 `MIGRATIONS` 数组追加一条(`CodeMigrationSource` 按 name 排序,`0002` 在 `0001` 之后):

```ts
{ name: '0002_fts_expand', up: async (knex) => {
  await knex.raw('DROP TABLE IF EXISTS tickets_fts')
  await knex.raw(`CREATE VIRTUAL TABLE tickets_fts USING fts5(
     aftersale_no, order_no, shipping_no, return_no, note,
     recipient_name, phone, province, city, district, address_detail,
     extension, aftersale_type, aftersale_reason, shipping_status, return_logistics,
     content='tickets', content_rowid='rowid'
   )`)
  await knex.raw(`INSERT INTO tickets_fts(tickets_fts) VALUES('rebuild')`)
}}
```

- `'rebuild'`:FTS5 外部内容表(`content='tickets'`)的标准重建命令,从 `tickets` 回填索引(覆盖现有数据)。
- FTS 列名均为 `tickets` 真实列,外部内容按列名映射,`rebuild` 可正确取值。
- **不改 `0001_baseline`**:已应用的库不会重跑 baseline;新库 baseline 建 11 列后 `0002` 重建为 16 列(一次性、安全);老库直接 `0002` 扩展。最终所有库一致为 16 列。

### 2.2 `TicketRepo`(`src/main/db/tickets.ts`)

列顺序必须与迁移 CREATE 一致(原 11 列 + 新 5 列)。

1. `FTS_COLS` 改为:
```ts
const FTS_COLS = 'aftersale_no, order_no, shipping_no, return_no, note, recipient_name, phone, province, city, district, address_detail, extension, aftersale_type, aftersale_reason, shipping_status, return_logistics'
```
2. `FtsRow` 接口追加 5 个 string 字段:`extension; aftersale_type; aftersale_reason; shipping_status; return_logistics`。
3. `ftsDelete`:
   - `.select(...)` 列表追加 `'extension', 'aftersale_type', 'aftersale_reason', 'shipping_status', 'return_logistics'`。
   - `VALUES('delete', ?, …)` 占位符从 12 个 `?` 增到 17 个(`'delete'` + rowid + 16 列)。
   - 绑定数组追加 `row.extension, row.aftersale_type, row.aftersale_reason, row.shipping_status, row.return_logistics`。
4. `ftsInsert`、`search` 不改(均基于 `FTS_COLS` / `MATCH`)。

### 2.3 `SearchBar`(`src/renderer/components/SearchBar.tsx`)

占位符文案更新以反映更广覆盖(纯文案,无逻辑):
`搜索 售后单号 / 订单号 / 快递单号 / 收货人 / 手机号 / 售后类型 / 物流状态 等`

---

## 3. 数据流(不变)

```
搜索框 → api.searchTickets(q) → tickets:search → TicketRepo.search(q)
  → SELECT … FROM tickets_fts MATCH ? JOIN tickets …  (现覆盖 16 列)
```

---

## 4. 错误处理 / 边界

- **迁移幂等/安全**:`DROP IF EXISTS` + `CREATE` + `rebuild`;失败时迁移框架已有"迁移前备份"。
- **列顺序一致**:迁移 CREATE、`FTS_COLS`、`ftsDelete` 三处列顺序必须一致,否则 `'delete'` 命令错配。本 spec 固定为"原 11 + 新 5"。
- **数值/日期不进 FTS**:`amount/refundAmount/appliedAt` 仍由过滤器覆盖(YAGNI,匹配体验不稳定)。
- **空查询**:`search('')` 仍回退 `list()`(不变)。

---

## 5. 测试策略

- `tests/db/tickets.test.ts`:
  - 新建一条带 `aftersaleType:'退货退款'`、`extension:'0106'`、`returnLogistics:'签收'` 的单,断言 `search('退货退款')`、`search('0106')`、`search('签收')` 均命中该单。
  - 回归:原有按 收件人/订单号/手机号 搜索用例仍通过。
- `tests/db/migrations` 或 `database.test`:断言 `tickets_fts` 列含新 5 列 —— `(await db.raw('PRAGMA table_info(tickets_fts)')).map(c=>c.name)` 包含 `extension, aftersale_type, aftersale_reason, shipping_status, return_logistics`。
- 全套 `npx vitest run` 0 失败(跑前 `npm run rebuild:node`;db 测试经 `createDatabase` 自动跑 0001+0002)。
- 手验:搜索"退货退款"/"签收"/分机号等能命中。

---

## 6. 明确不做(YAGNI)

- 不索引数值/日期字段(金额/申请时间)。
- 不改 `search()` 查询逻辑、不改过滤器、不改渲染层(除占位符文案)。
- 不改 `0001_baseline`。
- 不做按字段限定搜索(`field:value` 语法)——仍是跨全部 FTS 列的统一前缀匹配。
