# 仓库层改用 Knex 设计文档

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:当前数据访问层(`src/main/db/{tickets,materials,folders,stats}.ts`)用 raw `better-sqlite3`(同步、prepared statements、`db.transaction`)。Knex 此前仅用于迁移(`migrations.ts`)。本 spec 把四个仓库改为通过一个长生命 Knex 实例执行查询;FTS5 相关语句保持 `knex.raw`。**纯内部重构,无用户可见行为变化**。

> 决策记录:这是对早前"仓库保持 raw better-sqlite3、Knex 仅用于迁移"决定的有意反转,用户已在权衡(sync→async、FTS5 须 raw、无用户可见收益、测试改动量大)后确认执行。

---

## 1. 概述

- 四个仓库(Ticket/Material/Folder/Stats)构造参数由 `better-sqlite3` 的 `Database` 改为 `Knex`,所有方法变为 `async`。
- 普通 CRUD 用 Knex query builder;**FTS5 的 `MATCH` 查询与 contentless-FTS 的 `'delete'` 命令、外部内容同步 insert** 用参数化 `knex.raw`(builder 无法表达,不可避免)。
- 事务用 `knex.transaction(async trx => …)`。
- `createDatabase` 返回长生命 Knex 实例(迁移仍先跑、pragma 经 `afterCreate` 设置)。
- IPC 通道名、渲染层 `api`、SQLite 文件与数据、迁移框架、功能行为**全部不变**(IPC handler 本就返回 Promise,渲染层早已 async)。

---

## 2. 架构

### 2.1 连接 `src/main/db/database.ts`

```ts
import Knex from 'knex'
import type { Knex as KnexType } from 'knex'
import { dirname, join } from 'node:path'
import { runMigrations } from './migrations'

export async function createDatabase(path: string): Promise<KnexType> {
  await runMigrations(path, join(dirname(path), 'backups'))   // 迁移框架不动
  return Knex({
    client: 'better-sqlite3',
    connection: { filename: path },
    useNullAsDefault: true,
    pool: {
      min: 1, max: 1,
      afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
        conn.pragma('journal_mode = WAL')
        conn.pragma('foreign_keys = ON')
        done(null, conn)
      }
    }
  })
}
```

- `pool.max = 1`:SQLite 单写;序列化访问,避免 better-sqlite3 同步连接并发问题。
- `afterCreate` 的 `conn` 是底层 better-sqlite3 `Database`,有 `.pragma()`。
- 返回类型 `Knex`;调用方(ipc.ts、tests)关闭用 `await db.destroy()`。

### 2.2 仓库通用约定

- 构造:`constructor(private db: KnexType, private now: Now = () => Date.now())`(Stats/Material 无 `now`)。
- camelCase ↔ snake_case 映射:每个仓库内定义列别名对象,例如
  ```ts
  const TICKET_COLS = {
    aftersaleNo: 'aftersale_no', orderNo: 'order_no', shippingNo: 'shipping_no', returnNo: 'return_no',
    status: 'status', note: 'note', createdAt: 'created_at', updatedAt: 'updated_at',
    recipientName: 'recipient_name', phone: 'phone',
    provinceCode: 'province_code', province: 'province', cityCode: 'city_code', city: 'city',
    districtCode: 'district_code', district: 'district', addressDetail: 'address_detail', extension: 'extension',
    aftersaleType: 'aftersale_type', aftersaleReason: 'aftersale_reason', shippingStatus: 'shipping_status',
    amount: 'amount', refundAmount: 'refund_amount', appliedAt: 'applied_at', returnLogistics: 'return_logistics'
  } as const
  ```
  `select(TICKET_COLS)` 直接产出 camelCase 结果(无需 `AS` 字符串)。JOIN 场景用 `tickets.` 前缀版本(同一映射 value 加前缀的辅助函数 `qualify(cols, 'tickets')`)。
- 写入 row 时把 camelCase payload 映射成 snake_case 列对象(辅助 `toRow(obj, COLS)`)。

### 2.3 TicketRepo(`src/main/db/tickets.ts`)

