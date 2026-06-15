# 投诉客户信息模块 阶段一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增"客户"模块:客户实体(昵称/姓名/结构化省市区地址)、与售后单一对多可选关联、顶部「售后单/客户」切换、客户分页表格/详情/表单、售后单详情里关联客户。

**Architecture:** SQLite 新增 `customers` 表 + `tickets.customer_id`(ensureColumn 迁移);`CustomerRepo` 与 `TicketRepo.setCustomer`;内置中国省/市/区县数据集 + `region.ts` 纯函数;App 重构为 tabs 外壳 + `TicketsView`/`CustomersView`;新增 `CustomerTable`/`CustomerDetail`/`CustomerDialog`/`CustomerPicker`。

**Tech Stack:** Electron, better-sqlite3, React + TS, Tailwind(既有设计令牌), Vitest。

> 测试在 system Node ABI 下跑(若 `better-sqlite3 NODE_MODULE_VERSION` 错误,先 `npm run rebuild:node`)。`npm run dev` 前 `npm run rebuild:electron`。

---

## File Structure

```
src/shared/types.ts                          # + Customer / NewCustomer / CustomerRow;Ticket.customerId
src/main/db/database.ts                       # + customers 表;ensureColumn tickets.customer_id
src/main/db/customers.ts                      # 新增 CustomerRepo
src/main/db/tickets.ts                        # ROW/search + customerId;+ setCustomer
src/renderer/region.ts                        # childrenOfIn/regionLabel(纯)+ childrenOf(读内置 JSON)
src/renderer/china-divisions.json             # 内置省/市/区县数据集(由脚本生成)
scripts/gen-divisions.mjs                     # 一次性生成脚本(从 china-division 展平)
src/main/ipc.ts                               # + customers:* / tickets:setCustomer / customers:ticketsOf
src/preload/index.ts                          # 暴露上述方法
src/renderer/App.tsx                          # 重构:tabs 外壳
src/renderer/views/TicketsView.tsx            # 抽出现有售后单 list/detail/search(+ jumpTo)
src/renderer/views/CustomersView.tsx          # 客户 list/detail/search
src/renderer/components/CustomerTable.tsx     # 客户分页表格
src/renderer/components/CustomerDialog.tsx    # 客户表单(级联)
src/renderer/components/CustomerDetail.tsx    # 客户详情 + 关联售后单
src/renderer/components/CustomerPicker.tsx    # 售后单关联客户选择弹窗
src/renderer/components/TicketDetail.tsx      # + 客户行 + 关联控件

tests/db/customers.test.ts
tests/db/tickets.test.ts                      # + setCustomer/customerId
tests/db/database.test.ts                     # + customers 表/customer_id 列
tests/renderer/region.test.ts
tests/renderer/CustomerTable.test.tsx
tests/renderer/CustomerDialog.test.tsx
```

---

## Task 1: 共享类型

**Files:** Modify `src/shared/types.ts`

- [ ] **Step 1: add types**

Append to `src/shared/types.ts`, and add `customerId` to `Ticket`:
```ts
export interface Customer {
  id: number
  nickname: string
  name: string
  provinceCode: string
  province: string
  cityCode: string
  city: string
  districtCode: string
  district: string
  addressDetail: string
  createdAt: number
  updatedAt: number
}
export type NewCustomer = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>
export interface CustomerRow extends Customer { ticketCount: number }
```
In the `Ticket` interface add (after `updatedAt`): `customerId: number | null`.

- [ ] **Step 2: verify + commit**

Run: `npx vitest run` → still green (types only; if better-sqlite3 ABI error, `npm run rebuild:node`). Note: TicketRepo's `get/list` will now return rows lacking `customerId` only until Task 4 adds it to the projection — that's a type-level gap not exercised by vitest. Proceed.
```bash
git add src/shared/types.ts
git commit -m "feat: Customer types + Ticket.customerId"
```

---

## Task 2: DB schema — customers 表 + tickets.customer_id

**Files:** Modify `src/main/db/database.ts`; Test `tests/db/database.test.ts`

- [ ] **Step 1: failing test** (append to `tests/db/database.test.ts`)
```ts
describe('customers schema', () => {
  it('creates the customers table on a fresh db', () => {
    const db = createDatabase(':memory:')
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name)
    expect(names).toContain('customers')
  })
  it('tickets has a customer_id column', () => {
    const db = createDatabase(':memory:')
    const cols = (db.prepare('PRAGMA table_info(tickets)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('customer_id')
  })
})
```

- [ ] **Step 2: run, confirm FAIL**

Run: `npx vitest run tests/db/database.test.ts` → FAIL.

- [ ] **Step 3: implement** — in `src/main/db/database.ts` `migrate()`'s `db.exec(...)` schema, add the customers table (alongside the others):
```sql
    CREATE TABLE IF NOT EXISTS customers (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname       TEXT NOT NULL DEFAULT '',
      name           TEXT NOT NULL DEFAULT '',
      province_code  TEXT NOT NULL DEFAULT '',
      province       TEXT NOT NULL DEFAULT '',
      city_code      TEXT NOT NULL DEFAULT '',
      city           TEXT NOT NULL DEFAULT '',
      district_code  TEXT NOT NULL DEFAULT '',
      district       TEXT NOT NULL DEFAULT '',
      address_detail TEXT NOT NULL DEFAULT '',
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    );
```
And after the `db.exec` (next to the existing `ensureColumn(db,'materials','name',...)` call) add:
```ts
  ensureColumn(db, 'tickets', 'customer_id', 'customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL')
```

- [ ] **Step 4: run, confirm PASS + full suite**

Run: `npx vitest run tests/db/database.test.ts` → PASS. Then `npx vitest run` → green.

- [ ] **Step 5: commit**
```bash
git add src/main/db/database.ts tests/db/database.test.ts
git commit -m "feat: customers table + tickets.customer_id migration"
```

---

## Task 3: CustomerRepo

**Files:** Create `src/main/db/customers.ts`; Test `tests/db/customers.test.ts`

- [ ] **Step 1: failing test** `tests/db/customers.test.ts`
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'
import { CustomerRepo } from '../../src/main/db/customers'

let db: Database
let customers: CustomerRepo

