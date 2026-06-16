# 客户信息内嵌售后单 + 派生客户视图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把客户信息从「独立 customers 表 + 手动关联」改为「内嵌在售后单上的字段」,在创建/编辑售后单时直接填写;「客户」标签页变为按昵称聚合的只读派生视图;统计与搜索改为直接基于售后单。

**Architecture:** 售后单(tickets)新增内嵌客户列(昵称/收货人姓名/手机号/省市区/详细地址)。删除 customers 表、customer_id、Customer.name。一次性迁移把旧关联客户回填到售后单后拆除旧结构。StatsRepo/CustomerRepo 改为直接查 tickets;CustomerRepo 变只读聚合(GROUP BY nickname)。FTS 重建纳入客户字段。前端抽出可复用 `RegionCascader`,在新建/详情编辑里填客户信息,客户页改只读。

**Tech Stack:** Electron(main/preload/renderer)、better-sqlite3 + FTS5、React + TypeScript + Tailwind、Vitest。

**关于 ABI:** 本仓库 better-sqlite3 在 vitest(Node)与 Electron 之间有 ABI 差异。**每个跑 vitest 的步骤前,若报 `NODE_MODULE_VERSION` 错,先运行 `npm run rebuild:node`。**

**逐任务绿灯策略(重要):** 这是一次跨进程重构。后端任务(1–6)保证 **vitest 绿**(vitest 只编译被测试导入的 src,渲染层报错不影响 db 测试)。渲染层在任务 6–10 期间 `npm run build` 会暂时不过,**完整 `npm run build` 在任务 11 收尾时验证通过**。每个渲染任务用 `npx tsc --noEmit` 局部确认所改文件无类型错。

---

## File Structure

**Modify:**
- `src/shared/types.ts` — 类型:加 `CustomerFields`/`CustomerSummary`,扩展 `NewTicket`/`Ticket`,最终删除 `Customer`/`NewCustomer`/`CustomerRow`。
- `src/main/db/database.ts` — schema:tickets 客户列、FTS 新列、旧 customers 迁移与拆除。导出 `migrate`。
- `src/main/db/tickets.ts` — create/update/ROW/FTS 含客户列;删 `setCustomer`。
- `src/main/db/stats.ts` — regionCounts/summary 改查 tickets。
- `src/main/db/customers.ts` — 改为对 tickets 的只读聚合。
- `src/main/ipc.ts`、`src/preload/index.ts` — 客户/票据 IPC 与 preload 方法签名。
- `src/renderer/components/NewTicketDialog.tsx` — 加客户信息分区。
- `src/renderer/components/TicketDetail.tsx` — 基本信息展示/编辑客户字段;移除 CustomerPicker。
- `src/renderer/views/CustomersView.tsx`、`components/CustomerTable.tsx`、`components/CustomerDetail.tsx` — 只读派生视图。
- `src/renderer/components/SearchBar.tsx` — 占位符。
- `src/renderer/App.tsx` — 客户跳转(基本不变)。

**Create:**
- `src/renderer/components/RegionCascader.tsx` — 省/市/区县级联选择器(从 CustomerDialog 抽出)。
- `tests/db/migration.test.ts` — 旧库迁移回填测试。
- `tests/renderer/RegionCascader.test.tsx` — 级联交互测试。

**Delete:**
- `src/renderer/components/CustomerDialog.tsx`、`src/renderer/components/CustomerPicker.tsx`
- `tests/renderer/CustomerDialog.test.tsx`

---

## Task 1: 共享类型(纯追加)

仅追加 + 扩展,**暂不删除** `Customer`/`NewCustomer`/`CustomerRow`、**暂留** `Ticket.customerId`,保证全仓库仍编译。

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: 编辑类型**

把 `NewTicket`、`Ticket` 段替换,并在 `Customer` 段上方加新类型:

```ts
export interface CustomerFields {
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

export type NewTicket = {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  note: string
} & Partial<CustomerFields>

export type Ticket = {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  status: TicketStatus
  note: string
  createdAt: number
  updatedAt: number
  customerId: number | null // 过渡字段,任务 3 移除
} & CustomerFields

export interface CustomerSummary {
  nickname: string
  ticketCount: number
  recipientName: string
  phone: string
  province: string
  city: string
  district: string
  lastUpdatedAt: number
}
```

保留现有 `Customer`/`NewCustomer`/`CustomerRow`/`RegionLevel`/`RegionCount`/`StatsSummary` 不动。

- [ ] **Step 2: 确认仍编译/测试通过**

Run: `npm run rebuild:node && npx vitest run`
Expected: 全部通过(现有 21 文件 / 94 测试)。`Ticket` 现有 `customerId` 仍在,旧代码不受影响;新增 `CustomerFields` 列在 DB 落地前读出来会是 `undefined`,但此刻无人读它们。

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "types: add CustomerFields/CustomerSummary, embed customer fields on ticket"
```

---

## Task 2: 售后单表加客户列 + FTS 纳入客户字段 + TicketRepo 读写

数据库新增 tickets 客户列;FTS 重建为含客户字段;TicketRepo 读写/搜索覆盖客户字段。**此任务不动 customers 表**(任务 3 才拆除)。

**Files:**
- Modify: `src/main/db/database.ts`
- Modify: `src/main/db/tickets.ts`
- Test: `tests/db/tickets.test.ts`

- [ ] **Step 1: database.ts —— FTS 新列 + ticket 客户列 + 导出 migrate + 重建逻辑**

把 `migrate` 与文件整体改为(保留 `createDatabase`、`ensureColumn`;**导出 `migrate`** 供迁移测试用;`tickets_fts` 基础定义改新列;新增 ticket 客户列;新增 `rebuildFtsIfStale`)。本任务**先不**加 customers 拆除逻辑:

```ts
import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'