- `get(no)`:`await db('tickets').select(TICKET_COLS).where('aftersale_no', no).first()`。
- `list()`:`…select(TICKET_COLS).orderBy('updated_at','desc')`。
- `search(q)`:空 → `list()`;否则
  ```ts
  await db.select(qualify(TICKET_COLS,'tickets'))
    .from('tickets_fts as f')
    .join('tickets', 'tickets.rowid', 'f.rowid')
    .whereRaw('tickets_fts MATCH ?', [match])
    .orderBy('tickets.updated_at', 'desc')
  ```
- `create(t)`:`await db.transaction(async trx => { await trx('tickets').insert(toRow(full,TICKET_COLS)); await ftsInsert(trx, no) })`。
- `update(no, patch)`:`const cur = await this.get(no); if(!cur) return; const next={...}` → `trx`:`ftsDelete`→`trx('tickets').where('aftersale_no',no).update(toRow(next))`→`ftsInsert`。
- `delete(no)`:`trx`:`ftsDelete`→`trx('tickets').where('aftersale_no',no).del()`。
- `existingNos(nos)`:分块 `await db('tickets').whereIn('aftersale_no', slice).pluck('aftersale_no')` 汇成 Set。
- `createMany(list)`:`await db.transaction(async trx => { for(const t of list) await insertOne(trx, t) })`,`insertOne(executor,t)` 复用 insert+ftsInsert(执行器为 trx)。
- FTS 私有方法(接受执行器 `KnexType | KnexType.Transaction`):
  - `ftsInsert(x, no)`:`await x.raw('INSERT INTO tickets_fts (rowid, '+FTS_COLS+') SELECT rowid, '+FTS_COLS+' FROM tickets WHERE aftersale_no = ?', [no])`。
  - `ftsDelete(x, no)`:先 `const row = await x.raw('SELECT rowid, '+FTS_COLS+' FROM tickets WHERE aftersale_no = ?', [no])`(better-sqlite3 client `raw` 返回行数组)→ 若有则 `await x.raw("INSERT INTO tickets_fts(tickets_fts, rowid, "+FTS_COLS+") VALUES('delete', ?, ?, …)", [row.rowid, …])`。

> `FTS_COLS` 常量(列名)拼入 raw 字符串安全(非用户输入)。所有参数走 `?` 绑定。

### 2.4 MaterialRepo(`src/main/db/materials.ts`)

- `add(m)`:`const [id] = await db('materials').insert(toRow({...m, name:m.name??'', folder:m.folder??''})); return Number(id)`(better-sqlite3 client 返回 `[lastInsertRowid]`)。
- `listByTicket(no)`:`select(MATERIAL_COLS).where('aftersale_no',no).orderBy('imported_at')`。
- `getByIds(ids)`:空→`[]`;否则 `whereIn('id', ids)`。
- `setThumb(id,p)` / `setFolder(id,f)` / `remove(id)`:`update`/`del`。

### 2.5 FolderRepo(`src/main/db/folders.ts`)

- `create(no, path)`:先 `normalizeSegment` 校验每段(逻辑不变);`await db.transaction(async trx => { for(const p of ancestorsAndSelf(path)) await trx('material_folders').insert({aftersale_no:no, path:p, created_at:ts}).onConflict(['aftersale_no','path']).ignore() })`。
- `list(no)`:`db('material_folders').where('aftersale_no',no).orderBy('path').pluck('path')`。
- `rename(no, path, newName)`:`newPath` 计算不变;冲突检查 `await db('material_folders').where({aftersale_no:no, path:newPath}).first()`;`trx`:取 folders/materials,按 `isUnderOrEqual` + `rewritePrefix` 逐条 `update`(逻辑不变,加 await)。
- `remove(no, path)`:`trx`:取 materials → `inSub` → `affected` → `whereIn('id', inSubIds).del()`;取 folders → `whereIn('id', subFolderIds).del()`;返回 `affected`。

### 2.6 StatsRepo(`src/main/db/stats.ts`)

- `regionCounts(level)`:固定列映射 `COLS`(不变);
  ```ts
  const rows = await db('tickets')
    .select({ code: col.code, name: col.name }).count({ count: '*' })
    .whereNot(col.code, '').groupBy(col.code, col.name)
    .orderBy([{ column: 'count', order: 'desc' }, { column: col.name, order: 'asc' }])
  return rows.map(r => ({ code: r.code, name: r.name, count: Number(r.count) }))
  ```
