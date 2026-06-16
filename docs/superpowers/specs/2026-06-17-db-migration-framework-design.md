# 数据库迁移框架(user_version + 迁移前备份)设计文档

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:为后续 electron-updater 自动更新(单独 spec)打基础——自动更新后,旧版数据库需安全迁移到新 schema。当前 `src/main/db/database.ts` 用「幂等加列 + 一次性 guard」手写迁移,无版本号、无备份。本 spec 把它收敛为 `PRAGMA user_version` 有序前向迁移 + 迁移前自动备份。

---

## 1. 概述

引入标准的嵌入式 SQLite 迁移模式:用 `PRAGMA user_version` 记录已应用的迁移版本,启动时按序应用所有「版本 > 当前」的迁移,每条在独立事务内执行并原子地写入版本号。**只做前向迁移**(桌面应用不做回滚)。在有待执行迁移时,先把数据库文件**时间戳备份**(保留最近 3 份)。迁移失败则中止启动并弹出含备份路径的错误。

现有 `migrate(db)`(建表 + `ensureColumn` + legacy 客户回填 + FTS 重建,全部幂等)原样作为 **v1 baseline**;未来 schema 改动作为 `v2+` 追加。

---

## 2. 架构

### 2.1 新模块 `src/main/db/migrations.ts`
```ts
import type { Database as DB } from 'better-sqlite3'

export interface Migration {
  version: number          // 单调递增,从 1 开始
  name: string             // 简短描述,用于日志/错误
  up: (db: DB) => void     // 该版本的迁移动作
}

export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'baseline', up: migrate },   // migrate = 现有 database.ts 的迁移体(幂等)
  // 未来:{ version: 2, name: '...', up: (db) => { ... } }
]

export interface RunOptions {
  dbPath: string                 // 真实文件路径;':memory:' 或不存在则跳过备份
  backupDir: string              // <dataRoot>/backups
  now?: () => number             // 测试可注入
}

export function runMigrations(db: DB, opts: RunOptions): void
```

### 2.2 `src/main/db/database.ts` 改动
- `migrate(db)` 保持导出且**不变**(成为 v1 baseline;现有 `tests/db/migration.test.ts`、`tests/db/database.test.ts` 仍可直接调用/经 `createDatabase`)。
- `createDatabase(path)` 由「开库 + pragma + `migrate(db)`」改为「开库 + pragma + `runMigrations(db, { dbPath: path, backupDir: join(dirname(path), 'backups') })`」。
- `MIGRATIONS`/`runMigrations`/备份逻辑放在 `migrations.ts`(`database.ts` 仅 import 调用),保持文件聚焦。

---

## 3. 运行器逻辑(`runMigrations`)

```
current = db.pragma('user_version', { simple: true })   // 旧库/新库都为 0
pending = MIGRATIONS.filter(m => m.version > current).sort(by version asc)
if (pending.length === 0) return

backupBeforeMigrate(opts.dbPath, opts.backupDir, now)   // 仅有 pending 时备份一次

for (const m of pending) {
  try {
    db.transaction(() => {
      m.up(db)
      db.pragma(`user_version = ${m.version}`)
    })()
  } catch (err) {
    throw new Error(`数据库迁移失败(v${m.version} ${m.name}):${(err as Error).message}` +
                    (lastBackupPath ? `\n已在迁移前备份到:${lastBackupPath}` : ''))
  }
}
```
- **原子性**:`m.up` 的 schema 改动与 `PRAGMA user_version = N` 同一事务;SQLite 中两者皆事务性,失败一并回滚,`user_version` 停在上一值,DB 不变。
- **嵌套事务**:baseline(及未来迁移)内部若调用 `db.transaction(...)()`(如 legacy 回填、FTS 重建),在外层事务内由 better-sqlite3 以 SAVEPOINT 形式执行,安全。
- **失败冒泡**:`runMigrations` 抛错 → `createDatabase` 抛错 → `src/main/index.ts` 现有启动 `try/catch` 捕获 → `dialog.showErrorBox('启动失败', <含备份路径的消息>)` + `app.quit()`。即「中止启动 + 报错弹窗」,无需新增 UI。

---

## 4. 迁移前备份(`backupBeforeMigrate(dbPath, backupDir, now)`)

1. 若 `dbPath === ':memory:'` 或文件不存在 → 直接返回(全新库/测试,无需备份)。
2. `db.pragma('wal_checkpoint(TRUNCATE)')` 把 WAL 内容并入主库文件(保证 .bak 完整)。
   > 备注:checkpoint 需要数据库连接,因此该函数在 `runMigrations` 内、用同一个 `db` 连接执行 checkpoint,再用 `copyFileSync` 复制 `dbPath`。
3. `mkdirSync(backupDir, { recursive: true })`;复制 `dbPath` → `backupDir/aftersales-tool.<YYYYMMDD-HHMMSS>.db.bak`(时间戳由 `now()` 生成,纯函数化便于测试)。记录该路径供错误消息使用。
4. **清理**:列出 `backupDir` 下所有 `aftersales-tool.*.db.bak`,按文件名(时间戳)排序,删除到只剩**最近 3 份**。

> 备份目录:`<dataRoot>/backups/`(`dataRoot` = 数据库文件所在目录)。

---

## 5. 収编现有 `migrate()`

- `migrate(db)` 整段(`CREATE TABLE IF NOT EXISTS …`、`ensureColumn`、`migrateLegacyCustomers`、`rebuildFtsIfStale`)**不改**,作为 `MIGRATIONS[0]`(v1)。它本就幂等。
- 已部署旧库(`user_version=0`,schema 已最新):首次运行新版本 → 备份 1 份 → baseline 幂等空跑 → `user_version=1`。**可接受**(等于一次安全快照)。
- 全新库:baseline 建好全部 schema → `user_version=1`。
- 此后每次 schema 变动 = 追加一条 `v2+`(只运行一次、可非幂等),不再依赖「幂等加列」技巧。

---

## 6. 测试策略

- **`runMigrations`(重点)**:
  - 全新 `:memory:` DB → 运行后 `user_version` = 列表最大版本;关键表(tickets/materials/material_folders/tickets_fts)存在。
  - 注入临时 `MIGRATIONS`(或可注入版本列表):多条按序应用、`user_version` 逐步 bump;一条**抛错**的迁移 → `runMigrations` 抛错、`user_version` 停在前值、该迁移的改动未落库(事务回滚验证)。
  - 幂等性:对已是最新版本的库再次 `runMigrations` → 无 pending、不备份、无副作用。
- **`backupBeforeMigrate`**:用临时**文件**库(非 `:memory:`)→ 有 pending 时生成 `.db.bak`;连续多次 → 只保留最近 3 份;`:memory:` → 跳过、不抛错。
- **回归**:`tests/db/migration.test.ts`(legacy 客户,直接调 `migrate`)、`tests/db/database.test.ts`(经 `createDatabase`)、其余 db 测试全绿。`createDatabase(':memory:')` 在测试里大量使用 → 不得产生备份文件或报错。
- **手验**:用旧 `vhelper`/现有数据库启动 → 正常迁移、`backups/` 出现 1 份 .bak、数据完好。

---

## 7. 明确不做(YAGNI)

- 不做 down/回滚迁移。
- 不做应用内「恢复备份」UI(备份在磁盘,手动恢复;失败弹窗给出路径)。
- 不引入 Knex/Drizzle/Umzug 等迁移库(对直接用 raw better-sqlite3 的小应用属过度依赖)。
- 不在本 spec 做 electron-updater(单独 spec)。
- 备份不加密/压缩。
