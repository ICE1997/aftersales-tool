# 仓库层改用 Knex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把四个仓库(Ticket/Material/Folder/Stats)从 raw better-sqlite3 改为通过一个长生命 Knex 实例查询;FTS5 用 knex.raw;行为不变。

**Architecture:** 因 `createDatabase` 返回类型从 `Database` 变 `Knex`,所有仓库构造参数随之改变,**源码层必须原子转换**(中间态无法编译)。故 Task 1 一次性改完源码(用 `npm run build` 验证),Task 2 改测试(用全套 `vitest` 验证)。

**Tech Stack:** Electron(main)、Knex(client better-sqlite3)、Vitest。

**ABI 提示:** 跑 vitest 前 `npm run rebuild:node`;若 db 测试报 `node_modules/knex/node_modules/better-sqlite3` 缺 build,`rm -rf node_modules/knex/node_modules/better-sqlite3` 让其回退到顶层 node-ABI 副本。

---

## File Structure
- **Modify(源码):** `src/main/db/database.ts`、`src/main/db/tickets.ts`、`src/main/db/materials.ts`、`src/main/db/folders.ts`、`src/main/db/stats.ts`、`src/main/services/importer.ts`、`src/main/services/scanner.ts`、`src/main/ipc.ts`。
- **Modify(测试):** `tests/db/helpers.ts`、`tests/db/database.test.ts`、`tests/db/tickets.test.ts`、`tests/db/materials.test.ts`、`tests/db/folders.test.ts`、`tests/db/stats.test.ts`、`tests/services/importer.test.ts`、`tests/services/scanner.test.ts`(以及任何其它 `await` 调用这些 repo 的测试)。

---

## Task 1: 源码层全部改用 Knex

**Files:** Modify 上述 8 个源码文件。本任务**不**改测试;验证用 `npm run build`(electron-vite build 只编译 src,不编译 tests)。完成后 `vitest` 会失败(测试未改),属预期,本任务不要跑 vitest。

- [ ] **Step 1: `src/main/db/database.ts`** — 整文件替换为:
```ts
import Knex from 'knex'
import type { Knex as KnexType } from 'knex'
import { dirname, join } from 'node:path'
import { runMigrations } from './migrations'

export async function createDatabase(path: string): Promise<KnexType> {
  await runMigrations(path, join(dirname(path), 'backups'))
  return Knex({
    client: 'better-sqlite3',
    connection: { filename: path },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
        conn.pragma('journal_mode = WAL')
        conn.pragma('foreign_keys = ON')
        done(null, conn)
      }
    }
  })
}
```