export function createDatabase(path: string): DB {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

const TICKET_CUSTOMER_COLS: [string, string][] = [
  ['nickname', "nickname TEXT NOT NULL DEFAULT ''"],
  ['recipient_name', "recipient_name TEXT NOT NULL DEFAULT ''"],
  ['phone', "phone TEXT NOT NULL DEFAULT ''"],
  ['province_code', "province_code TEXT NOT NULL DEFAULT ''"],
  ['province', "province TEXT NOT NULL DEFAULT ''"],
  ['city_code', "city_code TEXT NOT NULL DEFAULT ''"],
  ['city', "city TEXT NOT NULL DEFAULT ''"],
  ['district_code', "district_code TEXT NOT NULL DEFAULT ''"],
  ['district', "district TEXT NOT NULL DEFAULT ''"],
  ['address_detail', "address_detail TEXT NOT NULL DEFAULT ''"]
]

export function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      aftersale_no TEXT PRIMARY KEY,
      order_no     TEXT NOT NULL DEFAULT '',
      shipping_no  TEXT NOT NULL DEFAULT '',
      return_no    TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'pending',
      note         TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materials (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      aftersale_no TEXT NOT NULL REFERENCES tickets(aftersale_no) ON DELETE CASCADE,
      rel_path     TEXT NOT NULL UNIQUE,
      kind         TEXT NOT NULL,
      name         TEXT NOT NULL DEFAULT '',
      captured_at  INTEGER,
      imported_at  INTEGER NOT NULL,
      size_bytes   INTEGER NOT NULL,
      thumb_path   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_materials_ticket ON materials(aftersale_no);

    CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(
      aftersale_no, order_no, shipping_no, return_no, note,
      nickname, recipient_name, phone, province, city, district, address_detail,
      content='tickets', content_rowid='rowid'
    );
  `)
  ensureColumn(db, 'materials', 'name', "name TEXT NOT NULL DEFAULT ''")
  for (const [col, ddl] of TICKET_CUSTOMER_COLS) ensureColumn(db, 'tickets', col, ddl)
  rebuildFtsIfStale(db)
}

/** Rebuild tickets_fts when its schema predates the customer columns. */
function rebuildFtsIfStale(db: DB): void {
  const cols = db.prepare(`PRAGMA table_info(tickets_fts)`).all() as { name: string }[]
  if (cols.some((c) => c.name === 'nickname')) return
  db.exec(`
    DROP TABLE IF EXISTS tickets_fts;
    CREATE VIRTUAL TABLE tickets_fts USING fts5(
      aftersale_no, order_no, shipping_no, return_no, note,
      nickname, recipient_name, phone, province, city, district, address_detail,
      content='tickets', content_rowid='rowid'
    );
    INSERT INTO tickets_fts(rowid, aftersale_no, order_no, shipping_no, return_no, note,
      nickname, recipient_name, phone, province, city, district, address_detail)
    SELECT rowid, aftersale_no, order_no, shipping_no, return_no, note,
      nickname, recipient_name, phone, province, city, district, address_detail FROM tickets;
  `)
}

export function ensureColumn(db: DB, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}
```

> 注:旧的 `CREATE TABLE customers`、`ensureColumn(... customer_id ...)`、`idx_tickets_customer` 已从 base 中移除。旧库里这些遗留对象由任务 3 的迁移负责拆除;此刻它们仍存在也不影响本任务(没人再创建它们,旧 DB 里仍可被 customers.ts 读到——customers.ts 任务 5 才改)。

- [ ] **Step 2: tickets.ts —— ROW/FTS/create/update 含客户列(暂留 customerId)**

替换 `tickets.ts`(`ROW` 加客户列;`FtsRow`/`ftsInsert`/`ftsDelete` 加客户列;`create` 归一化客户字段默认 `''`;`update` patch 扩展 + UPDATE 写全部客户列;**暂留** `customer_id AS customerId` 与 `setCustomer`,任务 3 删):

```ts
import type { Database } from 'better-sqlite3'
import type { Ticket, NewTicket, CustomerFields } from '../../shared/types'

export type { NewTicket }

type Now = () => number

const ROW = `aftersale_no AS aftersaleNo, order_no AS orderNo, shipping_no AS shippingNo,
  return_no AS returnNo, status, note, created_at AS createdAt, updated_at AS updatedAt,
  customer_id AS customerId,
  nickname, recipient_name AS recipientName, phone,
  province_code AS provinceCode, province, city_code AS cityCode, city,
  district_code AS districtCode, district, address_detail AS addressDetail`

const EMPTY_CUSTOMER: CustomerFields = {
  nickname: '', recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: ''
}

interface FtsRow {
  rowid: number
  aftersale_no: string; order_no: string; shipping_no: string; return_no: string; note: string
  nickname: string; recipient_name: string; phone: string
  province: string; city: string; district: string; address_detail: string
}

const FTS_COLS = 'aftersale_no, order_no, shipping_no, return_no, note, nickname, recipient_name, phone, province, city, district, address_detail'

export class TicketRepo {
  constructor(private db: Database, private now: Now = () => Date.now()) {}

  create(t: NewTicket): void {
    const ts = this.now()
    const row = { ...EMPTY_CUSTOMER, ...t, ts }
    const tx = this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO tickets (aftersale_no, order_no, shipping_no, return_no, status, note, created_at, updated_at,
           nickname, recipient_name, phone, province_code, province, city_code, city, district_code, district, address_detail)
         VALUES (@aftersaleNo, @orderNo, @shippingNo, @returnNo, 'pending', @note, @ts, @ts,
           @nickname, @recipientName, @phone, @provinceCode, @province, @cityCode, @city, @districtCode, @district, @addressDetail)`
      ).run(row)
      this.ftsInsert(t.aftersaleNo)
    })
    tx()
  }

  update(
    aftersaleNo: string,
    patch: Partial<Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo' | 'status' | 'note'> & CustomerFields>
  ): void {
    const cur = this.get(aftersaleNo)
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: this.now() }
    const tx = this.db.transaction(() => {
      this.ftsDelete(aftersaleNo)
      this.db.prepare(
        `UPDATE tickets SET order_no=@orderNo, shipping_no=@shippingNo, return_no=@returnNo,
         status=@status, note=@note, updated_at=@updatedAt,
         nickname=@nickname, recipient_name=@recipientName, phone=@phone,
         province_code=@provinceCode, province=@province, city_code=@cityCode, city=@city,
         district_code=@districtCode, district=@district, address_detail=@addressDetail
         WHERE aftersale_no=@aftersaleNo`
      ).run(next as any)
      this.ftsInsert(aftersaleNo)
    })
    tx()
  }

  setCustomer(aftersaleNo: string, customerId: number | null): void {
    this.db.prepare('UPDATE tickets SET customer_id = ?, updated_at = ? WHERE aftersale_no = ?')
      .run(customerId, this.now(), aftersaleNo)
  }

  delete(aftersaleNo: string): void {
    const tx = this.db.transaction(() => {
      this.ftsDelete(aftersaleNo)
      this.db.prepare('DELETE FROM tickets WHERE aftersale_no = ?').run(aftersaleNo)
    })
    tx()
  }

  get(aftersaleNo: string): Ticket | undefined {
    return this.db.prepare(`SELECT ${ROW} FROM tickets WHERE aftersale_no = ?`).get(aftersaleNo) as Ticket | undefined
  }

  list(): Ticket[] {
    return this.db.prepare(`SELECT ${ROW} FROM tickets ORDER BY updated_at DESC`).all() as Ticket[]
  }

  search(query: string): Ticket[] {
    const q = query.trim()
    if (!q) return this.list()
    const match = `"${q.replace(/"/g, '""')}"*`
    return this.db.prepare(
      `SELECT ${ROW.replace(/(^|, )/g, '$1')} FROM tickets_fts f
       JOIN tickets tickets ON tickets.rowid = f.rowid
       WHERE tickets_fts MATCH ? ORDER BY tickets.updated_at DESC`
    ).all(match) as Ticket[]
  }

  private ftsInsert(aftersaleNo: string): void {
    this.db.prepare(
      `INSERT INTO tickets_fts (rowid, ${FTS_COLS})
       SELECT rowid, ${FTS_COLS} FROM tickets WHERE aftersale_no = ?`
    ).run(aftersaleNo)
  }

  private ftsDelete(aftersaleNo: string): void {
    const row = this.db.prepare(
      `SELECT rowid, ${FTS_COLS} FROM tickets WHERE aftersale_no = ?`
    ).get(aftersaleNo) as FtsRow | undefined
    if (!row) return
    this.db.prepare(
      `INSERT INTO tickets_fts(tickets_fts, rowid, ${FTS_COLS})
       VALUES('delete', @rowid, @aftersale_no, @order_no, @shipping_no, @return_no, @note,
         @nickname, @recipient_name, @phone, @province, @city, @district, @address_detail)`
    ).run(row)
  }
}
```

> `search` 里 `SELECT ${ROW}` 的列没有表前缀;为消除歧义把 join 表别名也叫 `tickets`(`JOIN tickets tickets ON tickets.rowid = f.rowid`),这样 `ROW` 中的裸列名解析到 `tickets` 表。(`ROW.replace(...)` 是恒等占位,保持可读;可直接写 `SELECT ${ROW}`。)

实现时直接用:`SELECT ${ROW} FROM tickets_fts f JOIN tickets ON tickets.rowid = f.rowid WHERE tickets_fts MATCH ? ORDER BY tickets.updated_at DESC`。

- [ ] **Step 3: tickets.test.ts —— 追加客户字段读写 + FTS 搜索测试**

在 `tests/db/tickets.test.ts` 的 `describe('TicketRepo', ...)` 内追加:

```ts
  it('stores and reads embedded customer fields', () => {
    repo.create({
      aftersaleNo: 'AS-C', orderNo: '', shippingNo: '', returnNo: '', note: '',
      nickname: '小明买家', recipientName: '张三', phone: '13800001111',
      provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市',
      districtCode: '440305', district: '南山区', addressDetail: '科技园1号'
    })
    const t = repo.get('AS-C')!
    expect(t.nickname).toBe('小明买家')
    expect(t.recipientName).toBe('张三')
    expect(t.phone).toBe('13800001111')
    expect(t.province).toBe('广东省')
    expect(t.districtCode).toBe('440305')
    expect(t.addressDetail).toBe('科技园1号')
  })

  it('defaults customer fields to empty when omitted', () => {
    repo.create({ aftersaleNo: 'AS-E', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const t = repo.get('AS-E')!
    expect(t.nickname).toBe('')
    expect(t.phone).toBe('')
    expect(t.province).toBe('')
  })

  it('searches by customer fields via FTS', () => {
    repo.create({
      aftersaleNo: 'AS-S', orderNo: '', shippingNo: '', returnNo: '', note: '',
      nickname: '小明买家', recipientName: '张三', phone: '13800001111', addressDetail: '科技园路'
    })
    expect(repo.search('小明').map((t) => t.aftersaleNo)).toContain('AS-S')
    expect(repo.search('张三').map((t) => t.aftersaleNo)).toContain('AS-S')
    expect(repo.search('13800001111').map((t) => t.aftersaleNo)).toContain('AS-S')
    expect(repo.search('科技园').map((t) => t.aftersaleNo)).toContain('AS-S')
  })

  it('updates embedded customer fields', () => {
    repo.create({ aftersaleNo: 'AS-U', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.update('AS-U', { nickname: '阿强', phone: '139', provinceCode: '33', province: '浙江省' })
    const t = repo.get('AS-U')!
    expect(t.nickname).toBe('阿强')
    expect(t.province).toBe('浙江省')
    expect(repo.search('阿强').map((x) => x.aftersaleNo)).toContain('AS-U')
  })
```

- [ ] **Step 4: 跑测试**

Run: `npm run rebuild:node && npx vitest run tests/db/tickets.test.ts`
Expected: PASS(含新增 4 个用例)。再跑全量 `npx vitest run` 应仍全绿(customers/stats 测试此刻仍走旧 customers 表,未受影响)。

- [ ] **Step 5: Commit**

```bash
git add src/main/db/database.ts src/main/db/tickets.ts tests/db/tickets.test.ts
git commit -m "feat(db): embed customer fields on tickets; FTS covers customer fields"
```

---

## Task 3: 迁移旧 customers 数据并拆除旧结构

把旧库里通过 `customer_id` 关联的客户信息回填到售后单,然后删除 `customers` 表、`idx_tickets_customer`、`tickets.customer_id`。同时从 `Ticket` 类型与 `tickets.ts` 移除 `customerId`/`setCustomer`。

**Files:**
- Modify: `src/main/db/database.ts`
- Modify: `src/main/db/tickets.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/db/migration.test.ts`(新建)

- [ ] **Step 1: 写迁移测试(先红)**

新建 `tests/db/migration.test.ts`:手工搭出「旧库」结构(tickets 无客户列 + customer_id、customers 表、一条关联票),调用 `migrate` 后断言回填且旧结构已拆除,且重复调用幂等。

```ts
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../../src/main/db/database'

function legacyDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE tickets (
      aftersale_no TEXT PRIMARY KEY, order_no TEXT NOT NULL DEFAULT '',
      shipping_no TEXT NOT NULL DEFAULT '', return_no TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      customer_id INTEGER
    );
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '', province_code TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '', city_code TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '', district_code TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '', address_detail TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_tickets_customer ON tickets(customer_id);
    INSERT INTO customers (id, nickname, name, province_code, province, city_code, city, district_code, district, address_detail, created_at, updated_at)
      VALUES (1, '小明', '张三', '44', '广东省', '4403', '深圳市', '440305', '南山区', '科技园1号', 1, 1);
    INSERT INTO tickets (aftersale_no, created_at, updated_at, customer_id) VALUES ('AS-1', 1, 1, 1);
    INSERT INTO tickets (aftersale_no, created_at, updated_at, customer_id) VALUES ('AS-2', 1, 1, NULL);
  `)
  return db
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name)
}
function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
}

describe('migrate (legacy customers → embedded ticket fields)', () => {
  it('backfills linked customer info onto tickets', () => {
    const db = legacyDb()
    migrate(db)
    const t = db.prepare(`SELECT nickname, recipient_name AS recipientName, phone, province, district_code AS districtCode, address_detail AS addressDetail FROM tickets WHERE aftersale_no='AS-1'`).get() as any
    expect(t.nickname).toBe('小明')
    expect(t.recipientName).toBe('张三')   // 旧 name → recipientName
    expect(t.phone).toBe('')               // 旧模型无手机号
    expect(t.province).toBe('广东省')
    expect(t.districtCode).toBe('440305')
    expect(t.addressDetail).toBe('科技园1号')
  })

  it('drops the customers table and customer_id column', () => {
    const db = legacyDb()
    migrate(db)
    expect(tableExists(db, 'customers')).toBe(false)
    expect(columns(db, 'tickets')).not.toContain('customer_id')
  })

  it('is idempotent (safe to run twice)', () => {
    const db = legacyDb()
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    expect(tableExists(db, 'customers')).toBe(false)
  })

  it('leaves a fresh db (no customers table) untouched', () => {
    const db = new Database(':memory:')
    expect(() => migrate(db)).not.toThrow()
    expect(tableExists(db, 'customers')).toBe(false)
    expect(columns(db, 'tickets')).toContain('nickname')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run rebuild:node && npx vitest run tests/db/migration.test.ts`
Expected: FAIL —— 当前 `migrate` 还没回填/拆除逻辑(customers 表仍在、customer_id 仍在)。

- [ ] **Step 3: database.ts 加 `migrateLegacyCustomers`**

在 `migrate` 中,`ensureColumn` 客户列之后、`rebuildFtsIfStale` 之前插入调用,并新增函数:

```ts
  for (const [col, ddl] of TICKET_CUSTOMER_COLS) ensureColumn(db, 'tickets', col, ddl)
  migrateLegacyCustomers(db)
  rebuildFtsIfStale(db)
```

```ts
function hasTable(db: DB, name: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name)
}
function hasColumn(db: DB, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

/** One-time: copy linked customer info onto tickets, then drop the legacy structure. */
function migrateLegacyCustomers(db: DB): void {
  if (!hasTable(db, 'customers')) return
  const tx = db.transaction(() => {
    if (hasColumn(db, 'tickets', 'customer_id')) {
      const linked = db.prepare(
        `SELECT t.aftersale_no AS no, c.nickname, c.name, c.province_code, c.province,
                c.city_code, c.city, c.district_code, c.district, c.address_detail
         FROM tickets t JOIN customers c ON c.id = t.customer_id`
      ).all() as Record<string, string>[]
      const upd = db.prepare(
        `UPDATE tickets SET nickname=@nickname, recipient_name=@name,
           province_code=@province_code, province=@province, city_code=@city_code, city=@city,
           district_code=@district_code, district=@district, address_detail=@address_detail
         WHERE aftersale_no=@no`
      )
      for (const r of linked) upd.run(r)
      db.exec('DROP INDEX IF EXISTS idx_tickets_customer')
      db.exec('ALTER TABLE tickets DROP COLUMN customer_id')
    }
    db.exec('DROP TABLE IF EXISTS customers')
  })
  tx()
}
```

- [ ] **Step 4: 从 `Ticket` 类型移除 `customerId`,从 tickets.ts 移除 customerId 与 setCustomer**

`src/shared/types.ts`:删 `Ticket` 中 `customerId: number | null` 那一行(连同上面的过渡注释)。

`src/main/db/tickets.ts`:
- `ROW` 删除 `customer_id AS customerId,` 一段。
- 删除整个 `setCustomer(...)` 方法。
- `import` 行删除不再需要的 `customerId` 相关无影响(类型仍是 Ticket)。

- [ ] **Step 5: 跑测试**

Run: `npm run rebuild:node && npx vitest run tests/db/migration.test.ts tests/db/tickets.test.ts`
Expected: migration 4 用例 PASS;tickets 全 PASS。

> 此刻 `customers.test.ts`/`stats.test.ts` 仍引用旧 `customers` 表用法(`tickets.setCustomer`、`CustomerRepo.create`),它们会**失败**——这是预期的,任务 4、5 会重写它们。本步只验证上面两个文件。

- [ ] **Step 6: Commit**

```bash
git add src/main/db/database.ts src/main/db/tickets.ts src/shared/types.ts tests/db/migration.test.ts
git commit -m "feat(db): migrate legacy customers onto tickets; drop customers table + customer_id"
```

---

## Task 4: StatsRepo 改为直接查 tickets

**Files:**
- Modify: `src/main/db/stats.ts`
- Test: `tests/db/stats.test.ts`(重写)

- [ ] **Step 1: 重写 stats.test.ts(先红)**

`tickets` 现在自带地区列,直接用 `tickets.create` 构造:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'
import { StatsRepo } from '../../src/main/db/stats'

let db: Database
let stats: StatsRepo
let tickets: TicketRepo
let n = 0

function ticket(region: Partial<{ provinceCode: string; province: string; cityCode: string; city: string; districtCode: string; district: string }>) {
  const no = `AS-${++n}`
  tickets.create({ aftersaleNo: no, orderNo: '', shippingNo: '', returnNo: '', note: '', ...region })
  return no
}

beforeEach(() => {
  db = createDatabase(':memory:')
  stats = new StatsRepo(db)
  tickets = new TicketRepo(db, () => 1)
  n = 0
})

describe('StatsRepo.regionCounts', () => {
  it('counts tickets by province (desc), excluding no-region', () => {
    ticket({ provinceCode: '44', province: '广东省' })
    ticket({ provinceCode: '44', province: '广东省' })
    ticket({ provinceCode: '33', province: '浙江省' })
    ticket({}) // 无地区
    expect(stats.regionCounts('province')).toEqual([
      { code: '44', name: '广东省', count: 2 },
      { code: '33', name: '浙江省', count: 1 }
    ])
  })

  it('counts by city and district', () => {
    ticket({ provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市', districtCode: '440305', district: '南山区' })
    ticket({ provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市', districtCode: '440304', district: '福田区' })
    expect(stats.regionCounts('city')).toEqual([{ code: '4403', name: '深圳市', count: 2 }])
    expect(stats.regionCounts('district').map((r) => r.code).sort()).toEqual(['440304', '440305'])
  })
})

describe('StatsRepo.summary', () => {
  it('total / classified / unclassified', () => {
    ticket({ provinceCode: '44', province: '广东省' })
    ticket({}) // 无省
    expect(stats.summary()).toEqual({ total: 2, classified: 1, unclassified: 1 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run rebuild:node && npx vitest run tests/db/stats.test.ts`
Expected: FAIL(当前 stats 仍 JOIN customers)。

- [ ] **Step 3: 重写 stats.ts**

```ts
import type { Database } from 'better-sqlite3'
import type { RegionLevel, RegionCount, StatsSummary } from '../../shared/types'

const COLS: Record<RegionLevel, { code: string; name: string }> = {
  province: { code: 'province_code', name: 'province' },
  city: { code: 'city_code', name: 'city' },
  district: { code: 'district_code', name: 'district' }
}

export class StatsRepo {
  constructor(private db: Database) {}

  regionCounts(level: RegionLevel): RegionCount[] {
    const col = COLS[level] // fixed mapping — never interpolate arbitrary input
    return this.db.prepare(
      `SELECT ${col.code} AS code, ${col.name} AS name, COUNT(*) AS count
       FROM tickets
       WHERE ${col.code} != ''
       GROUP BY ${col.code}, ${col.name}
       ORDER BY count DESC, name ASC`
    ).all() as RegionCount[]
  }

  summary(): StatsSummary {
    const total = (this.db.prepare('SELECT COUNT(*) AS n FROM tickets').get() as { n: number }).n
    const classified = (this.db.prepare(
      `SELECT COUNT(*) AS n FROM tickets WHERE province_code != ''`
    ).get() as { n: number }).n
    return { total, classified, unclassified: total - classified }
  }
}
```

- [ ] **Step 4: 跑测试**

Run: `npm run rebuild:node && npx vitest run tests/db/stats.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/main/db/stats.ts tests/db/stats.test.ts
git commit -m "feat(db): stats aggregate region directly from tickets"
```

---

## Task 5: CustomerRepo 改为对 tickets 的只读聚合

**Files:**
- Modify: `src/main/db/customers.ts`
- Test: `tests/db/customers.test.ts`(重写)

- [ ] **Step 1: 重写 customers.test.ts(先红)**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'
import { CustomerRepo } from '../../src/main/db/customers'

let db: Database
let tickets: TicketRepo
let customers: CustomerRepo
let clock = 1000

beforeEach(() => {
  clock = 1000
  db = createDatabase(':memory:')
  tickets = new TicketRepo(db, () => ++clock)
  customers = new CustomerRepo(db)
})

function add(no: string, over: Record<string, string> = {}) {
  tickets.create({ aftersaleNo: no, orderNo: '', shippingNo: '', returnNo: '', note: '',
    nickname: '小明', recipientName: '张三', phone: '138', provinceCode: '44', province: '广东省',
    cityCode: '4403', city: '深圳市', districtCode: '440305', district: '南山区', addressDetail: '', ...over })
}

describe('CustomerRepo (derived from tickets)', () => {
  it('groups tickets by nickname with复诉 count, newest-first', () => {
    add('AS-1')
    add('AS-2')
    add('AS-3', { nickname: '阿强', recipientName: '李四', province: '浙江省', provinceCode: '33' })
    const rows = customers.listByNickname()
    expect(rows.map((r) => [r.nickname, r.ticketCount])).toEqual([['小明', 2], ['阿强', 1]])
  })

  it('representative values come from the most recently updated ticket', () => {
    add('AS-1', { phone: '111' })
    add('AS-2', { phone: '222' }) // 更晚创建 → updated_at 更大
    const xm = customers.listByNickname().find((r) => r.nickname === '小明')!
    expect(xm.phone).toBe('222')
  })

  it('excludes tickets with empty nickname', () => {
    add('AS-1', { nickname: '' })
    expect(customers.listByNickname()).toEqual([])
  })

  it('ticketsOfNickname returns that buyer tickets newest-first', () => {
    add('AS-1'); add('AS-2')
    expect(customers.ticketsOfNickname('小明').map((t) => t.aftersaleNo)).toEqual(['AS-2', 'AS-1'])
  })

  it('search filters by nickname / recipient / phone, escaping % and _', () => {
    add('AS-1', { nickname: '小明', recipientName: '张三', phone: '13800' })
    add('AS-2', { nickname: '阿强', recipientName: '李四', phone: '13911' })
    expect(customers.search('阿强').map((r) => r.nickname)).toEqual(['阿强'])
    expect(customers.search('张三').map((r) => r.nickname)).toEqual(['小明'])
    expect(customers.search('139').map((r) => r.nickname)).toEqual(['阿强'])
    expect(customers.search('%')).toEqual([]) // 通配符按字面量,不匹配
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run rebuild:node && npx vitest run tests/db/customers.test.ts`
Expected: FAIL(`listByNickname`/`ticketsOfNickname` 不存在)。

- [ ] **Step 3: 重写 customers.ts**

代表值用「该昵称 updated_at 最大的票」:先聚合出 count + maxUpdated,再 JOIN 回 tickets 取该行字段。

```ts
import type { Database } from 'better-sqlite3'
import type { CustomerSummary, Ticket } from '../../shared/types'

const TICKET_ROW = `aftersale_no AS aftersaleNo, order_no AS orderNo, shipping_no AS shippingNo,
  return_no AS returnNo, status, note, created_at AS createdAt, updated_at AS updatedAt,
  nickname, recipient_name AS recipientName, phone,
  province_code AS provinceCode, province, city_code AS cityCode, city,
  district_code AS districtCode, district, address_detail AS addressDetail`

// 每个昵称取其最近(updated_at 最大;并列时 rowid 最大)的售后单作为代表,并带上复诉数。
const SUMMARY_SQL = `
  WITH agg AS (
    SELECT nickname, COUNT(*) AS ticketCount, MAX(updated_at) AS lastUpdatedAt
    FROM tickets WHERE nickname != '' GROUP BY nickname
  ),
  rep AS (
    SELECT t.nickname, t.recipient_name AS recipientName, t.phone, t.province, t.city, t.district,
           ROW_NUMBER() OVER (PARTITION BY t.nickname ORDER BY t.updated_at DESC, t.rowid DESC) AS rn
    FROM tickets t WHERE t.nickname != ''
  )
  SELECT a.nickname, a.ticketCount, a.lastUpdatedAt,
         r.recipientName, r.phone, r.province, r.city, r.district
  FROM agg a JOIN rep r ON r.nickname = a.nickname AND r.rn = 1`

export class CustomerRepo {
  constructor(private db: Database) {}

  listByNickname(): CustomerSummary[] {
    return this.db.prepare(
      `${SUMMARY_SQL} ORDER BY a.ticketCount DESC, a.lastUpdatedAt DESC`
    ).all() as CustomerSummary[]
  }

  search(query: string): CustomerSummary[] {
    const q = query.trim()
    if (!q) return this.listByNickname()
    const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`
    return this.db.prepare(
      `${SUMMARY_SQL}
       WHERE a.nickname LIKE ? ESCAPE '\\' OR r.recipientName LIKE ? ESCAPE '\\' OR r.phone LIKE ? ESCAPE '\\'
       ORDER BY a.ticketCount DESC, a.lastUpdatedAt DESC`
    ).all(like, like, like) as CustomerSummary[]
  }

  ticketsOfNickname(nickname: string): Ticket[] {
    return this.db.prepare(
      `SELECT ${TICKET_ROW} FROM tickets WHERE nickname = ? ORDER BY updated_at DESC`
    ).all(nickname) as Ticket[]
  }
}
```

> `search` 把 `WHERE` 接在 `SUMMARY_SQL`(以 `SELECT … FROM agg a JOIN rep r …` 结尾)之后,语法成立。FTS5 不参与客户搜索(客户搜索是对聚合结果的 LIKE 过滤,字段少、量小)。

- [ ] **Step 4: 跑测试**

Run: `npm run rebuild:node && npx vitest run tests/db/customers.test.ts`
Expected: PASS。再跑全量 `npx vitest run` —— **db 层应全绿**(tickets/stats/customers/migration/materials/database)。渲染层测试(CustomerDialog.test/CustomerTable.test 等)此刻可能因类型/方法变动而失败,任务 8–10 修复。

- [ ] **Step 5: Commit**

```bash
git add src/main/db/customers.ts tests/db/customers.test.ts
git commit -m "feat(db): CustomerRepo becomes read-only aggregation by nickname"
```

---

## Task 6: IPC + preload 接口对齐

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: ipc.ts —— 替换客户/票据相关 handler**

把这一段(`customers:*` 与 `tickets:setCustomer`):

```ts
  ipcMain.handle('customers:list', () => customerRepo.list())
  ipcMain.handle('customers:search', (_e, q: string) => customerRepo.search(q))
  ipcMain.handle('customers:get', (_e, id: number) => customerRepo.get(id))
  ipcMain.handle('customers:create', (_e, c: import('../shared/types').NewCustomer) => customerRepo.create(c))
  ipcMain.handle('customers:update', (_e, id: number, patch: Partial<import('../shared/types').NewCustomer>) => customerRepo.update(id, patch))
  ipcMain.handle('customers:delete', (_e, id: number) => customerRepo.delete(id))
  ipcMain.handle('customers:ticketsOf', (_e, id: number) => customerRepo.ticketsOf(id))
  ipcMain.handle('tickets:setCustomer', (_e, no: string, customerId: number | null) => tickets.setCustomer(no, customerId))
```

替换为:

```ts
  ipcMain.handle('customers:list', () => customerRepo.listByNickname())
  ipcMain.handle('customers:search', (_e, q: string) => customerRepo.search(q))
  ipcMain.handle('customers:ticketsOf', (_e, nickname: string) => customerRepo.ticketsOfNickname(nickname))
```

`tickets:update` 的 patch 类型已是 `Partial<Ticket>`,无需改(现在 Ticket 含客户字段)。`stats:*` 不变。

- [ ] **Step 2: preload/index.ts —— 调整方法**

把这几行:

```ts
  listCustomers: (): Promise<CustomerRow[]> => ipcRenderer.invoke('customers:list'),
  searchCustomers: (q: string): Promise<CustomerRow[]> => ipcRenderer.invoke('customers:search', q),
  getCustomer: (id: number): Promise<Customer | undefined> => ipcRenderer.invoke('customers:get', id),
  createCustomer: (c: NewCustomer): Promise<number> => ipcRenderer.invoke('customers:create', c),
  updateCustomer: (id: number, patch: Partial<NewCustomer>): Promise<void> => ipcRenderer.invoke('customers:update', id, patch),
  deleteCustomer: (id: number): Promise<void> => ipcRenderer.invoke('customers:delete', id),
  customerTickets: (id: number): Promise<Ticket[]> => ipcRenderer.invoke('customers:ticketsOf', id),
  setTicketCustomer: (no: string, customerId: number | null): Promise<void> => ipcRenderer.invoke('tickets:setCustomer', no, customerId),
```

替换为:

```ts
  listCustomers: (): Promise<CustomerSummary[]> => ipcRenderer.invoke('customers:list'),
  searchCustomers: (q: string): Promise<CustomerSummary[]> => ipcRenderer.invoke('customers:search', q),
  customerTickets: (nickname: string): Promise<Ticket[]> => ipcRenderer.invoke('customers:ticketsOf', nickname),
```

并把顶部 import 的类型从 `Customer, NewCustomer, CustomerRow` 改为 `CustomerSummary`(`Ticket` 保留):

```ts
import type { Ticket, Material, PickedFile, CreateMaterialPayload, NewTicket, CustomerSummary, RegionLevel, RegionCount, StatsSummary } from '../shared/types'
```

- [ ] **Step 3: 局部类型检查(main + preload)**

Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "src/(main|preload)/" | grep -vE "Cannot find (name|module).*(node:|Buffer|process|console)"`
Expected: 无输出(main/preload 无类型错)。渲染层(`src/renderer/...`)此刻仍有错(引用了已删的 api 方法/类型),属预期,任务 7–11 修复。

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat(ipc): customer endpoints become read-only aggregation; drop linking"
```

---

## Task 7: 抽出可复用 `RegionCascader`

**Files:**
- Create: `src/renderer/components/RegionCascader.tsx`
- Test: `tests/renderer/RegionCascader.test.tsx`(新建)

- [ ] **Step 1: 写组件**

```tsx
import { childrenOf } from '../region'

export interface RegionValue {
  provinceCode: string; province: string
  cityCode: string; city: string
  districtCode: string; district: string
}

export const EMPTY_REGION: RegionValue = {
  provinceCode: '', province: '', cityCode: '', city: '', districtCode: '', district: ''
}

const selCls = 'rounded-lg border border-line bg-surface px-2 py-2 text-sm'

export function RegionCascader({ value, onChange }: { value: RegionValue; onChange: (v: RegionValue) => void }) {
  const provinces = childrenOf('')
  const cities = value.provinceCode ? childrenOf(value.provinceCode) : []
  const districts = value.cityCode ? childrenOf(value.cityCode) : []

  function pickProvince(code: string) {
    const r = provinces.find((x) => x.code === code)
    onChange({ ...value, provinceCode: code, province: r?.name ?? '', cityCode: '', city: '', districtCode: '', district: '' })
  }
  function pickCity(code: string) {
    const r = cities.find((x) => x.code === code)
    onChange({ ...value, cityCode: code, city: r?.name ?? '', districtCode: '', district: '' })
  }
  function pickDistrict(code: string) {
    const r = districts.find((x) => x.code === code)
    onChange({ ...value, districtCode: code, district: r?.name ?? '' })
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <select className={selCls} value={value.provinceCode} onChange={(e) => pickProvince(e.target.value)}>
        <option value="">省</option>
        {provinces.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </select>
      <select className={selCls} value={value.cityCode} disabled={!value.provinceCode} onChange={(e) => pickCity(e.target.value)}>
        <option value="">市</option>
        {cities.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </select>
      <select className={selCls} value={value.districtCode} disabled={!value.cityCode} onChange={(e) => pickDistrict(e.target.value)}>
        <option value="">区县</option>
        {districts.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </select>
    </div>
  )
}
```

- [ ] **Step 2: 写渲染测试**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { RegionCascader, EMPTY_REGION, type RegionValue } from '../../src/renderer/components/RegionCascader'

function Harness({ onChange }: { onChange: (v: RegionValue) => void }) {
  const [v, setV] = useState<RegionValue>(EMPTY_REGION)
  return <RegionCascader value={v} onChange={(nv) => { setV(nv); onChange(nv) }} />
}

describe('RegionCascader', () => {
  it('selecting a province enables and fills the city list, and reports province name', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const [prov, cityBefore] = screen.getAllByRole('combobox')
    expect((cityBefore as HTMLSelectElement).disabled).toBe(true)
    // 选第一个省(广东省 code '44' 在数据集中存在)
    fireEvent.change(prov, { target: { value: '44' } })
    expect(onChange).toHaveBeenCalled()
    const last = onChange.mock.calls.at(-1)![0]
    expect(last.provinceCode).toBe('44')
    expect(last.province.length).toBeGreaterThan(0)
    const cityAfter = screen.getAllByRole('combobox')[1] as HTMLSelectElement
    expect(cityAfter.disabled).toBe(false)
  })
})
```

> 数据集 `china-divisions.json` 中省级 code 为 2 位(如广东 `44`);测试用 `44` 断言存在。若实际数据省 code 不同,实现者按 `region.test.ts` 既有断言调整该常量。

- [ ] **Step 3: 跑测试**

Run: `npm run rebuild:node && npx vitest run tests/renderer/RegionCascader.test.tsx`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/RegionCascader.tsx tests/renderer/RegionCascader.test.tsx
git commit -m "feat(ui): extract reusable RegionCascader"
```

---

## Task 8: 新建售后单弹窗加客户信息

**Files:**
- Modify: `src/renderer/components/NewTicketDialog.tsx`
- Test: `tests/renderer/NewTicketDialog.test.tsx`

- [ ] **Step 1: 重写 NewTicketDialog.tsx**

```tsx
import { useState } from 'react'
import type { NewTicket } from '@shared/types'
import { IconClose } from './icons'
import { RegionCascader, EMPTY_REGION, type RegionValue } from './RegionCascader'

interface Props { open: boolean; onCreate: (t: NewTicket) => void; onCancel: () => void }

export function NewTicketDialog({ open, onCreate, onCancel }: Props) {
  const [aftersaleNo, setAftersaleNo] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [shippingNo, setShippingNo] = useState('')
  const [returnNo, setReturnNo] = useState('')
  const [nickname, setNickname] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [phone, setPhone] = useState('')
  const [region, setRegion] = useState<RegionValue>(EMPTY_REGION)
  const [addressDetail, setAddressDetail] = useState('')

  if (!open) return null
  const reset = () => {
    setAftersaleNo(''); setOrderNo(''); setShippingNo(''); setReturnNo('')
    setNickname(''); setRecipientName(''); setPhone(''); setRegion(EMPTY_REGION); setAddressDetail('')
  }
  const submit = () => {
    const no = aftersaleNo.trim()
    if (!no) return
    onCreate({
      aftersaleNo: no, orderNo: orderNo.trim(), shippingNo: shippingNo.trim(), returnNo: returnNo.trim(), note: '',
      nickname: nickname.trim(), recipientName: recipientName.trim(), phone: phone.trim(),
      ...region, addressDetail: addressDetail.trim()
    })
    reset()
  }

  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">新建售后单</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={() => { reset(); onCancel() }} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">售后单号 <span className="text-accent">*</span></span>
            <input className="field tnum" value={aftersaleNo} onChange={(e) => setAftersaleNo(e.target.value)} placeholder="必填" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">订单号</span>
            <input className="field tnum" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">发货快递单号</span>
            <input className="field tnum" value={shippingNo} onChange={(e) => setShippingNo(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">退货快递单号</span>
            <input className="field tnum" value={returnNo} onChange={(e) => setReturnNo(e.target.value)} />
          </label>

          <div className="border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">客户信息(选填)</div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">昵称</span>
            <input className="field" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="买家昵称" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">收货人姓名</span>
              <input className="field" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">手机号</span>
              <input className="field tnum" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <div>
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">联系地址</span>
            <RegionCascader value={region} onChange={setRegion} />
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">详细地址</span>
            <input className="field" value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)} placeholder="街道门牌等" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => { reset(); onCancel() }}>取消</button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!aftersaleNo.trim()} onClick={submit}>创建</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 在 NewTicketDialog.test.tsx 追加客户字段测试**

先看现有测试如何渲染/提交;追加一个用例:填昵称+手机号 → onCreate 收到对应字段。示例(按现有测试的查询风格适配):

```tsx
  it('includes customer fields in the created ticket', () => {
    const onCreate = vi.fn()
    render(<NewTicketDialog open onCreate={onCreate} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-9' } })
    fireEvent.change(screen.getByPlaceholderText('买家昵称'), { target: { value: '小明' } })
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ aftersaleNo: 'AS-9', nickname: '小明' }))
  })
```

- [ ] **Step 3: 跑测试**

Run: `npm run rebuild:node && npx vitest run tests/renderer/NewTicketDialog.test.tsx`
Expected: PASS(现有用例 + 新用例)。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/NewTicketDialog.tsx tests/renderer/NewTicketDialog.test.tsx
git commit -m "feat(ui): enter customer info when creating a ticket"
```

---

## Task 9: 详情页基本信息展示/编辑客户字段,移除关联

**Files:**
- Modify: `src/renderer/components/TicketDetail.tsx`

- [ ] **Step 1: 改 TicketDetail.tsx**

改动点(在现有文件上):

1. import 调整:删除 `CustomerPicker` 与 `Customer` 相关引用;加 `RegionCascader`/`RegionValue`:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Material, Ticket, TicketStatus, CustomerFields } from '@shared/types'
import { api } from '../api'
import { STATUS_META, STATUS_ORDER } from '../status'
import { MaterialGrid } from './MaterialGrid'
import { PreviewModal } from './PreviewModal'
import { NewMaterialDialog } from './NewMaterialDialog'
import { RegionCascader, type RegionValue } from './RegionCascader'
import { regionLabel } from '../region'
import { IconImport, IconFolder, IconArchive, IconRefresh, IconTrash, IconClose, IconExternal } from './icons'
```

2. 删除 customer/picker 相关 state 与函数:`customer`、`pickerOpen`、`linkCustomer`、`unlinkCustomer`、`customerName`,以及 reload 里 `getCustomer` 那段。`reload` 简化为:

```tsx
  async function reload() {
    currentNo.current = aftersaleNo
    const [t, ms] = await Promise.all([api.getTicket(aftersaleNo), api.listMaterials(aftersaleNo)])
    if (currentNo.current !== aftersaleNo) return
    setTicket(t)
    setMaterials(ms)
    setSelected(new Set())
  }
  useEffect(() => { setMsg(null); setConfirmDelete(false); setEditing(false); reload() }, [aftersaleNo])
```

3. 编辑表单 state 扩展为包含客户字段:

```tsx
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo'> & CustomerFields>({
    orderNo: '', shippingNo: '', returnNo: '',
    nickname: '', recipientName: '', phone: '', provinceCode: '', province: '',
    cityCode: '', city: '', districtCode: '', district: '', addressDetail: ''
  })
```

4. `startEdit`/`saveInfo`:

```tsx
  function startEdit() {
    if (!ticket) return
    setForm({
      orderNo: ticket.orderNo, shippingNo: ticket.shippingNo, returnNo: ticket.returnNo,
      nickname: ticket.nickname, recipientName: ticket.recipientName, phone: ticket.phone,
      provinceCode: ticket.provinceCode, province: ticket.province, cityCode: ticket.cityCode, city: ticket.city,
      districtCode: ticket.districtCode, district: ticket.district, addressDetail: ticket.addressDetail
    })
    setEditing(true)
  }
  async function saveInfo() {
    await api.updateTicket(aftersaleNo, { ...form })
    setEditing(false)
    await reload()
    onChanged()
    setMsg('已保存基本信息')
  }
  const region: RegionValue = {
    provinceCode: form.provinceCode, province: form.province, cityCode: form.cityCode,
    city: form.city, districtCode: form.districtCode, district: form.district
  }
```

5. 基本信息面板(`<aside>` 内 `<dl>`):把原「客户 关联」行替换为客户字段行,并在编辑态用输入框/级联器。整段 `<dl>` 改为:

```tsx
          <dl className="mt-4 space-y-4">
            <InfoRow label="昵称">
              {editing
                ? <input className="field py-1.5" value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} placeholder="买家昵称" />
                : <Value v={ticket.nickname} />}
            </InfoRow>
            <InfoRow label="收货人姓名">
              {editing
                ? <input className="field py-1.5" value={form.recipientName} onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.recipientName} />}
            </InfoRow>
            <InfoRow label="手机号">
              {editing
                ? <input className="field tnum py-1.5" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.phone} />}
            </InfoRow>
            <InfoRow label="联系地址">
              {editing
                ? <div className="space-y-2">
                    <RegionCascader value={region} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
                    <input className="field py-1.5" value={form.addressDetail} onChange={(e) => setForm((f) => ({ ...f, addressDetail: e.target.value }))} placeholder="详细地址" />
                  </div>
                : <Value v={[regionLabel(ticket), ticket.addressDetail].filter(Boolean).join(' ')} />}
            </InfoRow>
            <div className="h-px bg-line" />
            <InfoRow label="订单号">
              {editing
                ? <input className="field tnum py-1.5" value={form.orderNo} onChange={(e) => setForm((f) => ({ ...f, orderNo: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.orderNo} />}
            </InfoRow>
            <InfoRow label="发货快递单号">
              {editing
                ? <input className="field tnum py-1.5" value={form.shippingNo} onChange={(e) => setForm((f) => ({ ...f, shippingNo: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.shippingNo} />}
            </InfoRow>
            <InfoRow label="退货快递单号">
              {editing
                ? <input className="field tnum py-1.5" value={form.returnNo} onChange={(e) => setForm((f) => ({ ...f, returnNo: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.returnNo} />}
            </InfoRow>
          </dl>
```

6. 删除文件底部对 `CustomerPicker` 的渲染(`<CustomerPicker .../>` 整行)。`openPdd` 保持不变。

- [ ] **Step 2: 局部类型检查**

Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "TicketDetail"`
Expected: 无输出。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/TicketDetail.tsx
git commit -m "feat(ui): show/edit embedded customer info in ticket detail; drop linking"
```

---

## Task 10: 客户标签页改只读派生视图

**Files:**
- Modify: `src/renderer/views/CustomersView.tsx`
- Modify: `src/renderer/components/CustomerTable.tsx`
- Modify: `src/renderer/components/CustomerDetail.tsx`
- Modify: `tests/renderer/CustomerTable.test.tsx`
- Delete: `src/renderer/components/CustomerDialog.tsx`, `src/renderer/components/CustomerPicker.tsx`, `tests/renderer/CustomerDialog.test.tsx`

- [ ] **Step 1: 删除 CustomerDialog / CustomerPicker / CustomerDialog 测试**

```bash
git rm src/renderer/components/CustomerDialog.tsx src/renderer/components/CustomerPicker.tsx tests/renderer/CustomerDialog.test.tsx
```

- [ ] **Step 2: 重写 CustomerTable.tsx(只读,按昵称聚合)**

```tsx
import { useEffect, useState } from 'react'
import type { CustomerSummary } from '@shared/types'
import { paginate, formatTime } from '../table'
import { regionLabel } from '../region'
import { IconBox } from './icons'

interface Props { customers: CustomerSummary[]; query: string; onOpen: (nickname: string) => void }
const SIZES = [10, 20, 50]

export function CustomerTable({ customers, query, onOpen }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [query])

  const total = customers.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  const rows = paginate(customers, current, pageSize)

  return (
    <div className="p-6">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-display text-sm font-bold tracking-tight text-ink">客户</span>
        <span className="tnum text-xs text-muted">{total}</span>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-line bg-surface py-20 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-paper-2 text-muted"><IconBox className="text-2xl" /></div>
          <p className="text-sm text-muted">暂无客户 — 在售后单里填写买家昵称后会自动归集</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <div className="max-h-[calc(100vh-220px)] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-2 text-[11px] uppercase tracking-wider text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-left font-medium">昵称</th>
                  <th className="px-4 py-2.5 text-left font-medium">收货人</th>
                  <th className="px-4 py-2.5 text-left font-medium">手机号</th>
                  <th className="px-4 py-2.5 text-left font-medium">地区</th>
                  <th className="px-4 py-2.5 text-left font-medium">售后单数</th>
                  <th className="px-4 py-2.5 text-left font-medium">最近更新</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.nickname}
                    className="animate-rise cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-paper-2"
                    style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
                    onClick={() => onOpen(c.nickname)}>
                    <td className="px-4 py-3 text-ink">{c.nickname}</td>
                    <td className="px-4 py-3 text-ink-soft">{c.recipientName || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{regionLabel(c) || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{c.ticketCount}</td>
                    <td className="px-4 py-3 text-muted">{formatTime(c.lastUpdatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line bg-paper-2 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-muted">
              <span>共 {total} 条</span>
              <select className="rounded border border-line bg-surface px-1.5 py-1 text-xs" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
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

- [ ] **Step 3: 重写 CustomerDetail.tsx(按昵称,只读)**

```tsx
import { useEffect, useState } from 'react'
import type { CustomerSummary, Ticket } from '@shared/types'
import { api } from '../api'
import { regionLabel } from '../region'
import { STATUS_META } from '../status'
import { formatTime } from '../table'

interface Props { summary: CustomerSummary; onBack: () => void; onOpenTicket: (no: string) => void }

export function CustomerDetail({ summary, onBack, onOpenTicket }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  useEffect(() => { api.customerTickets(summary.nickname).then(setTickets) }, [summary.nickname])

  const region = regionLabel(summary)
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-paper-2 px-6 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <button className="btn-ghost mt-0.5 px-2.5" onClick={onBack} aria-label="返回">← 返回</button>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">客户昵称</div>
            <h2 className="mt-0.5 truncate font-display text-2xl font-extrabold tracking-tight text-ink">{summary.nickname}</h2>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-ink-soft">
          <span><span className="text-[11px] uppercase tracking-wider text-muted">收货人 </span>{summary.recipientName || '—'}</span>
          <span><span className="text-[11px] uppercase tracking-wider text-muted">手机号 </span>{summary.phone || '—'}</span>
          <span><span className="text-[11px] uppercase tracking-wider text-muted">地区 </span>{region || '—'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-2 text-sm font-medium text-ink-soft">售后单 <span className="tnum text-muted">{tickets.length}</span></div>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted">暂无售后单</p>
        ) : (
          <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
            <table className="w-full text-sm">
              <tbody>
                {tickets.map((t) => {
                  const meta = STATUS_META[t.status] ?? STATUS_META.pending
                  return (
                    <tr key={t.aftersaleNo} className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-paper-2" onClick={() => onOpenTicket(t.aftersaleNo)}>
                      <td className="tnum px-4 py-3 font-medium text-ink">{t.aftersaleNo}</td>
                      <td className="px-4 py-3"><span className={`chip ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span></td>
                      <td className="px-4 py-3 text-muted">{formatTime(t.updatedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 重写 CustomersView.tsx(去掉 dialog/编辑/新建)**

```tsx
import { useEffect, useState } from 'react'
import type { CustomerSummary } from '@shared/types'
import { api } from '../api'
import { SearchBar } from '../components/SearchBar'
import { CustomerTable } from '../components/CustomerTable'
import { CustomerDetail } from '../components/CustomerDetail'

export function CustomersView({ onOpenTicket }: { onOpenTicket: (no: string) => void }) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [selected, setSelected] = useState<CustomerSummary | undefined>()
  const [query, setQuery] = useState('')

  async function load(q = query) { setCustomers(q ? await api.searchCustomers(q) : await api.listCustomers()) }
  useEffect(() => { load('') }, [])
  function onSearch(q: string) { setQuery(q); load(q) }

  return (
    <div className="flex h-full flex-col">
      {selected ? (
        <div className="flex-1 overflow-auto">
          <CustomerDetail summary={selected} onBack={() => setSelected(undefined)} onOpenTicket={onOpenTicket} />
        </div>
      ) : (
        <>
          <div className="border-b border-line bg-paper-2 px-6 py-3"><div className="max-w-xl"><SearchBar onSearch={onSearch} /></div></div>
          <div className="flex-1 overflow-auto">
            <CustomerTable customers={customers} query={query} onOpen={(nickname) => {
              const c = customers.find((x) => x.nickname === nickname)
              if (c) setSelected(c)
            }} />
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: 更新 CustomerTable.test.tsx**

按新列(无「姓名」「新建客户」,有「售后单数」)与新 props(`CustomerSummary[]`、`onOpen(nickname)`、无 `onNew`)调整。示例核心断言:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CustomerTable } from '../../src/renderer/components/CustomerTable'
import type { CustomerSummary } from '../../src/shared/types'

const rows: CustomerSummary[] = [
  { nickname: '小明', ticketCount: 3, recipientName: '张三', phone: '138', province: '广东省', city: '深圳市', district: '南山区', lastUpdatedAt: 1000 }
]

describe('CustomerTable', () => {
  it('renders nickname, recipient, phone, region and count; row click reports nickname', () => {
    const onOpen = vi.fn()
    render(<CustomerTable customers={rows} query="" onOpen={onOpen} />)
    expect(screen.getByText('小明')).toBeTruthy()
    expect(screen.getByText('张三')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    fireEvent.click(screen.getByText('小明'))
    expect(onOpen).toHaveBeenCalledWith('小明')
  })
})
```

- [ ] **Step 6: 跑测试**

Run: `npm run rebuild:node && npx vitest run tests/renderer/CustomerTable.test.tsx`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add -A src/renderer/views/CustomersView.tsx src/renderer/components/CustomerTable.tsx src/renderer/components/CustomerDetail.tsx tests/renderer/CustomerTable.test.tsx
git commit -m "feat(ui): customers tab becomes read-only aggregation by nickname"
```

---

## Task 11: 收尾 —— 搜索占位符、删除遗留类型、全量验证

**Files:**
- Modify: `src/renderer/components/SearchBar.tsx`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: SearchBar 占位符**

把 `src/renderer/components/SearchBar.tsx` 中 placeholder 改为:

```tsx
        placeholder="搜索 售后单号 / 订单号 / 快递单号 / 昵称 / 收货人 / 手机号"
```

- [ ] **Step 2: 删除遗留类型**

`src/shared/types.ts`:删除 `Customer`、`NewCustomer`、`CustomerRow` 三个声明(已无人引用)。

- [ ] **Step 3: 全量类型检查**

Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "^src/" | grep -vE "Cannot find (name|module).*(node:|Buffer|process|console|HTMLElement|File|Blob|URL|window|document|Image|DataTransfer|ClipboardEvent|import\\.meta)"`
Expected: 无输出(无真实类型错;剩余的是既有 node/dom 环境噪声)。

- [ ] **Step 4: 全量构建 + 测试**

Run: `npm run build`
Expected: 构建通过(main/preload/renderer 全过)。

Run: `npm run rebuild:node && npx vitest run`
Expected: 全绿。文件数会变化(删了 CustomerDialog.test、加了 migration/RegionCascader 测试);断言总体通过、无失败。

- [ ] **Step 5: 手验清单(dev)**

`npm run rebuild:electron && npm run dev`:
- 新建售后单填昵称/收货人/手机号/省市区/详细地址 → 详情基本信息显示一致。
- 详情「编辑」改客户字段并保存 → 客户页聚合、统计地图随之更新。
- 客户页按昵称聚合,显示售后单数;点昵称看其售后单,点进跳详情。
- 搜索框按昵称/手机号/收货人能命中售后单。
- 统计页省/市/区县排行与下钻地图正常。
- 验证后 `npm run rebuild:node` 还原 ABI。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SearchBar.tsx src/shared/types.ts
git commit -m "chore: search placeholder + remove legacy Customer types"
```

---

## Self-Review(已核对 spec)

- **Spec §2.1 类型**:Task 1(CustomerFields/CustomerSummary/NewTicket/Ticket)+ Task 11(删 Customer/NewCustomer/CustomerRow)。✓
- **Spec §2.2 表结构**:Task 2(ensureColumn 客户列)。✓
- **Spec §2.3 迁移**:Task 3(回填 + 删 index/表/列,幂等,gated)。✓
- **Spec §2.4 FTS**:Task 2(新列 + PRAGMA-gated 重建)。✓
- **Spec §3.1 TicketRepo**:Task 2/3。✓ **§3.2 CustomerRepo 聚合**:Task 5。✓ **§3.3 StatsRepo**:Task 4。✓ **§3.4 IPC/preload**:Task 6。✓
- **Spec §4.1 RegionCascader**:Task 7。✓ **§4.2 新建弹窗**:Task 8。✓ **§4.3 详情编辑**:Task 9。✓ **§4.4 客户页只读**:Task 10。✓ **§4.5 搜索占位符**:Task 11。✓
- **Spec §5 测试**:tickets(Task 2)、migration(Task 3)、stats(Task 4)、customers 聚合(Task 5)、RegionCascader(Task 7);手验清单 Task 11。✓
- **类型一致性**:`CustomerFields` 字段名(recipientName/provinceCode…)在 types/tickets/customers/RegionCascader/dialogs 全程一致;`CustomerSummary` 字段(nickname/ticketCount/recipientName/phone/province/city/district/lastUpdatedAt)在 repo/preload/table/detail 一致。✓
- **占位符扫描**:无 TBD;每个改动步骤含完整代码或精确编辑。RegionCascader 测试里省 code `'44'` 标注了「按 region.test.ts 既有断言调整」的兜底。✓
