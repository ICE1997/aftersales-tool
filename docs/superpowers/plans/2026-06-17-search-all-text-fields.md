# 搜索覆盖全部文本字段(扩展 FTS5)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 分机号/售后类型/售后原因/发货状态/退货物流状态 加入 `tickets_fts`,使搜索覆盖全部文本字段。

**Architecture:** 新迁移 `0002_fts_expand`(drop+create 16 列 FTS + `'rebuild'` 回填);`TicketRepo` 同步 `FTS_COLS`/`FtsRow`/`ftsDelete`;`search()` 不变(`MATCH` 自动覆盖)。

**Tech Stack:** Knex(client better-sqlite3)、FTS5、Vitest。

**ABI 提示:** 跑 vitest 前 `npm run rebuild:node`;若报 knex 嵌套 better-sqlite3 缺 build,`rm -rf node_modules/knex/node_modules/better-sqlite3` 再跑。

---

## File Structure
- **Modify:** `src/main/db/migrations.ts`(加 0002)、`src/main/db/tickets.ts`(FTS 列扩展)、`src/renderer/components/SearchBar.tsx`(占位符)、`tests/db/tickets.test.ts`(搜新字段)、`tests/db/database.test.ts`(断言 FTS 列)。

---

## Task 1: 扩展 FTS(迁移 + 仓库 + 测试)

**Files:** Modify `src/main/db/migrations.ts`, `src/main/db/tickets.ts`, `tests/db/tickets.test.ts`, `tests/db/database.test.ts`

- [ ] **Step 1: 写失败测试**

(a) 在 `tests/db/tickets.test.ts` 增加(用例放进现有 describe;`db`/`repo`/`makeTempDb` 等沿用文件现有写法,repo 方法记得 `await`):
```ts
  it('search matches the newly indexed text fields', async () => {
    await repo.create({
      aftersaleNo: 'FTS-1', orderNo: '', shippingNo: '', returnNo: '', note: '',
      aftersaleType: '退货退款', aftersaleReason: '质量问题', shippingStatus: '已发货',
      returnLogistics: '签收', extension: '0106'
    } as any)
    expect((await repo.search('退货退款')).map((t) => t.aftersaleNo)).toContain('FTS-1')
    expect((await repo.search('0106')).map((t) => t.aftersaleNo)).toContain('FTS-1')
    expect((await repo.search('签收')).map((t) => t.aftersaleNo)).toContain('FTS-1')
    expect((await repo.search('质量问题')).map((t) => t.aftersaleNo)).toContain('FTS-1')
  })
```
> 若该测试文件构造 ticket 的方式是先有一个 `mk(...)` 工厂,请改用工厂 + 覆盖这些字段,保持与文件风格一致;关键是新建的单带上 `aftersaleType/extension/returnLogistics/aftersaleReason`。

(b) 在 `tests/db/database.test.ts` 增加:
```ts
  it('tickets_fts indexes the expanded text columns', async () => {
    const cols = ((await db.raw('PRAGMA table_info(tickets_fts)')) as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['extension', 'aftersale_type', 'aftersale_reason', 'shipping_status', 'return_logistics']))
  })
```
Run: `npm run rebuild:node && npx vitest run tests/db/tickets.test.ts tests/db/database.test.ts` → 新用例 FAIL(FTS 尚未含新列)。

- [ ] **Step 2: 加迁移 `0002_fts_expand`** — `src/main/db/migrations.ts`,把 `MIGRATIONS` 改为:
```ts
export const MIGRATIONS: CodeMigration[] = [
  { name: '0001_baseline', up: async (knex) => { for (const s of BASELINE_STATEMENTS) await knex.raw(s) } },
  { name: '0002_fts_expand', up: async (knex) => {
    await knex.raw('DROP TABLE IF EXISTS tickets_fts')
    await knex.raw(`CREATE VIRTUAL TABLE tickets_fts USING fts5(
       aftersale_no, order_no, shipping_no, return_no, note,
       recipient_name, phone, province, city, district, address_detail,
       extension, aftersale_type, aftersale_reason, shipping_status, return_logistics,
       content='tickets', content_rowid='rowid'
     )`)
    await knex.raw(`INSERT INTO tickets_fts(tickets_fts) VALUES('rebuild')`)
  } }
]
```

- [ ] **Step 3: 扩展 `TicketRepo` FTS 列** — `src/main/db/tickets.ts`

