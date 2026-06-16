# 数据库迁移框架(Knex migrations)设计文档

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:为后续 electron-updater 自动更新(单独 spec)打基础——自动更新后旧版数据库需安全迁移到新 schema。当前 `src/main/db/database.ts` 用「幂等加列 + 一次性 guard」手写迁移,无版本号、无备份。本 spec 改用**成熟开源库 Knex** 的 migrations 系统(带版本追踪表)+ 迁移前自动备份。

> 选型说明:已评估 Knex / Drizzle / Umzug,确认用 **Knex**(最成熟、生态最广)。已知集成代价:Knex 自带连接 + 异步 API,因此 **DB 初始化改为异步**,且 **db 单测从 `:memory:` 改为临时文件库**(Knex 无法迁移测试持有的同一个内存连接)。这些代价已接受。

---

## 1. 概述

引入 **Knex** 作为迁移引擎:Knex 自动维护 `knex_migrations` 追踪表,按序运行未应用的迁移。迁移以**代码内定义**(in-code `migrationSource`)提供,不用磁盘迁移文件——因为主进程被 electron-vite 打包(asar),文件式迁移发现不可靠。Knex 仅用于迁移编排;业务仓库继续用原生 better-sqlite3。**只做前向迁移**。在有待执行迁移时,先把数据库文件**时间戳备份**(保留最近 3 份)。迁移失败则中止启动并弹出含备份路径的错误。

现有手写迁移(`migrate`/`ensureColumn`/`migrateLegacyCustomers`/`rebuildFtsIfStale`)**退役**,合并为 Knex 的 **baseline(0001)迁移 = 当前完整 schema(幂等 `CREATE … IF NOT EXISTS`)**;之后所有 schema 变动作为 `0002+` 迁移追加。

---

## 2. 依赖与架构

### 2.1 依赖
`knex` 加入 **`dependencies`**(运行期在打包应用内执行迁移)。Knex 用 `client: 'better-sqlite3'`(better-sqlite3 已是依赖,native 部分已在 `asarUnpack`)。electron-vite 的 `externalizeDepsPlugin` 会把 `knex`/`better-sqlite3` 外置(不打进 bundle,运行时从 node_modules 加载),纯 JS 的 knex 在 asar 内可正常 `require`。

### 2.2 新模块 `src/main/db/migrations.ts`
```ts
import type { Knex } from 'knex'

interface CodeMigration { name: string; up: (knex: Knex) => Promise<void> }

export const MIGRATIONS: CodeMigration[] = [
  { name: '0001_baseline', up: async (knex) => { for (const s of BASELINE_STATEMENTS) await knex.raw(s) } },
  // 未来:{ name: '0002_xxx', up: async (knex) => { await knex.raw('ALTER TABLE ...') } }
]

// 代码内迁移源(实现 Knex.MigrationSource),零磁盘文件:
class CodeMigrationSource implements Knex.MigrationSource<CodeMigration> {
  async getMigrations() { return MIGRATIONS }
  getMigrationName(m: CodeMigration) { return m.name }
  async getMigration(m: CodeMigration) { return { up: m.up, down: async () => {} } } // 前向迁移,down 留空
}

// migrations 默认 MIGRATIONS;测试可注入自定义列表(如追加 0002 / 抛错迁移)。
export async function runMigrations(dbPath: string, backupDir: string, now?: () => number, migrations?: CodeMigration[]): Promise<void>
```
`CodeMigrationSource` 用传入的 `migrations`(缺省 `MIGRATIONS`)构造,使运行器可测。
- `BASELINE_STATEMENTS`:把当前 schema 拆成**单条**语句的数组(每条单独 `knex.raw`,因为 better-sqlite3 驱动的 `raw` 只执行单条):
  - `CREATE TABLE IF NOT EXISTS tickets (... 含全部列:order_no/shipping_no/return_no/status/note/created_at/updated_at/recipient_name/phone/province_code/province/city_code/city/district_code/district/address_detail/extension ...)`
  - `CREATE TABLE IF NOT EXISTS materials (... 含 name、folder ...)`
  - `CREATE INDEX IF NOT EXISTS idx_materials_ticket ...`
  - `CREATE TABLE IF NOT EXISTS material_folders (...)` + `CREATE INDEX IF NOT EXISTS idx_folders_ticket ...`
  - `CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(... content='tickets', content_rowid='rowid')`
  - 即「合并后的最终 schema」,不再用 ensureColumn 增量。

### 2.3 `src/main/db/database.ts` 改动
- 删除 `migrate`/`ensureColumn`/`migrateLegacyCustomers`/`rebuildFtsIfStale`/`TICKET_CUSTOMER_COLS`(退役;其结果并入 baseline)。
- `createDatabase(path)` 改为 **async**:
  ```ts
  export async function createDatabase(path: string): Promise<DB> {
    await runMigrations(path, join(dirname(path), 'backups'))
    const db = new Database(path)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    return db
  }
  ```

