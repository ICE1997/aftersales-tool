# 数据库迁移框架(Knex)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Knex migrations 取代手写迁移:带 `knex_migrations` 版本追踪、代码内迁移源、迁移前自动备份(留最近 3 份),为后续自动更新打基础。

**Architecture:** Knex(client `better-sqlite3`)仅用于迁移编排;业务仓库仍用原生 better-sqlite3。迁移以代码内 `migrationSource` 提供(避开打包/asar 的文件发现问题)。baseline(0001)= 当前完整 schema(幂等 `CREATE … IF NOT EXISTS`),退役旧的 `migrate/ensureColumn/legacy/FTS-rebuild`。`createDatabase` 变异步;db 单测改临时文件库。

**Tech Stack:** Electron(main)、Knex + better-sqlite3、Vitest。

**ABI 提示:** 跑 vitest 前若报 `NODE_MODULE_VERSION`,先 `npm run rebuild:node`。

**绿灯说明:** Task 1 改 `createDatabase` 为异步会让其余 db 单测暂时变红(它们还用同步 `:memory:`);Task 1 的验证只针对 `migrations.test.ts` + 构建 + 主进程 tsc。Task 2 把所有 db 测试转成临时文件库后**全绿**。

---

## File Structure

**Create:**
- `src/main/db/migrations.ts` — `BASELINE_STATEMENTS`、`MIGRATIONS`、`CodeMigrationSource`、`backupBeforeMigrate`、`runMigrations`。
- `tests/db/helpers.ts` — `makeTempDb()` 测试夹具。
- `tests/db/migrations.test.ts` — 迁移/备份单测。

**Modify:**
- `package.json` — 加 `knex` 依赖。
- `src/main/db/database.ts` — `createDatabase` 异步;删除旧迁移代码。
- `src/main/ipc.ts` — `registerIpc` 改 async + `await createDatabase`。
- `src/main/index.ts` — `await registerIpc()`。
- `tests/db/{tickets,materials,folders,stats,customers,database}.test.ts` — 改临时文件库 + async。

**Delete:**
- `tests/db/migration.test.ts`(legacy 客户回填,随退役删除)。

---

## Task 1: Knex 迁移核心 + 异步初始化