(a) `FTS_COLS` 改为(原 11 + 新 5,顺序与迁移一致):
```ts
const FTS_COLS = 'aftersale_no, order_no, shipping_no, return_no, note, recipient_name, phone, province, city, district, address_detail, extension, aftersale_type, aftersale_reason, shipping_status, return_logistics'
```
(b) `FtsRow` 接口在末尾加 5 个字段:
```ts
interface FtsRow {
  rowid: number
  aftersale_no: string; order_no: string; shipping_no: string; return_no: string; note: string
  recipient_name: string; phone: string
  province: string; city: string; district: string; address_detail: string
  extension: string; aftersale_type: string; aftersale_reason: string; shipping_status: string; return_logistics: string
}
```
(c) `ftsDelete` 整体替换为(select 列、占位符、绑定各补 5 项):
```ts
  private async ftsDelete(x: Exec, aftersaleNo: string): Promise<void> {
    const row = (await x('tickets')
      .select('rowid', 'aftersale_no', 'order_no', 'shipping_no', 'return_no', 'note',
        'recipient_name', 'phone', 'province', 'city', 'district', 'address_detail',
        'extension', 'aftersale_type', 'aftersale_reason', 'shipping_status', 'return_logistics')
      .where('aftersale_no', aftersaleNo)
      .first()) as FtsRow | undefined
    if (!row) return
    await x.raw(
      `INSERT INTO tickets_fts(tickets_fts, rowid, ${FTS_COLS})
       VALUES('delete', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.rowid, row.aftersale_no, row.order_no, row.shipping_no, row.return_no, row.note,
        row.recipient_name, row.phone, row.province, row.city, row.district, row.address_detail,
        row.extension, row.aftersale_type, row.aftersale_reason, row.shipping_status, row.return_logistics]
    )
  }
```
> 占位符数量:`'delete'` + rowid + 16 列 = 共 17 个 `?`,绑定数组 17 项。`ftsInsert`、`search` 不动。

- [ ] **Step 4: 跑测试** — `npx vitest run tests/db/tickets.test.ts tests/db/database.test.ts` → 全 PASS。

- [ ] **Step 5: Commit**
```bash
git add src/main/db/migrations.ts src/main/db/tickets.ts tests/db/tickets.test.ts tests/db/database.test.ts
git commit -m "feat(search): index extension/type/reason/shipping/logistics in FTS (migration 0002)"
```

---

## Task 2: 更新搜索框占位符

**Files:** Modify `src/renderer/components/SearchBar.tsx`

- [ ] **Step 1: 改占位符** — 把 `placeholder="搜索 售后单号 / 订单号 / 快递单号 / 收货人 / 手机号"` 改为:
```tsx
        placeholder="搜索 售后单号 / 订单号 / 快递单号 / 收货人 / 手机号 / 售后类型 / 物流状态 等"
```

- [ ] **Step 2: 验证 + Commit**
Run: `npm run build` → success。`npm run rebuild:node && npx vitest run` → 0 failures。
```bash
git add src/renderer/components/SearchBar.tsx
git commit -m "feat(search): broaden search box placeholder hint"
```

---

## 手验清单(dev)
`npm run rebuild:electron && npm run dev`:
- 搜索"退货退款"/"签收"/分机号("0106")/售后原因 关键词能命中对应单。
- 原有 收件人/订单号/手机号/地址 搜索仍正常。
- 既有数据(升级后首次启动跑 0002)也能按新字段搜到(`'rebuild'` 已回填)。
- 验证后 `npm run rebuild:node` 还原 ABI。

---

## Self-Review(已核对 spec)
- **§2.1 迁移 0002(drop+create 16 列 + rebuild;不改 baseline)**:Task 1 Step 2。✓
- **§2.2 FTS_COLS / FtsRow / ftsDelete 三处同步,列顺序一致(原11+新5),17 占位符**:Task 1 Step 3。✓
- **§2.3 SearchBar 占位符**:Task 2。✓
- **§5 测试(tickets 搜新字段、database FTS 列断言、全套绿)**:Task 1 Step 1/4、Task 2 Step 2。✓
- **search/ftsInsert 不变**:仅改 FTS_COLS 常量,二者自动生效。✓
- **占位符扫描**:无 TBD;每步完整代码。✓
- **YAGNI**:不索引数值/日期、不改 search 逻辑/过滤器、不改 baseline、无 field:value 语法。✓