const baseCustomer = {
  nickname: '小明', name: '张三',
  provinceCode: '44', province: '广东省',
  cityCode: '4403', city: '深圳市',
  districtCode: '440305', district: '南山区',
  addressDetail: '科技园1号'
}

beforeEach(() => {
  db = createDatabase(':memory:')
  customers = new CustomerRepo(db, () => 1000)
})

describe('CustomerRepo', () => {
  it('creates and reads a customer with address fields', () => {
    const id = customers.create(baseCustomer)
    const c = customers.get(id)!
    expect(c.nickname).toBe('小明')
    expect(c.province).toBe('广东省')
    expect(c.districtCode).toBe('440305')
    expect(c.addressDetail).toBe('科技园1号')
    expect(c.createdAt).toBe(1000)
  })

  it('updates fields', () => {
    const id = customers.create(baseCustomer)
    customers.update(id, { name: '李四', addressDetail: '高新南' })
    const c = customers.get(id)!
    expect(c.name).toBe('李四')
    expect(c.addressDetail).toBe('高新南')
  })

  it('list returns ticketCount per customer', () => {
    const id = customers.create(baseCustomer)
    const tickets = new TicketRepo(db, () => 1)
    tickets.create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    tickets.setCustomer('AS-1', id)
    const row = customers.list().find((r) => r.id === id)!
    expect(row.ticketCount).toBe(1)
  })

  it('searches by nickname/name/region/detail', () => {
    customers.create(baseCustomer)
    expect(customers.search('张三').length).toBe(1)
    expect(customers.search('南山').length).toBe(1)
    expect(customers.search('科技园').length).toBe(1)
    expect(customers.search('不存在').length).toBe(0)
  })

  it('delete nulls the customer_id of linked tickets', () => {
    const id = customers.create(baseCustomer)
    const tickets = new TicketRepo(db, () => 1)
    tickets.create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    tickets.setCustomer('AS-1', id)
    customers.delete(id)
    expect(customers.get(id)).toBeUndefined()
    expect(tickets.get('AS-1')!.customerId).toBeNull()
  })

  it('ticketsOf returns the customer linked tickets', () => {
    const id = customers.create(baseCustomer)
    const tickets = new TicketRepo(db, () => 1)
    tickets.create({ aftersaleNo: 'AS-9', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    tickets.setCustomer('AS-9', id)
    expect(customers.ticketsOf(id).map((t) => t.aftersaleNo)).toEqual(['AS-9'])
  })
})
```
(Depends on `TicketRepo.setCustomer` + `Ticket.customerId` — implemented in Task 4. To keep this task self-contained and TDD-honest, implement Task 4 BEFORE running these specific cross-repo cases, OR implement Task 4 first. Recommended order: do Task 4 then Task 3. If executing in numeric order, this task's `setCustomer`/`customerId` references will fail until Task 4 — so SWAP: do Task 4 before Task 3.)

> **Execution note:** Do **Task 4 before Task 3** (Task 3 tests use `TicketRepo.setCustomer` and `Ticket.customerId`).

- [ ] **Step 2: run, confirm FAIL** — `npx vitest run tests/db/customers.test.ts` → FAIL (CustomerRepo missing).

- [ ] **Step 3: implement** `src/main/db/customers.ts`
```ts
import type { Database } from 'better-sqlite3'
import type { Customer, NewCustomer, CustomerRow, Ticket } from '../../shared/types'

type Now = () => number

const ROW = `id, nickname, name,
  province_code AS provinceCode, province, city_code AS cityCode, city,
  district_code AS districtCode, district, address_detail AS addressDetail,
  created_at AS createdAt, updated_at AS updatedAt`

const TICKET_ROW = `aftersale_no AS aftersaleNo, order_no AS orderNo, shipping_no AS shippingNo,
  return_no AS returnNo, status, note, created_at AS createdAt, updated_at AS updatedAt, customer_id AS customerId`

export class CustomerRepo {
  constructor(private db: Database, private now: Now = () => Date.now()) {}

  create(c: NewCustomer): number {
    const ts = this.now()
    const info = this.db.prepare(
      `INSERT INTO customers (nickname, name, province_code, province, city_code, city, district_code, district, address_detail, created_at, updated_at)
       VALUES (@nickname, @name, @provinceCode, @province, @cityCode, @city, @districtCode, @district, @addressDetail, @ts, @ts)`
    ).run({ ...c, ts })
    return Number(info.lastInsertRowid)
  }

  update(id: number, patch: Partial<NewCustomer>): void {
    const cur = this.get(id)
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: this.now() }
    this.db.prepare(
      `UPDATE customers SET nickname=@nickname, name=@name, province_code=@provinceCode, province=@province,
       city_code=@cityCode, city=@city, district_code=@districtCode, district=@district,
       address_detail=@addressDetail, updated_at=@updatedAt WHERE id=@id`
    ).run({ ...next, id })
  }

  get(id: number): Customer | undefined {
    return this.db.prepare(`SELECT ${ROW} FROM customers WHERE id = ?`).get(id) as Customer | undefined
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM customers WHERE id = ?').run(id)
  }

  list(): CustomerRow[] {
    return this.db.prepare(
      `SELECT ${ROW}, (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = customers.id) AS ticketCount
       FROM customers ORDER BY updated_at DESC`
    ).all() as CustomerRow[]
  }

  search(query: string): CustomerRow[] {
    const q = query.trim()
    if (!q) return this.list()
    const like = `%${q}%`
    return this.db.prepare(
      `SELECT ${ROW}, (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = customers.id) AS ticketCount
       FROM customers
       WHERE nickname LIKE ? OR name LIKE ? OR province LIKE ? OR city LIKE ? OR district LIKE ? OR address_detail LIKE ?
       ORDER BY updated_at DESC`
    ).all(like, like, like, like, like, like) as CustomerRow[]
  }

  ticketsOf(id: number): Ticket[] {
    return this.db.prepare(`SELECT ${TICKET_ROW} FROM tickets WHERE customer_id = ? ORDER BY updated_at DESC`).all(id) as Ticket[]
  }
}
```

- [ ] **Step 4: run, confirm PASS + full suite** — `npx vitest run tests/db/customers.test.ts` → PASS; `npx vitest run` → green.

- [ ] **Step 5: commit**
```bash
git add src/main/db/customers.ts tests/db/customers.test.ts
git commit -m "feat: CustomerRepo (CRUD + ticketCount + search + ticketsOf)"
```

---

## Task 4: TicketRepo — customerId + setCustomer  (execute BEFORE Task 3)

**Files:** Modify `src/main/db/tickets.ts`; Test `tests/db/tickets.test.ts`

- [ ] **Step 1: failing test** (append inside the existing `describe('TicketRepo', ...)`)
```ts
  it('new tickets have a null customerId', () => {
    repo.create({ aftersaleNo: 'C-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect(repo.get('C-1')!.customerId).toBeNull()
  })
  it('setCustomer links and unlinks a customer', () => {
    repo.create({ aftersaleNo: 'C-2', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.setCustomer('C-2', 7)
    expect(repo.get('C-2')!.customerId).toBe(7)
    repo.setCustomer('C-2', null)
    expect(repo.get('C-2')!.customerId).toBeNull()
  })
```
(Note: this test sets customerId=7 without a real customer row; since the test db has `foreign_keys=ON`, a FK to a missing customers row would fail. So the test must create a customer first OR the FK is deferred. To keep this test independent of CustomerRepo, create the customers row directly: add at the top of the `setCustomer` test `db.prepare("INSERT INTO customers (id, created_at, updated_at) VALUES (7, 1, 1)").run()`. Insert that line before `repo.setCustomer('C-2', 7)`.)

- [ ] **Step 2: run, confirm FAIL** — `npx vitest run tests/db/tickets.test.ts` → FAIL.

- [ ] **Step 3: implement** in `src/main/db/tickets.ts`:
1. Extend `ROW` to include customerId:
```ts
const ROW = `aftersale_no AS aftersaleNo, order_no AS orderNo, shipping_no AS shippingNo,
  return_no AS returnNo, status, note, created_at AS createdAt, updated_at AS updatedAt, customer_id AS customerId`
```
2. Extend the explicit projection in `search` to also select `t.customer_id AS customerId` (add it after `t.updated_at AS updatedAt`):
```ts
      `SELECT t.aftersale_no AS aftersaleNo, t.order_no AS orderNo, t.shipping_no AS shippingNo,
       t.return_no AS returnNo, t.status, t.note, t.created_at AS createdAt, t.updated_at AS updatedAt, t.customer_id AS customerId
       FROM tickets_fts f
       JOIN tickets t ON t.rowid = f.rowid
       WHERE tickets_fts MATCH ? ORDER BY t.updated_at DESC`
```
3. Add a `setCustomer` method (after `update`):
```ts
  setCustomer(aftersaleNo: string, customerId: number | null): void {
    this.db.prepare('UPDATE tickets SET customer_id = ?, updated_at = ? WHERE aftersale_no = ?')
      .run(customerId, this.now(), aftersaleNo)
  }
```
(No FTS resync needed — customer is not an FTS-indexed field.)

- [ ] **Step 4: run, confirm PASS + full suite** — `npx vitest run tests/db/tickets.test.ts` → PASS; `npx vitest run` → green.

- [ ] **Step 5: commit**
```bash
git add src/main/db/tickets.ts tests/db/tickets.test.ts
git commit -m "feat: TicketRepo customerId projection + setCustomer"
```

---

## Task 5: 行政区数据集 + region.ts

**Files:** Create `scripts/gen-divisions.mjs`, `src/renderer/china-divisions.json`, `src/renderer/region.ts`; Test `tests/renderer/region.test.ts`

- [ ] **Step 1: install a source dataset + generate the bundled JSON**

Install the maintained `china-division` package and generate a flat `{code,name,parent}[]` (province parent='', city parent=provinceCode, district parent=cityCode):
```bash
npm i -D china-division
```
Create `scripts/gen-divisions.mjs`:
```js
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

// china-division ships dist/pca-code.json: array of provinces
//   { code, name, children: [ { code, name, children: [ { code, name } ] } ] }
const pkgPath = require.resolve('china-division/dist/pca-code.json')
const provinces = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const out = []
for (const p of provinces) {
  out.push({ code: p.code, name: p.name, parent: '' })
  for (const c of p.children ?? []) {
    out.push({ code: c.code, name: c.name, parent: p.code })
    for (const d of c.children ?? []) {
      out.push({ code: d.code, name: d.name, parent: c.code })
    }
  }
}
writeFileSync('src/renderer/china-divisions.json', JSON.stringify(out))
console.log('wrote', out.length, 'regions')
```
Run it:
```bash
node scripts/gen-divisions.mjs
```
Verify the output is well-formed:
```bash
node -e "const a=require('./src/renderer/china-divisions.json'); const prov=a.filter(r=>r.parent===''); console.log('provinces',prov.length,'total',a.length); const gd=prov.find(p=>p.name.includes('广东')); console.log('gd',!!gd); const cities=a.filter(r=>r.parent===gd.code); console.log('gd cities',cities.length>0); const ds=a.filter(r=>r.parent===cities[0].code); console.log('first-city districts',ds.length>0)"
```
Expected: provinces ~34, total a few thousand, `gd true`, `gd cities true`, `first-city districts true`.
> If `china-division/dist/pca-code.json` has a different shape, adapt the flatten loop to the actual nested structure (inspect the file). The acceptance is the verification line above passing.

- [ ] **Step 2: failing test** `tests/renderer/region.test.ts` (tests the PURE helpers against fixtures — no dependency on the big JSON)
```ts
import { describe, it, expect } from 'vitest'
import { childrenOfIn, regionLabel, type Region } from '../../src/renderer/region'

const fixture: Region[] = [
  { code: '44', name: '广东省', parent: '' },
  { code: '11', name: '北京市', parent: '' },
  { code: '4403', name: '深圳市', parent: '44' },
  { code: '440305', name: '南山区', parent: '4403' }
]

describe('childrenOfIn', () => {
  it('returns top-level provinces for empty parent', () => {
    expect(childrenOfIn(fixture, '').map((r) => r.name)).toEqual(['广东省', '北京市'])
  })
  it('returns cities of a province', () => {
    expect(childrenOfIn(fixture, '44').map((r) => r.name)).toEqual(['深圳市'])
  })
  it('returns districts of a city', () => {
    expect(childrenOfIn(fixture, '4403').map((r) => r.name)).toEqual(['南山区'])
  })
})

describe('regionLabel', () => {
  it('joins non-empty parts with separators', () => {
    expect(regionLabel({ province: '广东省', city: '深圳市', district: '南山区' })).toBe('广东省 · 深圳市 · 南山区')
  })
  it('omits empty parts', () => {
    expect(regionLabel({ province: '广东省', city: '', district: '' })).toBe('广东省')
  })
  it('returns empty string when all empty', () => {
    expect(regionLabel({})).toBe('')
  })
})
```

- [ ] **Step 3: run, confirm FAIL** — `npx vitest run tests/renderer/region.test.ts` → FAIL (module missing).

- [ ] **Step 4: implement** `src/renderer/region.ts`
```ts
export interface Region { code: string; name: string; parent: string }

/** Pure: children of `parentCode` within `list` (parent '' = top-level provinces). */
export function childrenOfIn(list: Region[], parentCode: string): Region[] {
  return list.filter((r) => r.parent === parentCode)
}

/** Pure: join non-empty province/city/district with ' · '. */
export function regionLabel(parts: { province?: string; city?: string; district?: string }): string {
  return [parts.province, parts.city, parts.district].filter((s) => s && s.length > 0).join(' · ')
}

import data from './china-divisions.json'
const ALL = data as Region[]

/** Children of `parentCode` in the bundled dataset (default '' = provinces). */
export function childrenOf(parentCode = ''): Region[] {
  return childrenOfIn(ALL, parentCode)
}
```
(`resolveJsonModule` is needed for the JSON import; tsconfig has `"strict": true` but JSON import requires `resolveJsonModule`. If `npm run build`/tsc errors on the JSON import, add `"resolveJsonModule": true` to `tsconfig.json` compilerOptions.)

- [ ] **Step 5: run, confirm PASS + full suite** — `npx vitest run tests/renderer/region.test.ts` → PASS; `npx vitest run` → green; `npm run build` → clean.

- [ ] **Step 6: commit**
```bash
git add scripts/gen-divisions.mjs src/renderer/china-divisions.json src/renderer/region.ts tests/renderer/region.test.ts package.json package-lock.json tsconfig.json
git commit -m "feat: bundled china divisions dataset + region helpers"
```

---

## Task 6: IPC + Preload

**Files:** Modify `src/main/ipc.ts`, `src/preload/index.ts`

- [ ] **Step 1: ipc.ts** — add `import { CustomerRepo } from './db/customers'`, construct `const customerRepo = new CustomerRepo(db)` next to the other repos, and register handlers (place after the `tickets:*` handlers):
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
(`tickets` is the existing `TicketRepo` instance variable in registerIpc.)

- [ ] **Step 2: preload** — add types to the import and expose methods. In `src/preload/index.ts` add to the type import `Customer, NewCustomer, CustomerRow` and add to the `api` object:
```ts
  listCustomers: (): Promise<CustomerRow[]> => ipcRenderer.invoke('customers:list'),
  searchCustomers: (q: string): Promise<CustomerRow[]> => ipcRenderer.invoke('customers:search', q),
  getCustomer: (id: number): Promise<Customer | undefined> => ipcRenderer.invoke('customers:get', id),
  createCustomer: (c: NewCustomer): Promise<number> => ipcRenderer.invoke('customers:create', c),
  updateCustomer: (id: number, patch: Partial<NewCustomer>): Promise<void> => ipcRenderer.invoke('customers:update', id, patch),
  deleteCustomer: (id: number): Promise<void> => ipcRenderer.invoke('customers:delete', id),
  customerTickets: (id: number): Promise<Ticket[]> => ipcRenderer.invoke('customers:ticketsOf', id),
  setTicketCustomer: (no: string, customerId: number | null): Promise<void> => ipcRenderer.invoke('tickets:setCustomer', no, customerId)
```
(`Ticket` is already imported in preload.)

- [ ] **Step 3: verify** — `npm run build` → clean; `npx vitest run` → green.

- [ ] **Step 4: commit**
```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat: customer IPC + preload (CRUD, ticketsOf, setTicketCustomer)"
```

---

## Task 7: App 重构为 tabs 外壳 + TicketsView

**Files:** Create `src/renderer/views/TicketsView.tsx`; Modify `src/renderer/App.tsx`

- [ ] **Step 1: create `src/renderer/views/TicketsView.tsx`** — move the current ticket list/detail logic out of App into this view, add its own `SearchBar`, and accept a `jumpTo` prop (open a ticket's detail when set):
```tsx
import { useEffect, useState } from 'react'
import type { NewTicket, Ticket } from '@shared/types'
import { api } from '../api'
import { SearchBar } from '../components/SearchBar'
import { TicketTable } from '../components/TicketTable'
import { TicketDetail } from '../components/TicketDetail'
import { NewTicketDialog } from '../components/NewTicketDialog'
import { IconClose } from '../components/icons'

export function TicketsView({ jumpTo, onJumpHandled }: { jumpTo?: string; onJumpHandled: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selected, setSelected] = useState<string | undefined>()
  const [newOpen, setNewOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load(q = query) { setTickets(q ? await api.searchTickets(q) : await api.listTickets()) }
  useEffect(() => { load('') }, [])

  useEffect(() => {
    if (jumpTo) { setSelected(jumpTo); setView('detail'); onJumpHandled() }
  }, [jumpTo])

  function onSearch(q: string) { setQuery(q); load(q) }

  async function createTicket(t: NewTicket) {
    try { await api.createTicket(t); setNewOpen(false); setError(null); await load() }
    catch (e) { setError(`创建失败:${(e as Error).message}`) }
  }

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="flex animate-slidedown items-center justify-between gap-3 border-b border-danger-soft bg-danger-soft px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button className="rounded p-1 hover:bg-white/40" onClick={() => setError(null)} aria-label="关闭"><IconClose className="text-[14px]" /></button>
        </div>
      )}
      {view === 'detail' && selected ? (
        <div className="flex-1 overflow-auto">
          <TicketDetail
            aftersaleNo={selected}
            onBack={() => setView('list')}
            onChanged={() => load()}
            onDeleted={() => { setView('list'); load() }}
          />
        </div>
      ) : (
        <>
          <div className="border-b border-line bg-paper-2 px-6 py-3"><div className="max-w-xl"><SearchBar onSearch={onSearch} /></div></div>
          <div className="flex-1 overflow-auto">
            <TicketTable tickets={tickets} query={query} onOpen={(no) => { setSelected(no); setView('detail') }} onNew={() => setNewOpen(true)} />
          </div>
        </>
      )}
      <NewTicketDialog open={newOpen} onCreate={createTicket} onCancel={() => setNewOpen(false)} />
    </div>
  )
}
```

- [ ] **Step 2: rewrite `src/renderer/App.tsx`** to the tabs shell:
```tsx
import { useState } from 'react'
import { SettingsDialog } from './components/SettingsDialog'
import { TicketsView } from './views/TicketsView'
import { CustomersView } from './views/CustomersView'
import { IconSettings, IconBox } from './components/icons'

type Tab = 'tickets' | 'customers'

export default function App() {
  const [tab, setTab] = useState<Tab>('tickets')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [jumpTicket, setJumpTicket] = useState<string | undefined>()

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl2 bg-accent text-white shadow-sm"><IconBox className="text-[18px]" /></span>
          <div className="leading-tight">
            <div className="font-display text-[17px] font-extrabold tracking-tight">vhelper</div>
            <div className="-mt-0.5 text-[11px] text-muted">售后材料管理</div>
          </div>
        </div>
        <nav className="ml-2 inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          <button className={`rounded-md px-3 py-1.5 ${tab === 'tickets' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setTab('tickets')}>售后单</button>
          <button className={`rounded-md px-3 py-1.5 ${tab === 'customers' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setTab('customers')}>客户</button>
        </nav>
        <div className="flex-1" />
        <button className="btn-ghost shrink-0 px-3" onClick={() => setSettingsOpen(true)} aria-label="设置">
          <IconSettings className="text-[16px]" /><span className="hidden sm:inline">设置</span>
        </button>
      </header>

      <main className="flex-1 overflow-hidden">
        {tab === 'tickets'
          ? <TicketsView jumpTo={jumpTicket} onJumpHandled={() => setJumpTicket(undefined)} />
          : <CustomersView onOpenTicket={(no) => { setJumpTicket(no); setTab('tickets') }} />}
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
```
(The `SearchBar` import moves into TicketsView; `NewTicketDialog`/`TicketTable`/`TicketDetail` are no longer imported by App.)

- [ ] **Step 3: verify** — `CustomersView` doesn't exist yet, so `npm run build` will fail on its import until Task 8. To keep this task green: create a minimal placeholder `src/renderer/views/CustomersView.tsx` now and flesh it out in Task 8:
```tsx
export function CustomersView({ onOpenTicket }: { onOpenTicket: (no: string) => void }) {
  void onOpenTicket
  return <div className="p-6 text-sm text-muted">客户模块开发中…</div>
}
```
Then `npm run build` → clean; `npx vitest run` → green (existing renderer tests for SearchBar/TicketTable/etc unaffected; App has no test).

- [ ] **Step 4: commit**
```bash
git add src/renderer/App.tsx src/renderer/views/TicketsView.tsx src/renderer/views/CustomersView.tsx
git commit -m "feat: tabs shell (售后单/客户) + extract TicketsView"
```

---

## Task 8: CustomerTable + CustomersView 列表

**Files:** Create `src/renderer/components/CustomerTable.tsx`; Modify `src/renderer/views/CustomersView.tsx`; Test `tests/renderer/CustomerTable.test.tsx`

- [ ] **Step 1: failing test** `tests/renderer/CustomerTable.test.tsx`
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { CustomerRow } from '../../src/shared/types'
import { CustomerTable } from '../../src/renderer/components/CustomerTable'

afterEach(() => cleanup())

function mk(n: number): CustomerRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1, nickname: 'nick' + (i + 1), name: '客户' + (i + 1),
    provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市',
    districtCode: '440305', district: '南山区', addressDetail: '', ticketCount: i,
    createdAt: i, updatedAt: i
  }))
}

describe('CustomerTable', () => {
  it('renders rows with region label and total', () => {
    render(<CustomerTable customers={mk(3)} query="" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('共 3 条')).toBeTruthy()
    expect(screen.getAllByText('广东省 · 深圳市 · 南山区').length).toBe(3)
  })
  it('calls onOpen with the customer id on row click', () => {
    const onOpen = vi.fn()
    render(<CustomerTable customers={mk(3)} query="" onOpen={onOpen} onNew={() => {}} />)
    fireEvent.click(screen.getByText('客户2'))
    expect(onOpen).toHaveBeenCalledWith(2)
  })
  it('shows empty state', () => {
    render(<CustomerTable customers={[]} query="" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('暂无客户')).toBeTruthy()
  })
})
```

- [ ] **Step 2: run, confirm FAIL** — `npx vitest run tests/renderer/CustomerTable.test.tsx` → FAIL.

- [ ] **Step 3: implement** `src/renderer/components/CustomerTable.tsx` (mirrors `TicketTable`)
```tsx
import { useEffect, useState } from 'react'
import type { CustomerRow } from '@shared/types'
import { paginate, formatTime } from '../table'
import { regionLabel } from '../region'
import { IconBox, IconPlus } from './icons'

interface Props { customers: CustomerRow[]; query: string; onOpen: (id: number) => void; onNew: () => void }
const SIZES = [10, 20, 50]

export function CustomerTable({ customers, query, onOpen, onNew }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [query])

  const total = customers.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  const rows = paginate(customers, current, pageSize)

  return (
    <div className="p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-sm font-bold tracking-tight text-ink">客户</span>
          <span className="tnum text-xs text-muted">{total}</span>
        </div>
        <button className="btn-primary px-3 py-1.5 text-sm" onClick={onNew}><IconPlus className="text-[15px]" /> 新建客户</button>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-line bg-surface py-20 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-paper-2 text-muted"><IconBox className="text-2xl" /></div>
          <p className="text-sm text-muted">暂无客户</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <div className="max-h-[calc(100vh-220px)] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-2 text-[11px] uppercase tracking-wider text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-left font-medium">昵称</th>
                  <th className="px-4 py-2.5 text-left font-medium">姓名</th>
                  <th className="px-4 py-2.5 text-left font-medium">地区</th>
                  <th className="px-4 py-2.5 text-left font-medium">关联售后单</th>
                  <th className="px-4 py-2.5 text-left font-medium">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.id}
                    className="animate-rise cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-paper-2"
                    style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
                    onClick={() => onOpen(c.id)}>
                    <td className="px-4 py-3 text-ink">{c.nickname || '—'}</td>
                    <td className="px-4 py-3 text-ink">{c.name || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{regionLabel(c) || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{c.ticketCount}</td>
                    <td className="px-4 py-3 text-muted">{formatTime(c.updatedAt)}</td>
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
(`regionLabel(c)` works because `CustomerRow` has `province/city/district` string fields matching the `regionLabel` param shape.)

- [ ] **Step 4: run, confirm PASS** — `npx vitest run tests/renderer/CustomerTable.test.tsx` → PASS.

- [ ] **Step 5: flesh out `src/renderer/views/CustomersView.tsx`** (list + detail + new/edit dialog wiring; `CustomerDetail`/`CustomerDialog` come in Tasks 9–10 — for now wire list + dialog stubs that exist after those tasks). Implement the full view now using components built in Tasks 9–10; to keep ordering simple, IMPLEMENT TASKS 9 AND 10 FIRST, then return here. CustomersView final form:
```tsx
import { useEffect, useState } from 'react'
import type { Customer, CustomerRow, NewCustomer } from '@shared/types'
import { api } from '../api'
import { SearchBar } from '../components/SearchBar'
import { CustomerTable } from '../components/CustomerTable'
import { CustomerDetail } from '../components/CustomerDetail'
import { CustomerDialog } from '../components/CustomerDialog'

export function CustomersView({ onOpenTicket }: { onOpenTicket: (no: string) => void }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selected, setSelected] = useState<number | undefined>()
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Customer }>({ open: false })

  async function load(q = query) { setCustomers(q ? await api.searchCustomers(q) : await api.listCustomers()) }
  useEffect(() => { load('') }, [])
  function onSearch(q: string) { setQuery(q); load(q) }

  async function save(c: NewCustomer) {
    if (dialog.editing) await api.updateCustomer(dialog.editing.id, c)
    else await api.createCustomer(c)
    setDialog({ open: false })
    await load()
  }

  return (
    <div className="flex h-full flex-col">
      {view === 'detail' && selected != null ? (
        <div className="flex-1 overflow-auto">
          <CustomerDetail
            id={selected}
            onBack={() => setView('list')}
            onEdit={(c) => setDialog({ open: true, editing: c })}
            onDeleted={() => { setView('list'); load() }}
            onOpenTicket={onOpenTicket}
          />
        </div>
      ) : (
        <>
          <div className="border-b border-line bg-paper-2 px-6 py-3"><div className="max-w-xl"><SearchBar onSearch={onSearch} /></div></div>
          <div className="flex-1 overflow-auto">
            <CustomerTable customers={customers} query={query} onOpen={(id) => { setSelected(id); setView('detail') }} onNew={() => setDialog({ open: true })} />
          </div>
        </>
      )}
      <CustomerDialog open={dialog.open} editing={dialog.editing} onSave={save} onCancel={() => setDialog({ open: false })} />
    </div>
  )
}
```
> SearchBar's placeholder is the ticket one ("搜索售后单号 / 订单号 ..."). For the customer view it's acceptable to reuse, but if you prefer accuracy, pass an optional `placeholder` prop to SearchBar (defaulting to the current text) and use 「搜索昵称 / 姓名 / 地区」 here. Keep it minimal: reuse as-is is fine for phase 1.

- [ ] **Step 6: verify + commit** — `npx vitest run` green; `npm run build` clean (after Tasks 9–10 exist).
```bash
git add src/renderer/components/CustomerTable.tsx src/renderer/views/CustomersView.tsx tests/renderer/CustomerTable.test.tsx
git commit -m "feat: CustomerTable + CustomersView list"
```

---

## Task 9: CustomerDialog(级联表单)

**Files:** Create `src/renderer/components/CustomerDialog.tsx`; Test `tests/renderer/CustomerDialog.test.tsx`

- [ ] **Step 1: failing test** `tests/renderer/CustomerDialog.test.tsx`
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CustomerDialog } from '../../src/renderer/components/CustomerDialog'

afterEach(() => cleanup())

describe('CustomerDialog', () => {
  it('disables 保存 until nickname or name is filled', () => {
    render(<CustomerDialog open={true} onSave={() => {}} onCancel={() => {}} />)
    const save = screen.getByText('保存').closest('button') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('昵称'), { target: { value: '小明' } })
    expect(save.disabled).toBe(false)
  })

  it('calls onSave with a NewCustomer payload', () => {
    const onSave = vi.fn()
    render(<CustomerDialog open={true} onSave={onSave} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('姓名'), { target: { value: '张三' } })
    fireEvent.click(screen.getByText('保存'))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: '张三', nickname: '', addressDetail: '' }))
  })
})
```

- [ ] **Step 2: run, confirm FAIL** — `npx vitest run tests/renderer/CustomerDialog.test.tsx` → FAIL.

- [ ] **Step 3: implement** `src/renderer/components/CustomerDialog.tsx`
```tsx
import { useEffect, useState } from 'react'
import type { Customer, NewCustomer } from '@shared/types'
import { childrenOf } from '../region'
import { IconClose } from './icons'