**Files:** `package.json`, `src/main/db/migrations.ts`(新), `src/main/db/database.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `tests/db/helpers.ts`(新), `tests/db/migrations.test.ts`(新)

- [ ] **Step 1: 安装 knex**

Run: `npm install knex`
Expected: `knex` 出现在 `package.json` 的 `dependencies`(`.npmrc` 的 legacy-peer-deps 已处理 peer 冲突)。

- [ ] **Step 2: 创建 `src/main/db/migrations.ts`**

```ts
import Knex from 'knex'
import type { Knex as KnexType } from 'knex'
import BetterSqlite3 from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// 合并后的当前完整 schema —— 每条单独执行(better-sqlite3 的 knex.raw 只跑单条)。
export const BASELINE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS tickets (
     aftersale_no TEXT PRIMARY KEY,
     order_no TEXT NOT NULL DEFAULT '',
     shipping_no TEXT NOT NULL DEFAULT '',
     return_no TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending',
     note TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     recipient_name TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL DEFAULT '',
     province_code TEXT NOT NULL DEFAULT '',
     province TEXT NOT NULL DEFAULT '',
     city_code TEXT NOT NULL DEFAULT '',
     city TEXT NOT NULL DEFAULT '',
     district_code TEXT NOT NULL DEFAULT '',
     district TEXT NOT NULL DEFAULT '',
     address_detail TEXT NOT NULL DEFAULT '',
     extension TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE TABLE IF NOT EXISTS materials (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     aftersale_no TEXT NOT NULL REFERENCES tickets(aftersale_no) ON DELETE CASCADE,
     rel_path TEXT NOT NULL UNIQUE,
     kind TEXT NOT NULL,
     name TEXT NOT NULL DEFAULT '',
     captured_at INTEGER,
     imported_at INTEGER NOT NULL,
     size_bytes INTEGER NOT NULL,
     thumb_path TEXT,
     folder TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE INDEX IF NOT EXISTS idx_materials_ticket ON materials(aftersale_no)`,
  `CREATE TABLE IF NOT EXISTS material_folders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     aftersale_no TEXT NOT NULL REFERENCES tickets(aftersale_no) ON DELETE CASCADE,
     path TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     UNIQUE(aftersale_no, path)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_folders_ticket ON material_folders(aftersale_no)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(
     aftersale_no, order_no, shipping_no, return_no, note,
     recipient_name, phone, province, city, district, address_detail,
     content='tickets', content_rowid='rowid'
   )`
]

export interface CodeMigration { name: string; up: (knex: KnexType) => Promise<void> }

export const MIGRATIONS: CodeMigration[] = [
  {
    name: '0001_baseline',
    up: async (knex) => { for (const s of BASELINE_STATEMENTS) await knex.raw(s) }
  }
  // 未来:{ name: '0002_xxx', up: async (knex) => { await knex.raw('ALTER TABLE ...') } }
]

class CodeMigrationSource implements KnexType.MigrationSource<CodeMigration> {
  constructor(private migrations: CodeMigration[]) {}
  async getMigrations() { return this.migrations.slice().sort((a, b) => a.name.localeCompare(b.name)) }
  getMigrationName(m: CodeMigration) { return m.name }
  async getMigration(m: CodeMigration) { return { up: m.up, down: async () => {} } }
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function stamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** Checkpoint WAL into the main file, copy to a timestamped .bak, keep newest 3. Returns the backup path. */
export function backupBeforeMigrate(dbPath: string, backupDir: string, now: () => number = Date.now): string | null {
  if (dbPath === ':memory:' || !existsSync(dbPath)) return null
  const tmp = new BetterSqlite3(dbPath)
  try { tmp.pragma('wal_checkpoint(TRUNCATE)') } finally { tmp.close() }
  mkdirSync(backupDir, { recursive: true })
  const dest = join(backupDir, `aftersales-tool.${stamp(now())}.db.bak`)
  copyFileSync(dbPath, dest)
  const baks = readdirSync(backupDir).filter((f) => /^aftersales-tool\..*\.db\.bak$/.test(f)).sort()
  for (const old of baks.slice(0, Math.max(0, baks.length - 3))) {
    try { unlinkSync(join(backupDir, old)) } catch { /* ignore */ }
  }
  return dest
}

/** Run pending Knex migrations on dbPath, backing up first if any are pending. */
export async function runMigrations(
  dbPath: string,
  backupDir: string,
  now: () => number = Date.now,
  migrations: CodeMigration[] = MIGRATIONS
): Promise<void> {
  const knex = Knex({
    client: 'better-sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true,
    migrations: { migrationSource: new CodeMigrationSource(migrations) }
  })
  let backup: string | null = null
  try {
    const [, pending] = await knex.migrate.list()
    if (pending.length > 0) backup = backupBeforeMigrate(dbPath, backupDir, now)
    await knex.migrate.latest()
  } catch (err) {
    throw new Error(`数据库迁移失败:${(err as Error).message}` + (backup ? `\n已在迁移前备份到:${backup}` : ''))
  } finally {
    await knex.destroy()
  }
}
```

- [ ] **Step 3: 重写 `src/main/db/database.ts`**

Replace the whole file:
```ts
import BetterSqlite3 from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { runMigrations } from './migrations'

export async function createDatabase(path: string): Promise<DB> {
  await runMigrations(path, join(dirname(path) === '.' ? '.' : dirname(path), 'backups'))
  const db = new BetterSqlite3(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
```
(All of `migrate`/`ensureColumn`/`migrateLegacyCustomers`/`rebuildFtsIfStale`/`TICKET_CUSTOMER_COLS`/`FTS_COLS_ARR` are removed — their result is the baseline.)

> 注:`:memory:` 的 `dirname` 为 `.`;`backups` 落在 cwd 的 `./backups`,但 `backupBeforeMigrate` 对 `:memory:` 直接返回 null,不会创建。生产路径 `dirname` 是数据目录。

- [ ] **Step 4: `src/main/ipc.ts` 改 async**

把 `export function registerIpc(): void {` 改为 `export async function registerIpc(): Promise<void> {`,并把 `const db = createDatabase(join(dataRoot, 'aftersales-tool.db'))` 改为 `const db = await createDatabase(join(dataRoot, 'aftersales-tool.db'))`。其余不变。

- [ ] **Step 5: `src/main/index.ts` await**

把:
```ts
app.whenReady().then(() => {
  try {
    registerIpc()
  } catch (e) {
```
改为:
```ts
app.whenReady().then(async () => {
  try {
    await registerIpc()
  } catch (e) {
```
(后续 `createWindow()` 仍在 try 之后调用。)

- [ ] **Step 6: 测试夹具 `tests/db/helpers.ts`**

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'

/** Fresh migrated DB in a temp dir. cleanup() closes + removes it. */
export async function makeTempDb(): Promise<{ db: Database; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'vh-db-'))
  const db = await createDatabase(join(dir, 'aftersales-tool.db'))
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }) } }
}
```

- [ ] **Step 7: `tests/db/migrations.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { runMigrations, backupBeforeMigrate, MIGRATIONS, type CodeMigration } from '../../src/main/db/migrations'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'vh-mig-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function tables(dbPath: string): string[] {
  const db = new BetterSqlite3(dbPath)
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  db.close()
  return rows.map((r) => r.name)
}