- [ ] **Step 2: `src/main/db/tickets.ts`** — 整文件替换为:
```ts
import type { Knex } from 'knex'
import type { Ticket, NewTicket, CustomerFields, AftersaleFields } from '../../shared/types'

export type { NewTicket }

type Now = () => number
type Exec = Knex | Knex.Transaction

const TICKET_COLS = {
  aftersaleNo: 'aftersale_no', orderNo: 'order_no', shippingNo: 'shipping_no', returnNo: 'return_no',
  status: 'status', note: 'note', createdAt: 'created_at', updatedAt: 'updated_at',
  recipientName: 'recipient_name', phone: 'phone',
  provinceCode: 'province_code', province: 'province', cityCode: 'city_code', city: 'city',
  districtCode: 'district_code', district: 'district', addressDetail: 'address_detail', extension: 'extension',
  aftersaleType: 'aftersale_type', aftersaleReason: 'aftersale_reason', shippingStatus: 'shipping_status',
  amount: 'amount', refundAmount: 'refund_amount', appliedAt: 'applied_at', returnLogistics: 'return_logistics'
} as const

/** Knex select map (alias -> column), optionally table-qualified. */
function selectMap(prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [alias, col] of Object.entries(TICKET_COLS)) out[alias] = prefix ? `${prefix}.${col}` : col
  return out
}

/** camelCase object -> snake_case row. */
function toRow(obj: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [alias, col] of Object.entries(TICKET_COLS)) row[col] = obj[alias]
  return row
}

const EMPTY_CUSTOMER: CustomerFields = {
  recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: ''
}
const EMPTY_AFTERSALE: AftersaleFields = {
  aftersaleType: '', aftersaleReason: '', shippingStatus: '',
  amount: null, refundAmount: null, appliedAt: null, returnLogistics: ''
}

const FTS_COLS = 'aftersale_no, order_no, shipping_no, return_no, note, recipient_name, phone, province, city, district, address_detail'

interface FtsRow {
  rowid: number
  aftersale_no: string; order_no: string; shipping_no: string; return_no: string; note: string
  recipient_name: string; phone: string
  province: string; city: string; district: string; address_detail: string
}

export class TicketRepo {
  constructor(private db: Knex, private now: Now = () => Date.now()) {}

  async create(t: NewTicket): Promise<void> {
    await this.db.transaction(async (trx) => { await this.insertOne(trx, t) })
  }

  private async insertOne(x: Exec, t: NewTicket): Promise<void> {
    const ts = this.now()
    const full = { ...EMPTY_CUSTOMER, ...EMPTY_AFTERSALE, ...t, status: t.status || '待商家处理', createdAt: ts, updatedAt: ts }
    await x('tickets').insert(toRow(full))
    await this.ftsInsert(x, t.aftersaleNo)
  }

  async update(
    aftersaleNo: string,
    patch: Partial<Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo' | 'status' | 'note'> & CustomerFields & AftersaleFields>
  ): Promise<void> {
    const cur = await this.get(aftersaleNo)
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: this.now() }
    await this.db.transaction(async (trx) => {
      await this.ftsDelete(trx, aftersaleNo)
      const row = toRow(next)
      delete row.aftersale_no
      delete row.created_at
      await trx('tickets').where('aftersale_no', aftersaleNo).update(row)
      await this.ftsInsert(trx, aftersaleNo)
    })
  }

  async existingNos(nos: string[]): Promise<Set<string>> {
    const found = new Set<string>()
    const CHUNK = 500
    for (let i = 0; i < nos.length; i += CHUNK) {
      const slice = nos.slice(i, i + CHUNK)
      if (slice.length === 0) continue
      const rows: string[] = await this.db('tickets').whereIn('aftersale_no', slice).pluck('aftersale_no')
      for (const no of rows) found.add(no)
    }
    return found
  }

  async createMany(tickets: NewTicket[]): Promise<void> {
    await this.db.transaction(async (trx) => {
      for (const t of tickets) await this.insertOne(trx, t)
    })
  }

  async delete(aftersaleNo: string): Promise<void> {
    await this.db.transaction(async (trx) => {
      await this.ftsDelete(trx, aftersaleNo)
      await trx('tickets').where('aftersale_no', aftersaleNo).del()
    })
  }

  async get(aftersaleNo: string): Promise<Ticket | undefined> {
    return (await this.db('tickets').select(selectMap()).where('aftersale_no', aftersaleNo).first()) as Ticket | undefined
  }

  async list(): Promise<Ticket[]> {
    return (await this.db('tickets').select(selectMap()).orderBy('updated_at', 'desc')) as Ticket[]
  }

  async search(query: string): Promise<Ticket[]> {
    const q = query.trim()
    if (!q) return this.list()
    const match = `"${q.replace(/"/g, '""')}"*`
    return (await this.db
      .select(selectMap('tickets'))
      .from('tickets_fts as f')
      .join('tickets', 'tickets.rowid', 'f.rowid')
      .whereRaw('tickets_fts MATCH ?', [match])
      .orderBy('tickets.updated_at', 'desc')) as Ticket[]
  }

  private async ftsInsert(x: Exec, aftersaleNo: string): Promise<void> {
    await x.raw(
      `INSERT INTO tickets_fts (rowid, ${FTS_COLS}) SELECT rowid, ${FTS_COLS} FROM tickets WHERE aftersale_no = ?`,
      [aftersaleNo]
    )
  }

  private async ftsDelete(x: Exec, aftersaleNo: string): Promise<void> {
    const row = (await x('tickets')
      .select('rowid', 'aftersale_no', 'order_no', 'shipping_no', 'return_no', 'note',
        'recipient_name', 'phone', 'province', 'city', 'district', 'address_detail')
      .where('aftersale_no', aftersaleNo)
      .first()) as FtsRow | undefined
    if (!row) return
    await x.raw(
      `INSERT INTO tickets_fts(tickets_fts, rowid, ${FTS_COLS})
       VALUES('delete', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.rowid, row.aftersale_no, row.order_no, row.shipping_no, row.return_no, row.note,
        row.recipient_name, row.phone, row.province, row.city, row.district, row.address_detail]
    )
  }
}
```

- [ ] **Step 3: `src/main/db/materials.ts`** — 整文件替换为:
```ts
import type { Knex } from 'knex'
import type { Material } from '../../shared/types'

const MATERIAL_COLS = {
  id: 'id', aftersaleNo: 'aftersale_no', name: 'name', relPath: 'rel_path', kind: 'kind',
  capturedAt: 'captured_at', importedAt: 'imported_at', sizeBytes: 'size_bytes', thumbPath: 'thumb_path', folder: 'folder'
} as const

export type NewMaterial = Omit<Material, 'id' | 'name' | 'folder'> & { name?: string; folder?: string }

export class MaterialRepo {
  constructor(private db: Knex) {}

  async add(m: NewMaterial): Promise<number> {
    const [id] = await this.db('materials').insert({
      aftersale_no: m.aftersaleNo, name: m.name ?? '', rel_path: m.relPath, kind: m.kind,
      captured_at: m.capturedAt, imported_at: m.importedAt, size_bytes: m.sizeBytes,
      thumb_path: m.thumbPath, folder: m.folder ?? ''
    })
    return Number(id)
  }

  async listByTicket(aftersaleNo: string): Promise<Material[]> {
    return (await this.db('materials').select(MATERIAL_COLS).where('aftersale_no', aftersaleNo).orderBy('imported_at')) as Material[]
  }

  async getByIds(ids: number[]): Promise<Material[]> {
    if (ids.length === 0) return []
    return (await this.db('materials').select(MATERIAL_COLS).whereIn('id', ids)) as Material[]
  }

  async setThumb(id: number, thumbPath: string): Promise<void> {
    await this.db('materials').where('id', id).update({ thumb_path: thumbPath })
  }

  async setFolder(id: number, folder: string): Promise<void> {
    await this.db('materials').where('id', id).update({ folder })
  }

  async remove(id: number): Promise<void> {
    await this.db('materials').where('id', id).del()
  }
}
```

- [ ] **Step 4: `src/main/db/folders.ts`** — 整文件替换为:
```ts
import type { Knex } from 'knex'
import { ancestorsAndSelf, isUnderOrEqual, joinPath, parentPath, rewritePrefix, normalizeSegment } from '../../shared/folder-path'

type Now = () => number
export interface AffectedMaterial { relPath: string; thumbPath: string | null }

export class FolderRepo {
  constructor(private db: Knex, private now: Now = () => Date.now()) {}

  async create(aftersaleNo: string, path: string): Promise<void> {
    for (const seg of path.split('/')) normalizeSegment(seg) // throws on empty / '/' / '.' / '..'
    const ts = this.now()
    await this.db.transaction(async (trx) => {
      for (const p of ancestorsAndSelf(path)) {
        await trx('material_folders')
          .insert({ aftersale_no: aftersaleNo, path: p, created_at: ts })
          .onConflict(['aftersale_no', 'path']).ignore()
      }
    })
  }

  async list(aftersaleNo: string): Promise<string[]> {
    return await this.db('material_folders').where('aftersale_no', aftersaleNo).orderBy('path').pluck('path')
  }

  async rename(aftersaleNo: string, path: string, newName: string): Promise<void> {
    const newPath = joinPath(parentPath(path), normalizeSegment(newName))
    if (newPath === path) return
    const clash = await this.db('material_folders').where({ aftersale_no: aftersaleNo, path: newPath }).first()
    if (clash) throw new Error('同级已存在同名文件夹')
    await this.db.transaction(async (trx) => {
      const fs = (await trx('material_folders').select('id', 'path').where('aftersale_no', aftersaleNo)) as { id: number; path: string }[]
      for (const f of fs) if (isUnderOrEqual(f.path, path)) await trx('material_folders').where('id', f.id).update({ path: rewritePrefix(f.path, path, newPath) })
      const ms = (await trx('materials').select('id', 'folder').where('aftersale_no', aftersaleNo)) as { id: number; folder: string }[]
      for (const m of ms) if (isUnderOrEqual(m.folder, path)) await trx('materials').where('id', m.id).update({ folder: rewritePrefix(m.folder, path, newPath) })
    })
  }

  async remove(aftersaleNo: string, path: string): Promise<AffectedMaterial[]> {
    let affected: AffectedMaterial[] = []
    await this.db.transaction(async (trx) => {
      const ms = (await trx('materials')
        .select('id', { relPath: 'rel_path' }, { thumbPath: 'thumb_path' }, 'folder')
        .where('aftersale_no', aftersaleNo)) as { id: number; relPath: string; thumbPath: string | null; folder: string }[]
      const inSub = ms.filter((m) => isUnderOrEqual(m.folder, path))
      affected = inSub.map((m) => ({ relPath: m.relPath, thumbPath: m.thumbPath }))
      if (inSub.length) await trx('materials').whereIn('id', inSub.map((m) => m.id)).del()
      const fs = (await trx('material_folders').select('id', 'path').where('aftersale_no', aftersaleNo)) as { id: number; path: string }[]
      const delIds = fs.filter((f) => isUnderOrEqual(f.path, path)).map((f) => f.id)
      if (delIds.length) await trx('material_folders').whereIn('id', delIds).del()
    })
    return affected
  }
}
```

- [ ] **Step 5: `src/main/db/stats.ts`** — 整文件替换为:
```ts
import type { Knex } from 'knex'
import type { RegionLevel, RegionCount, StatsSummary } from '../../shared/types'

const COLS: Record<RegionLevel, { code: string; name: string }> = {
  province: { code: 'province_code', name: 'province' },
  city: { code: 'city_code', name: 'city' },
  district: { code: 'district_code', name: 'district' }
}

export class StatsRepo {
  constructor(private db: Knex) {}

  async regionCounts(level: RegionLevel): Promise<RegionCount[]> {
    const col = COLS[level] // fixed mapping — never interpolate arbitrary input
    const rows = (await this.db('tickets')
      .select({ code: col.code, name: col.name })
      .count({ count: '*' })
      .whereNot(col.code, '')
      .groupBy(col.code, col.name)
      .orderBy([{ column: 'count', order: 'desc' }, { column: col.name, order: 'asc' }])) as { code: string; name: string; count: number | string }[]
    return rows.map((r) => ({ code: r.code, name: r.name, count: Number(r.count) }))
  }

  async summary(): Promise<StatsSummary> {
    const total = Number(((await this.db('tickets').count({ n: '*' })) as { n: number | string }[])[0].n)
    const classified = Number(((await this.db('tickets').whereNot('province_code', '').count({ n: '*' })) as { n: number | string }[])[0].n)
    return { total, classified, unclassified: total - classified }
  }
}
```

- [ ] **Step 6: `src/main/services/importer.ts`** — 仅改 `record` 私有方法里两处 repo 调用为 await:
```ts
    const id = await this.materials.add({
      aftersaleNo, name, relPath, kind, folder,
      capturedAt: null,
      importedAt: this.now(),
      sizeBytes: statSync(destAbs).size,
      thumbPath
    })
    const created = (await this.materials.getByIds([id]))[0]
```
(其余 importer 不变。)

- [ ] **Step 7: `src/main/services/scanner.ts`** — 整文件替换为:
```ts
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { MaterialRepo } from '../db/materials'

export class Scanner {
  constructor(private dataRoot: string, private materials: MaterialRepo) {}

  /** 删除磁盘上已不存在的材料索引,返回删除条数。 */
  async calibrateTicket(aftersaleNo: string): Promise<number> {
    let removed = 0
    for (const m of await this.materials.listByTicket(aftersaleNo)) {
      if (!existsSync(join(this.dataRoot, m.relPath))) {
        if (m.thumbPath) { try { unlinkSync(join(this.dataRoot, m.thumbPath)) } catch { /* ignore */ } }
        await this.materials.remove(m.id)
        removed++
      }
    }
    return removed
  }
}
```

- [ ] **Step 8: `src/main/ipc.ts`** — 只改三个多步 handler 为 async/await(其余不变):

`tickets:delete`:
```ts
  ipcMain.handle('tickets:delete', async (_e, no: string) => {
    for (const m of await materials.listByTicket(no)) {
      if (m.thumbPath) { try { unlinkSync(join(dataRoot, m.thumbPath)) } catch { /* ignore */ } }
    }
    try { rmSync(join(dataRoot, safeDir(no)), { recursive: true, force: true }) } catch { /* ignore */ }
    await tickets.delete(no)
    return true
  })
```
`tickets:import` 内的两处:
```ts
    const existing = await tickets.existingNos(mapped.tickets.map((t) => t.aftersaleNo))
    const toInsert = mapped.tickets.filter((t) => !existing.has(t.aftersaleNo))
    await tickets.createMany(toInsert)
```
`folders:remove`:
```ts
  ipcMain.handle('folders:remove', async (_e, no: string, path: string) => {
    for (const m of await folderRepo.remove(no, path)) {
      try { unlinkSync(join(dataRoot, m.relPath)) } catch { /* ignore */ }
      if (m.thumbPath) { try { unlinkSync(join(dataRoot, m.thumbPath)) } catch { /* ignore */ } }
    }
  })
```

- [ ] **Step 9: 验证(只编译,不跑 vitest)**
Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "src/main/(db/|services/|ipc)" | grep -vE "Cannot find (name|module).*(node:|Buffer|process|console|__dirname|require)"` → 无真实错误。
Run: `npm run build` → success(electron-vite build 通过即 src 类型 OK)。

- [ ] **Step 10: Commit**
```bash
git add src/main/db/*.ts src/main/services/importer.ts src/main/services/scanner.ts src/main/ipc.ts
git commit -m "refactor(db): repositories query through Knex (FTS via raw)"
```

---

## Task 2: 测试层适配(全套绿)

**Files:** Modify `tests/db/helpers.ts`、`tests/db/database.test.ts`,以及 `tests/db/{tickets,materials,folders,stats}.test.ts`、`tests/services/{importer,scanner}.test.ts`(及任何其它直接调用这些 repo 的测试)。

机械转换规则(对每个受影响测试文件):
1. `db` 的类型从 `Database`(better-sqlite3)改为 `Knex`(`import type { Knex } from 'knex'`)。
2. 所有 `afterEach(() => cleanup())` → `afterEach(async () => { await cleanup() })`。
3. 所有对 repo 方法的调用(`create/update/delete/get/list/search/existingNos/createMany/add/listByTicket/getByIds/setThumb/setFolder/remove/list/rename/regionCounts/summary/calibrateTicket` 等)前加 `await`,并把所在的 `it(...)` 回调改为 `async`。
4. 任何直接用 better-sqlite3 句柄断言的地方(`db.prepare(...).get/all/run`)改为 Knex 等价(见 database.test 示例)。

- [ ] **Step 1: `tests/db/helpers.ts`** — 整文件替换为:
```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Knex } from 'knex'
import { createDatabase } from '../../src/main/db/database'

export async function makeTempDb(): Promise<{ db: Knex; cleanup: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), 'vh-db-'))
  const db = await createDatabase(join(dir, 'aftersales-tool.db'))
  return { db, cleanup: async () => { await db.destroy(); rmSync(dir, { recursive: true, force: true }) } }
}
```

- [ ] **Step 2: `tests/db/database.test.ts`** — 整文件替换为:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Knex } from 'knex'
import { makeTempDb } from './helpers'

let db: Knex
let cleanup: () => Promise<void>
beforeEach(async () => { ;({ db, cleanup } = await makeTempDb()) })
afterEach(async () => { await cleanup() })

describe('createDatabase', () => {
  it('creates core tables (incl. knex_migrations) and the FTS table', async () => {
    const names = await db('sqlite_master').where('type', 'table').pluck('name')
    expect(names).toEqual(expect.arrayContaining(['tickets', 'materials', 'material_folders', 'tickets_fts', 'knex_migrations']))
  })
  it('enables foreign keys on the returned connection', async () => {
    const rows = (await db.raw('PRAGMA foreign_keys')) as { foreign_keys: number }[]
    expect(rows[0].foreign_keys).toBe(1)
  })
  it('tickets has embedded customer + Spec C aftersale columns (no customer_id)', async () => {
    const cols = ((await db.raw('PRAGMA table_info(tickets)')) as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['recipient_name', 'phone', 'province', 'extension', 'aftersale_type', 'shipping_status', 'return_logistics']))
    expect(cols).not.toContain('customer_id')
  })
  it('materials has name + folder columns', async () => {
    const cols = ((await db.raw('PRAGMA table_info(materials)')) as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['name', 'folder']))
  })
  it('records the baseline migration', async () => {
    const done = await db('knex_migrations').pluck('name')
    expect(done).toContain('0001_baseline')
  })
})
```
> 若 `db.raw('PRAGMA ...')` 在本环境返回的不是行数组(better-sqlite3 knex client 正常应返回行数组),按实际返回结构取值(运行测试即可暴露)。

- [ ] **Step 3: 其余测试文件按规则改 await/async** — 逐个 Read 并改 `tests/db/tickets.test.ts`、`tests/db/materials.test.ts`、`tests/db/folders.test.ts`、`tests/db/stats.test.ts`、`tests/services/importer.test.ts`、`tests/services/scanner.test.ts`:
  - `db` 类型改 `Knex`;`afterEach` 改 async-await;每个用例回调改 `async`;repo 方法调用前加 `await`。
  - 断言值/计数/顺序保持不变。
  - 若某 service 测试用了 fake/mock 的 repo,使其方法返回 Promise(`async` 或 `vi.fn().mockResolvedValue(...)`)。

- [ ] **Step 4: 跑全套** — `npm run rebuild:node && npx vitest run`(若报 knex 嵌套 better-sqlite3 缺 build,先 `rm -rf node_modules/knex/node_modules/better-sqlite3` 再跑)→ **0 failures**(汇报数量)。逐个修正遗漏的 `await`(未 await 的 Promise 会让断言明显失败)直到全绿。

- [ ] **Step 5: Commit**
```bash
git add tests/db/*.ts tests/services/importer.test.ts tests/services/scanner.test.ts
git commit -m "test: adapt db/service tests to async Knex repositories"
```

---

## 手验清单(dev)
`npm run rebuild:electron && npm run dev`:
- 列表加载、搜索(FTS)、新建/编辑/删除售后单正常。
- 材料:新建(文件/粘贴)、移动、删除、导出文件夹/zip、校准索引正常。
- 文件夹:新建多级、重命名、删除(连子内容)正常。
- 统计图(地区计数/汇总)正常。
- Excel 导入(去重)正常。
- 验证后 `npm run rebuild:node` 还原 ABI。

---

## Self-Review(已核对 spec)
- **§2.1 createDatabase→Knex(迁移先跑、pool max1、afterCreate pragma)**:Task 1 Step 1。✓
- **§2.2 列映射/toRow/qualify**:Task 1 Step 2(`TICKET_COLS`/`selectMap`/`toRow`)。✓
- **§2.3 TicketRepo(builder CRUD、transaction、FTS raw、search MATCH、existingNos 分块、createMany)**:Step 2。✓
- **§2.4 MaterialRepo(insert 返回 [id])**:Step 3。✓
- **§2.5 FolderRepo(onConflict ignore、rename/remove transaction)**:Step 4。✓
- **§2.6 StatsRepo(groupBy/count/orderBy、summary)**:Step 5。✓
- **§2.7 Importer/Scanner/ipc(await、三个多步 handler async)**:Step 6-8。✓
- **§5 测试(helpers async cleanup、database.test Knex 自省、repo/service 测试 await)**:Task 2。✓
- **类型一致**:`createDatabase: Promise<Knex>`、各 repo 构造 `Knex`、方法 `Promise<...>`;ipc/services 调用处加 await;`makeTempDb` 返回 `{db:Knex; cleanup:()=>Promise<void>}`。✓
- **占位符扫描**:源码每文件给出完整内容;测试给出 helpers/database.test 完整内容 + 其余文件的精确机械规则 + 以 vitest 为 oracle 迭代至绿。✓
- **YAGNI**:不改迁移/IPC 通道/渲染层/schema/FTS 策略,不引 ORM。✓
- **原子性**:源码层一次性转换(Task 1),`npm run build` 验证;测试层(Task 2)全套验证。中间态不跑 vitest。✓