interface Props { open: boolean; editing?: Customer; onSave: (c: NewCustomer) => void; onCancel: () => void }

const EMPTY: NewCustomer = {
  nickname: '', name: '', provinceCode: '', province: '', cityCode: '', city: '',
  districtCode: '', district: '', addressDetail: ''
}

export function CustomerDialog({ open, editing, onSave, onCancel }: Props) {
  const [f, setF] = useState<NewCustomer>(EMPTY)

  useEffect(() => {
    if (!open) return
    if (editing) {
      const { id, createdAt, updatedAt, ...rest } = editing
      void id; void createdAt; void updatedAt
      setF(rest)
    } else setF(EMPTY)
  }, [open, editing])

  if (!open) return null
  const valid = !!(f.nickname.trim() || f.name.trim())

  const provinces = childrenOf('')
  const cities = f.provinceCode ? childrenOf(f.provinceCode) : []
  const districts = f.cityCode ? childrenOf(f.cityCode) : []

  function pickProvince(code: string) {
    const r = provinces.find((x) => x.code === code)
    setF({ ...f, provinceCode: code, province: r?.name ?? '', cityCode: '', city: '', districtCode: '', district: '' })
  }
  function pickCity(code: string) {
    const r = cities.find((x) => x.code === code)
    setF({ ...f, cityCode: code, city: r?.name ?? '', districtCode: '', district: '' })
  }
  function pickDistrict(code: string) {
    const r = districts.find((x) => x.code === code)
    setF({ ...f, districtCode: code, district: r?.name ?? '' })
  }

  const selCls = 'rounded-lg border border-line bg-surface px-2 py-2 text-sm'

  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">{editing ? '编辑客户' : '新建客户'}</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onCancel} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">昵称</span>
            <input className="field" value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} placeholder="昵称" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">姓名</span>
            <input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="姓名" />
          </label>
          <div>
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">地区</span>
            <div className="grid grid-cols-3 gap-2">
              <select className={selCls} value={f.provinceCode} onChange={(e) => pickProvince(e.target.value)}>
                <option value="">省</option>
                {provinces.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
              <select className={selCls} value={f.cityCode} disabled={!f.provinceCode} onChange={(e) => pickCity(e.target.value)}>
                <option value="">市</option>
                {cities.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
              <select className={selCls} value={f.districtCode} disabled={!f.cityCode} onChange={(e) => pickDistrict(e.target.value)}>
                <option value="">区县</option>
                {districts.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">详细地址</span>
            <input className="field" value={f.addressDetail} onChange={(e) => setF({ ...f, addressDetail: e.target.value })} placeholder="详细地址" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!valid} onClick={() => onSave(f)}>保存</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: run, confirm PASS + full suite + build** — `npx vitest run tests/renderer/CustomerDialog.test.tsx` → PASS; `npx vitest run` → green; `npm run build` → clean.

- [ ] **Step 5: commit**
```bash
git add src/renderer/components/CustomerDialog.tsx tests/renderer/CustomerDialog.test.tsx
git commit -m "feat: CustomerDialog with province/city/district cascader"
```

---

## Task 10: CustomerDetail

**Files:** Create `src/renderer/components/CustomerDetail.tsx`

- [ ] **Step 1: implement** `src/renderer/components/CustomerDetail.tsx` (manual-verified; no unit test — it's IPC-driven and exercised in dev)
```tsx
import { useEffect, useState } from 'react'
import type { Customer, Ticket } from '@shared/types'
import { api } from '../api'
import { regionLabel } from '../region'
import { STATUS_META } from '../status'
import { formatTime } from '../table'

interface Props { id: number; onBack: () => void; onEdit: (c: Customer) => void; onDeleted: () => void; onOpenTicket: (no: string) => void }

export function CustomerDetail({ id, onBack, onEdit, onDeleted, onOpenTicket }: Props) {
  const [customer, setCustomer] = useState<Customer | undefined>()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function reload() {
    setCustomer(await api.getCustomer(id))
    setTickets(await api.customerTickets(id))
  }
  useEffect(() => { setConfirmDelete(false); reload() }, [id])

  if (!customer) return null
  const region = regionLabel(customer)
  const fullAddress = [region, customer.addressDetail].filter(Boolean).join(' ')

  async function remove() { await api.deleteCustomer(id); onDeleted() }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-paper-2 px-6 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <button className="btn-ghost mt-0.5 px-2.5" onClick={onBack} aria-label="返回">← 返回</button>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">客户</div>
            <h2 className="mt-0.5 truncate font-display text-2xl font-extrabold tracking-tight text-ink">{customer.name || customer.nickname || '未命名'}</h2>
          </div>
          <button className="btn-ghost ml-auto mt-0.5 px-2.5" onClick={() => onEdit(customer)}>编辑</button>
          <button className="btn-danger mt-0.5 px-2.5" onClick={() => setConfirmDelete(true)}>删除</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm text-ink-soft">
          <span className="numchip"><span className="text-[11px] text-muted">昵称</span><span>{customer.nickname || '—'}</span></span>
          <span className="numchip"><span className="text-[11px] text-muted">地址</span><span>{fullAddress || '—'}</span></span>
        </div>
      </div>

      {confirmDelete && (
        <div className="flex animate-slidedown items-center justify-between gap-3 border-b border-danger-soft bg-danger-soft px-6 py-2.5 text-sm text-danger">
          <span>确认删除该客户?其关联售后单将解除关联(不删除售后单)。</span>
          <span className="flex shrink-0 gap-2">
            <button className="btn-danger-solid px-3 py-1.5 text-xs" onClick={remove}>确认删除</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>取消</button>
          </span>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-2 text-sm font-medium text-ink-soft">关联售后单 <span className="tnum text-muted">{tickets.length}</span></div>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted">暂无关联售后单</p>
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

- [ ] **Step 2: verify + commit** — `npm run build` → clean; `npx vitest run` → green.
```bash
git add src/renderer/components/CustomerDetail.tsx
git commit -m "feat: CustomerDetail with linked tickets + delete"
```

---

## Task 11: 售后单关联客户(CustomerPicker + TicketDetail)

**Files:** Create `src/renderer/components/CustomerPicker.tsx`; Modify `src/renderer/components/TicketDetail.tsx`

- [ ] **Step 1: implement `src/renderer/components/CustomerPicker.tsx`** (search existing + select; "新建客户" is out of this picker's scope for phase 1 — link to an existing customer; create customers in the 客户 tab)
```tsx
import { useEffect, useState } from 'react'
import type { CustomerRow } from '@shared/types'
import { api } from '../api'
import { regionLabel } from '../region'
import { IconClose, IconSearch } from './icons'

interface Props { open: boolean; onPick: (id: number) => void; onCancel: () => void }

export function CustomerPicker({ open, onPick, onCancel }: Props) {
  const [rows, setRows] = useState<CustomerRow[]>([])
  useEffect(() => { if (open) api.listCustomers().then(setRows) }, [open])
  if (!open) return null

  async function search(q: string) { setRows(q ? await api.searchCustomers(q) : await api.listCustomers()) }

  return (
    <div className="scrim" onClick={onCancel}>
      <div className="modal-card max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">关联客户</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onCancel} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>
        <div className="relative mb-3">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-muted" />
          <input className="field pl-9" placeholder="搜索昵称 / 姓名 / 地区" onChange={(e) => search(e.target.value)} autoFocus />
        </div>
        <div className="max-h-72 overflow-auto rounded-lg border border-line">
          {rows.length === 0 ? <div className="p-4 text-center text-sm text-muted">无客户,请先在「客户」中新建</div> : rows.map((c) => (
            <button key={c.id} className="block w-full border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-paper-2" onClick={() => onPick(c.id)}>
              <div className="text-sm text-ink">{c.name || c.nickname || '未命名'}</div>
              <div className="text-xs text-muted">{regionLabel(c) || '—'}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```
(`IconSearch` exists in `./icons`.)

- [ ] **Step 2: wire into `src/renderer/components/TicketDetail.tsx`** — show a 客户 row and link control. Add:
1. imports:
```ts
import type { Customer } from '@shared/types'
import { CustomerPicker } from './CustomerPicker'
```
2. state (with the other `useState`s):
```ts
  const [customer, setCustomer] = useState<Customer | undefined>()
  const [pickerOpen, setPickerOpen] = useState(false)
```
3. In `reload()`, after `setTicket(t)`, also load the linked customer:
```ts
    setCustomer(t && t.customerId != null ? await api.getCustomer(t.customerId) : undefined)
```
   (Place this AFTER the `if (currentNo.current !== aftersaleNo) return` guard, using the freshly fetched `t`.)
4. Add link handlers:
```ts
  async function linkCustomer(id: number) { await api.setTicketCustomer(aftersaleNo, id); setPickerOpen(false); await reload() }
  async function unlinkCustomer() { await api.setTicketCustomer(aftersaleNo, null); await reload() }
```
5. In the header, after the number-chips `<div className="mt-3 flex flex-wrap gap-2">...</div>`, add a 客户 row:
```tsx
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="text-[11px] text-muted">客户</span>
          <span className="text-ink-soft">{customer ? (customer.name || customer.nickname || '未命名') : '未关联'}</span>
          <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setPickerOpen(true)}>{customer ? '更换' : '关联'}</button>
          {customer && <button className="btn-ghost px-2 py-0.5 text-xs" onClick={unlinkCustomer}>取消关联</button>}
        </div>
```
6. Before the closing `</div>` of the component (next to `<NewMaterialDialog .../>`), add:
```tsx
      <CustomerPicker open={pickerOpen} onPick={linkCustomer} onCancel={() => setPickerOpen(false)} />
```

- [ ] **Step 3: verify** — `npm run build` → clean; `npx vitest run` → green (TicketDetail has no unit test; existing tests unaffected).

- [ ] **Step 4: commit**
```bash
git add src/renderer/components/CustomerPicker.tsx src/renderer/components/TicketDetail.tsx
git commit -m "feat: link a customer to a ticket (picker + TicketDetail 客户 row)"
```

---

## Task 12: dev 真机验证

**Files:** 无

- [ ] **Step 1:** `npm run rebuild:electron` → `npm run dev`
- [ ] **Step 2: 手动验证清单**
  1. 顶部「售后单 / 客户」切换。
  2. 客户 tab:新建客户(填昵称/姓名 + 省→市→区级联 + 详细地址)→ 列表出现,地区列显示「省 · 市 · 区」。
  3. 客户搜索(昵称/姓名/地区)过滤;分页(10/20/50)。
  4. 客户详情:看信息、编辑(级联回填)、关联售后单列表;点关联售后单 → 跳到售后单 tab 并打开该单。
  5. 售后单详情:「客户」行 → 关联(选现有客户)→ 显示客户名;「更换」「取消关联」。
  6. 删除客户 → 确认 → 其关联售后单在售后单详情里变「未关联」。
- [ ] **Step 3:** `npm run rebuild:node` → `npx vitest run` 仍全绿。

---

## Self-Review 记录

- **Spec 覆盖**:customers 表 + ticket.customer_id 迁移 → Task 2;结构化地址(code+name)→ Task 1/3;CustomerRepo(CRUD/count/search/ticketsOf/delete SET NULL)→ Task 3;TicketRepo customerId + setCustomer → Task 4;行政区数据集 + 级联纯函数 → Task 5;IPC/preload → Task 6;tabs 外壳 + TicketsView/CustomersView → Task 7/8;CustomerTable → Task 8;CustomerDialog 级联 → Task 9;CustomerDetail + 关联售后单跳转 → Task 10;售后单关联客户(picker)→ Task 11;校验(昵称/姓名至少一个、改省清空下级)→ Task 9;dev 手验 → Task 12。
- **执行顺序提醒**:**先 Task 4 再 Task 3**(Task 3 测试用到 `setCustomer`/`customerId`);**Task 8 的 CustomersView 完整体依赖 Task 9/10 的组件**,故顺序建议 7(含 CustomersView 占位)→ 9 → 10 → 8(完整 CustomersView)→ 11,或按编号执行但在 8 完成前 CustomersView 用占位。
- **类型一致性**:`Customer`/`NewCustomer`/`CustomerRow`(Task 1)贯穿 repo(3)、ipc/preload(6)、组件(8/9/10/11);`Ticket.customerId`(1)在 tickets.ts 投影(4)、CustomerDetail/TicketDetail(10/11)一致;`regionLabel`/`childrenOf`(5)被 CustomerTable/Dialog/Detail/Picker 复用;preload 方法名(`listCustomers`/`searchCustomers`/`getCustomer`/`createCustomer`/`updateCustomer`/`deleteCustomer`/`customerTickets`/`setTicketCustomer`)在组件调用处一致。
- **占位符**:无(数据集生成步骤为显式脚本 + 验证命令,非占位)。