describe('runMigrations', () => {
  it('applies the baseline on a fresh db and records it in knex_migrations', async () => {
    const dbPath = join(dir, 'a.db')
    await runMigrations(dbPath, join(dir, 'backups'))
    const names = tables(dbPath)
    expect(names).toEqual(expect.arrayContaining(['tickets', 'materials', 'material_folders', 'tickets_fts', 'knex_migrations']))
    const db = new BetterSqlite3(dbPath)
    const done = db.prepare('SELECT name FROM knex_migrations ORDER BY id').all() as { name: string }[]
    db.close()
    expect(done.map((r) => r.name)).toContain('0001_baseline')
  })

  it('applies a newly added migration once and records it', async () => {
    const dbPath = join(dir, 'b.db')
    await runMigrations(dbPath, join(dir, 'backups')) // baseline
    const extra: CodeMigration[] = [
      ...MIGRATIONS,
      { name: '0002_add_table', up: async (knex) => { await knex.raw('CREATE TABLE t2 (x INTEGER)') } }
    ]
    await runMigrations(dbPath, join(dir, 'backups'), Date.now, extra)
    expect(tables(dbPath)).toContain('t2')
    const db = new BetterSqlite3(dbPath)
    const done = (db.prepare('SELECT name FROM knex_migrations').all() as { name: string }[]).map((r) => r.name)
    db.close()
    expect(done).toContain('0002_add_table')
  })

  it('rolls back and throws when a migration fails; nothing recorded', async () => {
    const dbPath = join(dir, 'c.db')
    await runMigrations(dbPath, join(dir, 'backups'))
    const bad: CodeMigration[] = [
      ...MIGRATIONS,
      { name: '0002_bad', up: async (knex) => { await knex.raw('CREATE TABLE t3 (x INTEGER)'); await knex.raw('THIS IS NOT SQL') } }
    ]
    await expect(runMigrations(dbPath, join(dir, 'backups'), Date.now, bad)).rejects.toThrow()
    expect(tables(dbPath)).not.toContain('t3')   // failed migration rolled back
    const db = new BetterSqlite3(dbPath)
    const done = (db.prepare('SELECT name FROM knex_migrations').all() as { name: string }[]).map((r) => r.name)
    db.close()
    expect(done).not.toContain('0002_bad')
  })

  it('backupBeforeMigrate copies a timestamped .bak and keeps only the newest 3', async () => {
    const dbPath = join(dir, 'd.db')
    new BetterSqlite3(dbPath).close()   // create a real file
    const backups = join(dir, 'backups')
    let t = 1_000_000_000_000
    for (let i = 0; i < 5; i++) backupBeforeMigrate(dbPath, backups, () => (t += 1000))
    const baks = readdirSync(backups).filter((f) => f.endsWith('.db.bak'))
    expect(baks.length).toBe(3)
  })

  it('backupBeforeMigrate skips a non-existent / :memory: db', () => {
    expect(backupBeforeMigrate(':memory:', join(dir, 'backups'))).toBeNull()
    expect(backupBeforeMigrate(join(dir, 'nope.db'), join(dir, 'backups'))).toBeNull()
    expect(existsSync(join(dir, 'backups'))).toBe(false)
  })
})
```
> 备注:第 4 个用例每次时间戳 +1s,保证文件名唯一且有序;`backupBeforeMigrate` 复制的是空库文件,验证保留逻辑即可。

- [ ] **Step 8: 验证(本任务范围)**

Run: `npm run rebuild:node && npx vitest run tests/db/migrations.test.ts`
Expected: 5/5 PASS。
Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "src/(main)/" | grep -vE "Cannot find (name|module).*(node:|Buffer|process|console|__dirname|require)"` → 无输出(主进程类型干净)。
Run: `npm run build` → 成功。
(其余 db 测试此刻为红——预期,Task 2 修复。)

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/main/db/migrations.ts src/main/db/database.ts src/main/ipc.ts src/main/index.ts tests/db/helpers.ts tests/db/migrations.test.ts
git commit -m "feat(db): Knex migrations engine + pre-migrate backup; async createDatabase"
```

---

## Task 2: 迁移所有 db 测试到临时文件库 + 删除 legacy 测试

**Files:** `tests/db/{tickets,materials,folders,stats,customers,database}.test.ts`; delete `tests/db/migration.test.ts`

- [ ] **Step 1: 删除 legacy 迁移测试**

```bash
git rm tests/db/migration.test.ts
```
(legacy 客户回填已随 baseline 退役,该测试不再适用。)

- [ ] **Step 2: 转换 5 个仓库测试(tickets/materials/folders/stats/customers)**

每个文件:在 import 区加 `import { afterEach } from 'vitest'`(若未导入)与 `import { makeTempDb } from './helpers'`;把现有
```ts
beforeEach(() => {
  db = createDatabase(':memory:')
  ...repos...
})
```
改为
```ts
let cleanup: () => void
beforeEach(async () => {
  ({ db, cleanup } = await makeTempDb())
  ...repos...   // 仓库构造原样保留
})
afterEach(() => cleanup())
```
并删除该文件里 `import { createDatabase } from '../../src/main/db/database'`(改用 helper)。`db` 变量声明保留(`let db: Database`)。其余测试体不变(都是同步 better-sqlite3 调用)。

> 对每个文件按其现有 `beforeEach` 内容套用:`tickets.test.ts`(repo = new TicketRepo)、`materials.test.ts`、`folders.test.ts`(TicketRepo+FolderRepo+MaterialRepo)、`stats.test.ts`、`customers.test.ts`。仅替换 db 创建那一行 + 包成 async + 加 afterEach。

- [ ] **Step 3: 重写 `tests/db/database.test.ts`**

旧文件测了 `ensureColumn`(已退役)和 `createDatabase(':memory:')`(已异步)。整体改为(用 helper、async、去掉 ensureColumn 块):
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { makeTempDb } from './helpers'

let db: Database
let cleanup: () => void
beforeEach(async () => { ({ db, cleanup } = await makeTempDb()) })
afterEach(() => cleanup())

describe('createDatabase', () => {
  it('creates core tables (incl. knex_migrations) and the FTS table', () => {
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['tickets', 'materials', 'material_folders', 'tickets_fts', 'knex_migrations']))
  })
  it('enables foreign keys on the returned connection', () => {
    expect((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(1)
  })
  it('tickets has the embedded customer columns (no customer_id)', () => {
    const cols = (db.prepare('PRAGMA table_info(tickets)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['recipient_name', 'phone', 'province', 'extension']))
    expect(cols).not.toContain('customer_id')
  })
  it('materials has name + folder columns', () => {
    const cols = (db.prepare('PRAGMA table_info(materials)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['name', 'folder']))
  })
  it('records the baseline migration', () => {
    const done = (db.prepare('SELECT name FROM knex_migrations').all() as { name: string }[]).map((r) => r.name)
    expect(done).toContain('0001_baseline')
  })
})
```