---

## 3. 运行流程(`runMigrations`)

```
const knex = makeKnex(dbPath, new CodeMigrationSource())   // client better-sqlite3, useNullAsDefault:true
try {
  const [completed, pending] = await knex.migrate.list()
  if (pending.length > 0 && fileExists(dbPath)) backupBeforeMigrate(dbPath, backupDir, now)
  await knex.migrate.latest()
} catch (err) {
  throw new Error(`数据库迁移失败:${(err as Error).message}` + (lastBackup ? `\n已在迁移前备份到:${lastBackup}` : ''))
} finally {
  await knex.destroy()
}
```
- Knex 默认把每条迁移包在事务里(sqlite),失败自动回滚该条,`knex_migrations` 不记录该条。
- **失败冒泡**:`runMigrations` 抛错 → `createDatabase` 抛错 → `registerIpc`(改 async)抛错 → `src/main/index.ts` 的 `app.whenReady().then(async () => { try { await registerIpc() } catch { dialog.showErrorBox('启动失败', …); app.quit() } })`。即「中止启动 + 报错弹窗(含备份路径)」,不新增 UI。
- 已部署旧库(无 `knex_migrations` 表,但 schema 已最新):首启 → pending=[0001] → 备份 1 份 → baseline 幂等空跑 → 记录 0001。全新库:baseline 建表 → 记录 0001。

### 3.1 异步波及
- `registerIpc` 改 `async`(内部 `await createDatabase(...)`);`index.ts` 改 `await registerIpc()`。其余主进程逻辑不变。

---

## 4. 迁移前备份(`backupBeforeMigrate(dbPath, backupDir, now)`)

1. 文件不存在 → 返回(全新库)。
2. 用一个**临时 better-sqlite3 连接**打开 `dbPath`,执行 `PRAGMA wal_checkpoint(TRUNCATE)` 把 WAL 落入主文件,关闭。
3. `mkdirSync(backupDir, { recursive: true })`;`copyFileSync(dbPath, <backupDir>/aftersales-tool.<YYYYMMDD-HHMMSS>.db.bak)`(时间戳由 `now()` 生成);记录路径供错误消息使用。
4. 清理:列出 `aftersales-tool.*.db.bak`,按时间戳排序,**只留最近 3 份**。

备份目录:`<dataRoot>/backups/`(= 数据库文件所在目录下的 `backups/`)。

---

## 5. 测试改动(必须)

Knex 自带连接、无法迁移测试持有的同一个 `:memory:` 连接,故 db 单测改用**临时文件库 + 异步初始化**:
- 各 `tests/db/*.test.ts` 的 `beforeEach` 改为:
  ```ts
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vh-db-'))
    db = await createDatabase(join(dir, 'test.db'))
    // ...repo 构造同前
  })
  afterEach(() => { db.close(); rmSync(dir, { recursive: true, force: true }) })
  ```
- **删除** `tests/db/migration.test.ts`(legacy 客户回填随转译退役,baseline 已是「无 customers 表」的最终 schema)。
- `tests/db/database.test.ts`:改 async + 临时文件;断言关键表(tickets/materials/material_folders/tickets_fts)与列(folder/extension 等)存在;新增断言 `knex_migrations` 表存在、且 baseline 已记录。
- 新增 `tests/db/migrations.test.ts`:
  - 全新临时库 → `createDatabase` 后 `knex_migrations` 含 `0001_baseline`;schema 齐全。
  - 用 `runMigrations(path, dir, now, [baseline, 一条 0002])` 在已 baseline 的库上再跑 → 只应用 0002、`knex_migrations` 记录之;用 `[baseline, 一条抛错的 0002]` → `runMigrations` 抛错、`knex_migrations` 未记录该条、其改动未落库。
  - `backupBeforeMigrate`:有 pending 时生成 `.db.bak`;连续多次只留 3 份;文件不存在时跳过。
- 其余 db 仓库测试(tickets/materials/folders/stats/customers)逻辑不变,仅 setup 改临时文件 + async。

---

## 6. 明确不做(YAGNI)

- 不做 down/回滚迁移(`down` 留空)。
- 不做应用内「恢复备份」UI(失败弹窗给出磁盘备份路径,手动恢复)。
- 不用 Knex 的查询构建器改写业务仓库(仓库继续 raw better-sqlite3);Knex 仅用于迁移。
- 不在本 spec 做 electron-updater(单独 spec)。
- 不保留 `:memory:` 测试路径;不保留退役的手写迁移代码。
- 备份不加密/压缩;不额外备份 `-wal/-shm`(已 checkpoint 落盘)。