- `summary()`:`const total = Number((await db('tickets').count({n:'*'}))[0].n)`;`classified` 同理加 `.whereNot('province_code','')`;返回 `{total, classified, unclassified: total-classified}`。

### 2.7 服务 & IPC

- `Importer.record`:`const id = await this.materials.add(...)`;`const created = (await this.materials.getByIds([id]))[0]`。
- `Scanner.calibrateTicket` → `async`,返回 `Promise<number>`;`for (const m of await this.materials.listByTicket(no))`,`await this.materials.remove(m.id)`。
- `ipc.ts`:
  - `tickets:delete`、`tickets:import`、`folders:remove` 改 `async` 并 `await` 内部 repo 调用(`materials.listByTicket`、`tickets.existingNos/createMany`、`folderRepo.remove`)。
  - 其余单调用 handler 直接返回 repo 的 Promise(`ipcMain.handle` 会自动 await),无需改。

---

## 3. 数据流(不变)

```
renderer api (async) ─ipc invoke→ ipcMain.handle ─→ Repo.method() [现 async, 经 Knex]
  → Knex(client better-sqlite3, pool max 1) → 同一 SQLite 文件
```

通道名、参数、返回结构、SQLite schema/数据均不变。

---

## 4. 错误处理 / 边界

- **事务**:`knex.transaction(async trx=>…)` 抛错自动回滚;FTS 与主表写在同一 trx,保持原子性(与原 `db.transaction` 一致)。
- **`pool.max=1`**:避免 better-sqlite3 同步连接的并发交叉;所有调用经同一连接序列化。
- **FTS `raw` 注入**:列名为常量、值全参数化(`?`),无注入面。
- **`existingNos` 分块**:沿用 500/批,`whereIn` 防止参数过多。
- **lastInsertRowid**:`insert` 返回 `[id]`,`Number(id)` 兜底 BigInt。
- **关闭**:`db.destroy()`(async);测试 `afterEach` 须 await。
- **迁移**:仍由 `runMigrations` 独立短生命 Knex 完成,长生命实例只读已迁移好的库。

---

## 5. 测试策略

- `tests/db/helpers.ts`:`makeTempDb()` 返回 `{ db: Knex; cleanup: () => Promise<void> }`,`cleanup = async () => { await db.destroy(); rmSync(dir,{recursive,force}) }`。所有用例的 `afterEach(() => cleanup())` 改 `afterEach(async () => { await cleanup() })`。
- `tests/db/database.test.ts`:断言改用 Knex 自省 —
  - 表名:`await db('sqlite_master').where('type','table').pluck('name')`。
  - 外键:`(await db.raw('PRAGMA foreign_keys'))` 取 `foreign_keys===1`(注意 better-sqlite3 client `raw` 返回行数组,取 `[0]`)。
  - 列:`await db.raw('PRAGMA table_info(tickets)')` → map `name`。
  - 迁移记录:`await db('knex_migrations').pluck('name')` 含 `0001_baseline`。
- `tests/db/{tickets,materials,folders,stats}.test.ts`:repo 方法调用前加 `await`;断言(返回值/计数/顺序)不变。
- `tests/services/{importer,scanner}.test.ts`:若它们直接断言 repo 状态或 mock repo,改为 await / async mock 返回。
- 行为不变 → 现有断言基本保留,只加 `await` 与 async 包装。
- 全套 `npx vitest run` 0 失败(跑前 `npm run rebuild:node`;若 db 测试报 `node_modules/knex/node_modules/better-sqlite3` 缺 build,`rm -rf` 该嵌套副本让其回退到顶层 node-ABI 副本)。

---

## 6. 明确不做(YAGNI)

- 不改迁移框架(`migrations.ts` 维持现状)。
- 不改 IPC 通道名 / 渲染层 `api` / preload。
- 不改 SQLite schema、不动数据、不做数据迁移。
- 不引入 Knex models/ORM 层(仅 query builder + 必要 raw)。
- 不改 FTS5 的策略(仍 contentless 外部内容 + 手动同步),只是改用 `knex.raw` 执行同样语句。
- 不追求"消灭所有 raw"(FTS 注定 raw)。