- [ ] **Step 4: 验证(全量)**

Run: `npm run rebuild:node && npx vitest run`
Expected: **全绿,0 失败**(报告文件/用例数)。
Run: `npm run build` → 成功。
Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "^src/" | grep -vE "Cannot find (name|module).*(node:|Buffer|process|console|HTMLElement|File|Blob|URL|window|document|Image|DataTransfer|ClipboardEvent|import\.meta|__dirname|require)"` → 无输出。

- [ ] **Step 5: Commit**

```bash
git add -A tests/db/
git commit -m "test(db): migrate db tests to temp-file DBs (async); drop legacy migration test"
```

---

## 手验清单(dev)

`npm run rebuild:electron && npm run dev`:
- 用现有数据库(`~/Documents/aftersales-tool-data/aftersales-tool.db`)启动 → 正常进入;`aftersales-tool-data/backups/` 出现 1 份 `aftersales-tool.<时间戳>.db.bak`;数据完好(售后单/材料/目录都在)。
- 再次启动 → 无新备份(无 pending 迁移)、无报错。
- 验证后 `npm run rebuild:node` 还原 ABI。

> 提示:首次用新版本启动会因 baseline pending 产生 1 份备份——预期。

---

## Self-Review(已核对 spec)

- **§1/§2 Knex 引擎 + 代码内 source + baseline=全 schema + 退役旧迁移**:Task 1 Step 2-3。✓
- **§2.1 knex 入 dependencies**:Task 1 Step 1。✓
- **§3 运行流程(list→pending 则备份→latest→destroy;失败抛错冒泡)+ 异步波及(ipc/index)**:Task 1 Step 2(runMigrations)、Step 4-5。✓
- **§4 备份(checkpoint+copy 时间戳+留 3,:memory:/缺文件跳过)**:Task 1 Step 2(backupBeforeMigrate)+ migrations.test 覆盖。✓
- **§5 测试改动(临时文件 async;删 legacy;database.test 重写;新增 migrations.test;`runMigrations` 可注入迁移列表)**:Task 1 Step 6-7、Task 2。✓
- **§6 YAGNI(down 空、无恢复 UI、仓库不改、不留 :memory:/旧迁移代码)**:遵守。✓
- **类型/签名一致**:`runMigrations(dbPath, backupDir, now?, migrations?)`、`backupBeforeMigrate(dbPath, backupDir, now?)`、`CodeMigration{name,up}`、`MIGRATIONS`、`createDatabase: Promise<DB>` 在 plan 内一致;helper `makeTempDb()` 返回 `{db, cleanup}` 与各测试用法一致。✓
- **占位符扫描**:无 TBD;每步完整代码/命令。✓
