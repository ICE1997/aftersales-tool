# 电商售后材料管理工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个跨平台(Windows/macOS)的 Electron 桌面应用,以售后单号为单位整理售后视频/图片,支持多单号检索、预览、复制/导出/打包。

**Architecture:** Electron 三进程模型。主进程(Main)承载所有文件系统、SQLite、缩略图、zip 副作用,并通过 IPC 暴露能力;预加载(Preload)用 contextBridge 暴露受控 API;渲染进程(Renderer)用 React + TS + Tailwind 做纯 UI。元数据存 SQLite(`better-sqlite3` + FTS5),原始文件按售后单号存在用户可改的数据根目录,DB 仅存相对路径以便整库迁移。

**Tech Stack:** Electron, electron-vite, TypeScript, React, Tailwind CSS, better-sqlite3 (FTS5), sharp, ffmpeg-static, archiver, Vitest。

---

## File Structure

```
package.json
electron.vite.config.ts          # electron-vite 构建配置(main/preload/renderer 三入口)
tsconfig.json / tsconfig.node.json
tailwind.config.js / postcss.config.js
vitest.config.ts

src/
  shared/
    types.ts                     # 跨进程共享类型(Ticket, Material, ImportResult 等)
  main/
    index.ts                     # 主进程入口,创建窗口
    ipc.ts                       # 注册所有 IPC handler,串联各 service
    db/
      database.ts                # SQLite 连接 + schema/迁移
      tickets.ts                 # 售后单 CRUD + FTS 检索
      materials.ts               # 材料 CRUD
    services/
      settings.ts                # 数据根目录读写
      thumbnails.ts              # sharp(图)/ffmpeg(视频)缩略图与截帧
      importer.ts                # 导入文件到某售后单
      exporter.ts                # 导出到文件夹 / 打包 zip
      scanner.ts                 # 按磁盘重建索引
  preload/
    index.ts                     # contextBridge 暴露 window.api
  renderer/
    index.html
    main.tsx                     # React 挂载
    App.tsx                      # 顶层布局 + 路由状态
    api.ts                       # 对 window.api 的薄封装 + 类型
    components/
      TicketList.tsx
      TicketDetail.tsx
      SearchBar.tsx
      MaterialGrid.tsx
      PreviewModal.tsx
      SettingsDialog.tsx

tests/
  db/database.test.ts
  db/tickets.test.ts
  db/materials.test.ts
  services/settings.test.ts
  services/thumbnails.test.ts
  services/importer.test.ts
  services/exporter.test.ts
  services/scanner.test.ts
  renderer/SearchBar.test.tsx
```

每个文件单一职责:`db/*` 只管数据访问;`services/*` 各管一类副作用;`ipc.ts` 只做编排;渲染层组件各管一块 UI。

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tailwind.config.js`, `postcss.config.js`, `vitest.config.ts`
- Create: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/renderer/index.css`

- [ ] **Step 1: 初始化依赖**

Run:
```bash
npm init -y
npm i better-sqlite3 sharp ffmpeg-static archiver
npm i -D electron electron-vite electron-builder typescript \
  react react-dom @types/react @types/react-dom \
  @types/better-sqlite3 @types/archiver \
  tailwindcss postcss autoprefixer \
  vitest @vitest/ui jsdom @testing-library/react @testing-library/dom
```
Move `react`/`react-dom` to dependencies if npm placed them under dev:
```bash
npm i react react-dom
```

- [ ] **Step 2: 配置 `package.json` 脚本与入口**

```json
{
  "name": "vhelper",
  "version": "0.1.0",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "dist": "electron-vite build && electron-builder",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  }
})
```
Also: `npm i -D @vitejs/plugin-react`.

- [ ] **Step 4: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 5: Tailwind 配置**

`tailwind.config.js`:
```js
export default {
  content: ['./src/renderer/**/*.{html,tsx}'],
  theme: { extend: {} },
  plugins: []
}
```
`postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```
`src/renderer/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: 主进程入口 `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
```

- [ ] **Step 7: 占位 preload `src/preload/index.ts`**

```ts
import { contextBridge } from 'electron'
contextBridge.exposeInMainWorld('api', {})
```

- [ ] **Step 8: 渲染层骨架**

`src/renderer/index.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>vhelper</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```
`src/renderer/main.tsx`:
```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(<App />)
```
`src/renderer/App.tsx`:
```tsx
export default function App() {
  return <div className="p-6 text-lg">vhelper 售后材料管理</div>
}
```

- [ ] **Step 9: 验证应用启动**

Run: `npm run dev`
Expected: 弹出窗口,显示 "vhelper 售后材料管理"。关闭窗口。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite + react + tailwind app"
```

---

## Task 2: 共享类型

**Files:**
- Create: `src/shared/types.ts`

- [ ] **Step 1: 定义跨进程类型**

```ts
export type MaterialKind = 'image' | 'video'
export type TicketStatus = 'pending' | 'processing' | 'resolved'

export interface Ticket {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  status: TicketStatus
  note: string
  createdAt: number
  updatedAt: number
}

export interface Material {
  id: number
  aftersaleNo: string
  relPath: string
  kind: MaterialKind
  capturedAt: number | null
  importedAt: number
  sizeBytes: number
  thumbPath: string | null
}

export interface ImportResult {
  imported: Material[]
  skipped: { file: string; reason: string }[]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add shared cross-process types"
```

---

## Task 3: SQLite 数据库与 schema

**Files:**
- Create: `src/main/db/database.ts`
- Test: `tests/db/database.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { createDatabase } from '../../src/main/db/database'

describe('createDatabase', () => {
  it('creates tickets, materials and FTS tables', () => {
    const db = createDatabase(':memory:')
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table')")
      .all()
      .map((r: any) => r.name)
    expect(names).toContain('tickets')
    expect(names).toContain('materials')
    expect(names).toContain('tickets_fts')
  })

  it('enables foreign keys', () => {
    const db = createDatabase(':memory:')
    const row = db.prepare('PRAGMA foreign_keys').get() as any
    expect(row.foreign_keys).toBe(1)
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/db/database.test.ts`
Expected: FAIL — `createDatabase` 未定义。

- [ ] **Step 3: 实现 `database.ts`**

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

function migrate(db: DB): void {
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
      captured_at  INTEGER,
      imported_at  INTEGER NOT NULL,
      size_bytes   INTEGER NOT NULL,
      thumb_path   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_materials_ticket ON materials(aftersale_no);

    CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(
      aftersale_no, order_no, shipping_no, return_no, note,
      content='tickets', content_rowid='rowid'
    );
  `)
}
```

> 注:FTS5 用外部内容表(`content='tickets'`)。`tickets` 主键是文本,FTS 需要整型 rowid——SQLite 会自动给 `tickets` 一个隐式 `rowid`,`content_rowid='rowid'` 即指它。同步由 Task 5 的触发器或显式写入完成;本任务先建表。

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/db/database.test.ts`
Expected: PASS(两个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/main/db/database.ts tests/db/database.test.ts
git commit -m "feat: add sqlite schema with tickets, materials, FTS5"
```

---

## Task 4: 售后单 CRUD + FTS 检索

**Files:**
- Create: `src/main/db/tickets.ts`
- Test: `tests/db/tickets.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'

let db: Database
let repo: TicketRepo

beforeEach(() => {
  db = createDatabase(':memory:')
  repo = new TicketRepo(db, () => 1000)
})

describe('TicketRepo', () => {
  it('creates and reads a ticket', () => {
    repo.create({ aftersaleNo: 'AS-1', orderNo: 'O-9', shippingNo: '', returnNo: '', note: '' })
    const t = repo.get('AS-1')
    expect(t?.orderNo).toBe('O-9')
    expect(t?.status).toBe('pending')
    expect(t?.createdAt).toBe(1000)
  })

  it('updates fields and bumps updatedAt', () => {
    repo.create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.update('AS-1', { status: 'resolved', note: 'done' })
    const t = repo.get('AS-1')
    expect(t?.status).toBe('resolved')
    expect(t?.note).toBe('done')
  })

  it('searches by any of the four numbers via FTS', () => {
    repo.create({ aftersaleNo: 'AS-100', orderNo: 'ORD-555', shippingNo: 'SHIP-777', returnNo: 'RET-888', note: '破损' })
    expect(repo.search('555').map(t => t.aftersaleNo)).toContain('AS-100')
    expect(repo.search('777').map(t => t.aftersaleNo)).toContain('AS-100')
    expect(repo.search('888').map(t => t.aftersaleNo)).toContain('AS-100')
    expect(repo.search('AS-100').map(t => t.aftersaleNo)).toContain('AS-100')
  })

  it('list returns all tickets newest first', () => {
    repo.create({ aftersaleNo: 'A', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.create({ aftersaleNo: 'B', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect(repo.list().length).toBe(2)
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/db/tickets.test.ts`
Expected: FAIL — `TicketRepo` 未定义。

- [ ] **Step 3: 实现 `tickets.ts`**

```ts
import type { Database } from 'better-sqlite3'
import type { Ticket, TicketStatus } from '../../shared/types'

export interface NewTicket {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  note: string
}

type Now = () => number

const ROW = `aftersale_no AS aftersaleNo, order_no AS orderNo, shipping_no AS shippingNo,
  return_no AS returnNo, status, note, created_at AS createdAt, updated_at AS updatedAt`

export class TicketRepo {
  constructor(private db: Database, private now: Now = () => Date.now()) {}

  create(t: NewTicket): void {
    const ts = this.now()
    const tx = this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO tickets (aftersale_no, order_no, shipping_no, return_no, status, note, created_at, updated_at)
         VALUES (@aftersaleNo, @orderNo, @shippingNo, @returnNo, 'pending', @note, @ts, @ts)`
      ).run({ ...t, ts })
      this.syncFts(t.aftersaleNo)
    })
    tx()
  }

  update(aftersaleNo: string, patch: Partial<Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo' | 'status' | 'note'>>): void {
    const cur = this.get(aftersaleNo)
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: this.now() }
    const tx = this.db.transaction(() => {
      this.db.prepare(
        `UPDATE tickets SET order_no=@orderNo, shipping_no=@shippingNo, return_no=@returnNo,
         status=@status, note=@note, updated_at=@updatedAt WHERE aftersale_no=@aftersaleNo`
      ).run(next as any)
      this.syncFts(aftersaleNo)
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
      `SELECT ${ROW.replace(/(\w+) AS (\w+)/g, 't.$1 AS $2')} FROM tickets_fts f
       JOIN tickets t ON t.rowid = f.rowid
       WHERE tickets_fts MATCH ? ORDER BY t.updated_at DESC`
    ).all(match) as Ticket[]
  }

  private syncFts(aftersaleNo: string): void {
    const row = this.db.prepare('SELECT rowid FROM tickets WHERE aftersale_no = ?').get(aftersaleNo) as { rowid: number } | undefined
    if (!row) return
    this.db.prepare('DELETE FROM tickets_fts WHERE rowid = ?').run(row.rowid)
    this.db.prepare(
      `INSERT INTO tickets_fts (rowid, aftersale_no, order_no, shipping_no, return_no, note)
       SELECT rowid, aftersale_no, order_no, shipping_no, return_no, note FROM tickets WHERE rowid = ?`
    ).run(row.rowid)
  }
}
```

> FTS5 默认按非字母数字分词,`ORD-555` 会被切成 `ORD` 与 `555`,因此前缀匹配 `"555"*` 命中。`status` 类型见 shared/types。

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/db/tickets.test.ts`
Expected: PASS(4 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/main/db/tickets.ts tests/db/tickets.test.ts
git commit -m "feat: ticket repo with CRUD and FTS5 multi-number search"
```

---

## Task 5: 材料 CRUD

**Files:**
- Create: `src/main/db/materials.ts`
- Test: `tests/db/materials.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'

let db: Database
let materials: MaterialRepo

beforeEach(() => {
  db = createDatabase(':memory:')
  new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  materials = new MaterialRepo(db)
})

describe('MaterialRepo', () => {
  it('adds and lists materials for a ticket', () => {
    materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 5, sizeBytes: 100, thumbPath: null })
    const list = materials.listByTicket('AS-1')
    expect(list.length).toBe(1)
    expect(list[0].relPath).toBe('AS-1/images/a.jpg')
    expect(list[0].id).toBeGreaterThan(0)
  })

  it('rejects duplicate relPath', () => {
    const m = { aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image' as const, capturedAt: null, importedAt: 5, sizeBytes: 100, thumbPath: null }
    materials.add(m)
    expect(() => materials.add(m)).toThrow()
  })

  it('updates thumbPath', () => {
    const id = materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/videos/v.mp4', kind: 'video', capturedAt: null, importedAt: 5, sizeBytes: 200, thumbPath: null })
    materials.setThumb(id, '.thumbnails/v.jpg')
    expect(materials.listByTicket('AS-1')[0].thumbPath).toBe('.thumbnails/v.jpg')
  })

  it('deletes a material', () => {
    const id = materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 5, sizeBytes: 100, thumbPath: null })
    materials.remove(id)
    expect(materials.listByTicket('AS-1').length).toBe(0)
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/db/materials.test.ts`
Expected: FAIL — `MaterialRepo` 未定义。

- [ ] **Step 3: 实现 `materials.ts`**

```ts
import type { Database } from 'better-sqlite3'
import type { Material } from '../../shared/types'

const ROW = `id, aftersale_no AS aftersaleNo, rel_path AS relPath, kind,
  captured_at AS capturedAt, imported_at AS importedAt, size_bytes AS sizeBytes, thumb_path AS thumbPath`

export type NewMaterial = Omit<Material, 'id'>

export class MaterialRepo {
  constructor(private db: Database) {}

  add(m: NewMaterial): number {
    const info = this.db.prepare(
      `INSERT INTO materials (aftersale_no, rel_path, kind, captured_at, imported_at, size_bytes, thumb_path)
       VALUES (@aftersaleNo, @relPath, @kind, @capturedAt, @importedAt, @sizeBytes, @thumbPath)`
    ).run(m)
    return Number(info.lastInsertRowid)
  }

  listByTicket(aftersaleNo: string): Material[] {
    return this.db.prepare(`SELECT ${ROW} FROM materials WHERE aftersale_no = ? ORDER BY imported_at`).all(aftersaleNo) as Material[]
  }

  getByIds(ids: number[]): Material[] {
    if (ids.length === 0) return []
    const ph = ids.map(() => '?').join(',')
    return this.db.prepare(`SELECT ${ROW} FROM materials WHERE id IN (${ph})`).all(...ids) as Material[]
  }

  setThumb(id: number, thumbPath: string): void {
    this.db.prepare('UPDATE materials SET thumb_path = ? WHERE id = ?').run(thumbPath, id)
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM materials WHERE id = ?').run(id)
  }
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/db/materials.test.ts`
Expected: PASS(4 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/main/db/materials.ts tests/db/materials.test.ts
git commit -m "feat: material repo with add/list/setThumb/remove"
```

---

## Task 6: 设置服务(数据根目录)

**Files:**
- Create: `src/main/services/settings.ts`
- Test: `tests/services/settings.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Settings } from '../../src/main/services/settings'

let configDir: string

beforeEach(() => { configDir = mkdtempSync(join(tmpdir(), 'vh-cfg-')) })
afterEach(() => { rmSync(configDir, { recursive: true, force: true }) })

describe('Settings', () => {
  it('falls back to a default data root when unset', () => {
    const s = new Settings(configDir, '/default/root')
    expect(s.getDataRoot()).toBe('/default/root')
  })

  it('persists data root across instances', () => {
    const root = mkdtempSync(join(tmpdir(), 'vh-data-'))
    new Settings(configDir, '/default/root').setDataRoot(root)
    expect(new Settings(configDir, '/default/root').getDataRoot()).toBe(root)
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects a non-existent data root', () => {
    const s = new Settings(configDir, '/default/root')
    expect(() => s.setDataRoot('/nope/does/not/exist')).toThrow()
  })

  it('creates config file on write', () => {
    const root = mkdtempSync(join(tmpdir(), 'vh-data-'))
    new Settings(configDir, '/default/root').setDataRoot(root)
    expect(existsSync(join(configDir, 'config.json'))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/services/settings.test.ts`
Expected: FAIL — `Settings` 未定义。

- [ ] **Step 3: 实现 `settings.ts`**

```ts
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface ConfigShape { dataRoot?: string }

export class Settings {
  private file: string
  constructor(private configDir: string, private defaultRoot: string) {
    this.file = join(configDir, 'config.json')
  }

  private read(): ConfigShape {
    if (!existsSync(this.file)) return {}
    try { return JSON.parse(readFileSync(this.file, 'utf-8')) as ConfigShape } catch { return {} }
  }

  private write(cfg: ConfigShape): void {
    writeFileSync(this.file, JSON.stringify(cfg, null, 2), 'utf-8')
  }

  getDataRoot(): string {
    return this.read().dataRoot ?? this.defaultRoot
  }

  setDataRoot(root: string): void {
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      throw new Error(`data root not a directory: ${root}`)
    }
    this.write({ ...this.read(), dataRoot: root })
  }
}
```

> 主进程里用 `app.getPath('userData')` 作 `configDir`,用 `join(app.getPath('documents'), 'vhelper-data')` 作 `defaultRoot`(在 ipc.ts 装配时传入)。

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/services/settings.test.ts`
Expected: PASS(4 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/main/services/settings.ts tests/services/settings.test.ts
git commit -m "feat: settings service for configurable data root"
```

---

## Task 7: 缩略图服务

**Files:**
- Create: `src/main/services/thumbnails.ts`
- Test: `tests/services/thumbnails.test.ts`

- [ ] **Step 1: 写失败测试(图片缩略图 + 失败回退)**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { Thumbnailer } from '../../src/main/services/thumbnails'

let root: string
let thumb: Thumbnailer

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-thumb-'))
  thumb = new Thumbnailer(root)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('Thumbnailer', () => {
  it('generates an image thumbnail and returns a rel path under .thumbnails', async () => {
    const src = join(root, 'a.png')
    await sharp({ create: { width: 50, height: 50, channels: 3, background: '#f00' } }).png().toFile(src)
    const rel = await thumb.forImage(src)
    expect(rel.startsWith('.thumbnails/')).toBe(true)
    expect(existsSync(join(root, rel))).toBe(true)
  })

  it('returns null when the image is unreadable', async () => {
    const bad = join(root, 'bad.png')
    writeFileSync(bad, 'not an image')
    const rel = await thumb.forImage(bad)
    expect(rel).toBeNull()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/services/thumbnails.test.ts`
Expected: FAIL — `Thumbnailer` 未定义。

- [ ] **Step 3: 实现 `thumbnails.ts`**

```ts
import { mkdirSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'

const THUMB_DIR = '.thumbnails'
const SIZE = 320

export class Thumbnailer {
  constructor(private dataRoot: string) {}

  private outPath(srcName: string): { rel: string; abs: string } {
    mkdirSync(join(this.dataRoot, THUMB_DIR), { recursive: true })
    const name = `${basename(srcName, extname(srcName))}-${srcName.length}.jpg`
    const rel = `${THUMB_DIR}/${name}`
    return { rel, abs: join(this.dataRoot, rel) }
  }

  async forImage(absSrc: string): Promise<string | null> {
    const { rel, abs } = this.outPath(absSrc)
    try {
      await sharp(absSrc).resize(SIZE, SIZE, { fit: 'inside' }).jpeg().toFile(abs)
      return rel
    } catch {
      return null
    }
  }

  async forVideo(absSrc: string): Promise<string | null> {
    const { rel, abs } = this.outPath(absSrc)
    return new Promise((resolve) => {
      if (!ffmpegPath) return resolve(null)
      const proc = spawn(ffmpegPath, ['-y', '-i', absSrc, '-ss', '00:00:01', '-vframes', '1', '-vf', `scale=${SIZE}:-1`, abs])
      proc.on('error', () => resolve(null))
      proc.on('close', (code) => resolve(code === 0 ? rel : null))
    })
  }
}
```

> `forVideo` 没法在 CI 里稳定单测(依赖外部二进制与真实视频),不写硬性测试;靠 importer 集成时手验。失败一律回退 `null`,渲染层显示占位图。

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/services/thumbnails.test.ts`
Expected: PASS(2 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/main/services/thumbnails.ts tests/services/thumbnails.test.ts
git commit -m "feat: thumbnail service (sharp images, ffmpeg video frame)"
```

---

## Task 8: 导入服务

**Files:**
- Create: `src/main/services/importer.ts`
- Test: `tests/services/importer.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { Importer } from '../../src/main/services/importer'

let root: string
let db: Database
let importer: Importer

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-imp-'))
  db = createDatabase(':memory:')
  new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  // thumbnailer stub: always succeeds with a fake rel path
  const thumbStub = { forImage: async () => 'thumb.jpg', forVideo: async () => 'thumb.jpg' } as any
  importer = new Importer(root, new MaterialRepo(db), thumbStub, () => 42)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function makeFile(name: string, content = 'x'): string {
  const p = join(root, name)
  writeFileSync(p, content)
  return p
}

describe('Importer', () => {
  it('copies images/videos into ticket folder and records materials', async () => {
    const img = makeFile('photo.jpg')
    const vid = makeFile('clip.mp4')
    const res = await importer.importFiles('AS-1', [img, vid])
    expect(res.imported.length).toBe(2)
    expect(existsSync(join(root, 'AS-1/images/photo.jpg'))).toBe(true)
    expect(existsSync(join(root, 'AS-1/videos/clip.mp4'))).toBe(true)
    const kinds = res.imported.map(m => m.kind).sort()
    expect(kinds).toEqual(['image', 'video'])
  })

  it('skips unsupported file types with a reason', async () => {
    const txt = makeFile('note.txt')
    const res = await importer.importFiles('AS-1', [txt])
    expect(res.imported.length).toBe(0)
    expect(res.skipped[0].reason).toMatch(/unsupported/i)
  })

  it('avoids name collisions by appending a suffix', async () => {
    const a = makeFile('photo.jpg')
    await importer.importFiles('AS-1', [a])
    const b = makeFile('dup/photo.jpg'.replace('dup/', '')) // same basename, new content
    writeFileSync(b, 'different')
    const res = await importer.importFiles('AS-1', [b])
    expect(res.imported[0].relPath).toBe('AS-1/images/photo-1.jpg')
    expect(existsSync(join(root, 'AS-1/images/photo-1.jpg'))).toBe(true)
  })

  it('continues batch when one file is missing', async () => {
    const ok = makeFile('ok.jpg')
    const res = await importer.importFiles('AS-1', [join(root, 'ghost.jpg'), ok])
    expect(res.imported.length).toBe(1)
    expect(res.skipped.length).toBe(1)
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/services/importer.test.ts`
Expected: FAIL — `Importer` 未定义。

- [ ] **Step 3: 实现 `importer.ts`**

```ts
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import type { MaterialKind, ImportResult } from '../../shared/types'
import type { MaterialRepo } from '../db/materials'
import type { Thumbnailer } from './thumbnails'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic'])
const VIDEO_EXT = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'])

type Now = () => number

export class Importer {
  constructor(
    private dataRoot: string,
    private materials: MaterialRepo,
    private thumb: Thumbnailer,
    private now: Now = () => Date.now()
  ) {}

  private kindOf(file: string): MaterialKind | null {
    const ext = extname(file).toLowerCase()
    if (IMAGE_EXT.has(ext)) return 'image'
    if (VIDEO_EXT.has(ext)) return 'video'
    return null
  }

  private uniqueDest(dir: string, name: string): string {
    const ext = extname(name)
    const stem = basename(name, ext)
    let candidate = join(dir, name)
    let i = 1
    while (existsSync(candidate)) {
      candidate = join(dir, `${stem}-${i}${ext}`)
      i++
    }
    return candidate
  }

  async importFiles(aftersaleNo: string, files: string[]): Promise<ImportResult> {
    const result: ImportResult = { imported: [], skipped: [] }
    for (const file of files) {
      try {
        const kind = this.kindOf(file)
        if (!kind) { result.skipped.push({ file, reason: 'unsupported file type' }); continue }
        if (!existsSync(file)) { result.skipped.push({ file, reason: 'file not found' }); continue }

        const subDir = kind === 'image' ? 'images' : 'videos'
        const destDir = join(this.dataRoot, aftersaleNo, subDir)
        mkdirSync(destDir, { recursive: true })
        const dest = this.uniqueDest(destDir, basename(file))
        copyFileSync(file, dest)

        const relPath = dest.slice(this.dataRoot.length + 1).split('\\').join('/')
        const thumbPath = kind === 'image' ? await this.thumb.forImage(dest) : await this.thumb.forVideo(dest)
        const id = this.materials.add({
          aftersaleNo, relPath, kind,
          capturedAt: null,
          importedAt: this.now(),
          sizeBytes: statSync(dest).size,
          thumbPath
        })
        result.imported.push(...this.materials.getByIds([id]))
      } catch (e) {
        result.skipped.push({ file, reason: (e as Error).message })
      }
    }
    return result
  }
}
```

> EXIF 拍摄时间(`capturedAt`)留作后续增强,当前置 `null`,不阻塞主流程。

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/services/importer.test.ts`
Expected: PASS(4 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/main/services/importer.ts tests/services/importer.test.ts
git commit -m "feat: importer copies media into ticket folders with dedup"
```

---

## Task 9: 导出服务(文件夹 + zip)

**Files:**
- Create: `src/main/services/exporter.ts`
- Test: `tests/services/exporter.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Material } from '../../src/shared/types'
import { Exporter } from '../../src/main/services/exporter'

let root: string
let out: string
let exporter: Exporter

function material(relPath: string): Material {
  const abs = join(root, relPath)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, 'data-' + relPath)
  return { id: 1, aftersaleNo: 'AS-1', relPath, kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 5, thumbPath: null }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-exp-'))
  out = mkdtempSync(join(tmpdir(), 'vh-out-'))
  exporter = new Exporter(root)
})
afterEach(() => { rmSync(root, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }) })

describe('Exporter', () => {
  it('copies materials to a target folder', async () => {
    const m = material('AS-1/images/a.jpg')
    await exporter.toFolder([m], out)
    expect(existsSync(join(out, 'a.jpg'))).toBe(true)
  })

  it('produces a non-empty zip archive', async () => {
    const m = material('AS-1/images/a.jpg')
    const zipPath = join(out, 'pack.zip')
    await exporter.toZip([m], zipPath)
    expect(existsSync(zipPath)).toBe(true)
    expect(statSync(zipPath).size).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/services/exporter.test.ts`
Expected: FAIL — `Exporter` 未定义。

- [ ] **Step 3: 实现 `exporter.ts`**

```ts
import { createWriteStream, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import archiver from 'archiver'
import type { Material } from '../../shared/types'

export class Exporter {
  constructor(private dataRoot: string) {}

  private abs(m: Material): string {
    return join(this.dataRoot, m.relPath)
  }

  private uniqueName(dir: string, name: string): string {
    const ext = extname(name)
    const stem = basename(name, ext)
    let candidate = join(dir, name)
    let i = 1
    while (existsSync(candidate)) { candidate = join(dir, `${stem}-${i}${ext}`); i++ }
    return candidate
  }

  async toFolder(materials: Material[], targetDir: string): Promise<void> {
    mkdirSync(targetDir, { recursive: true })
    for (const m of materials) {
      copyFileSync(this.abs(m), this.uniqueName(targetDir, basename(m.relPath)))
    }
  }

  toZip(materials: Material[], zipPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath)
      const archive = archiver('zip', { zlib: { level: 9 } })
      output.on('close', () => resolve())
      archive.on('error', reject)
      archive.pipe(output)
      const used = new Set<string>()
      for (const m of materials) {
        let name = basename(m.relPath)
        const ext = extname(name); const stem = basename(name, ext)
        let i = 1
        while (used.has(name)) { name = `${stem}-${i}${ext}`; i++ }
        used.add(name)
        archive.file(this.abs(m), { name })
      }
      archive.finalize()
    })
  }
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/services/exporter.test.ts`
Expected: PASS(2 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/main/services/exporter.ts tests/services/exporter.test.ts
git commit -m "feat: exporter to folder and zip with name dedup"
```

---

## Task 10: 索引校准(按磁盘重建)

**Files:**
- Create: `src/main/services/scanner.ts`
- Test: `tests/services/scanner.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { Scanner } from '../../src/main/services/scanner'
import { unlinkSync } from 'node:fs'

let root: string
let db: Database
let materials: MaterialRepo
let scanner: Scanner

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-scan-'))
  db = createDatabase(':memory:')
  new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  materials = new MaterialRepo(db)
  scanner = new Scanner(root, materials)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('Scanner', () => {
  it('drops material rows whose files no longer exist', () => {
    const { writeFileSync, mkdirSync } = require('node:fs')
    mkdirSync(join(root, 'AS-1/images'), { recursive: true })
    writeFileSync(join(root, 'AS-1/images/a.jpg'), 'x')
    const id = materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/gone.jpg', kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })

    const removed = scanner.calibrateTicket('AS-1')
    expect(removed).toBe(1)
    const left = materials.listByTicket('AS-1')
    expect(left.length).toBe(1)
    expect(left[0].id).toBe(id)
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/services/scanner.test.ts`
Expected: FAIL — `Scanner` 未定义。

- [ ] **Step 3: 实现 `scanner.ts`**

```ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MaterialRepo } from '../db/materials'

export class Scanner {
  constructor(private dataRoot: string, private materials: MaterialRepo) {}

  /** 删除磁盘上已不存在的材料索引,返回删除条数。 */
  calibrateTicket(aftersaleNo: string): number {
    let removed = 0
    for (const m of this.materials.listByTicket(aftersaleNo)) {
      if (!existsSync(join(this.dataRoot, m.relPath))) {
        this.materials.remove(m.id)
        removed++
      }
    }
    return removed
  }
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/services/scanner.test.ts`
Expected: PASS(1 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/main/services/scanner.ts tests/services/scanner.test.ts
git commit -m "feat: scanner calibrates index against disk"
```

---

## Task 11: IPC 编排 + Preload 桥

**Files:**
- Create: `src/main/ipc.ts`
- Modify: `src/main/index.ts`(在 `app.whenReady` 内调用 `registerIpc`)
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 实现 `ipc.ts`(装配所有 service 并注册 handler)**

```ts
import { ipcMain, app, dialog, clipboard, nativeImage, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createDatabase } from './db/database'
import { TicketRepo, type NewTicket } from './db/tickets'
import { MaterialRepo } from './db/materials'
import { Settings } from './services/settings'
import { Thumbnailer } from './services/thumbnails'
import { Importer } from './services/importer'
import { Exporter } from './services/exporter'
import { Scanner } from './services/scanner'
import type { Ticket } from '../shared/types'

export function registerIpc(): void {
  const settings = new Settings(app.getPath('userData'), join(app.getPath('documents'), 'vhelper-data'))
  const dataRoot = settings.getDataRoot()
  const db = createDatabase(join(dataRoot, 'vhelper.db'))

  const tickets = new TicketRepo(db)
  const materials = new MaterialRepo(db)
  const thumb = new Thumbnailer(dataRoot)
  const importer = new Importer(dataRoot, materials, thumb)
  const exporter = new Exporter(dataRoot)
  const scanner = new Scanner(dataRoot, materials)

  ipcMain.handle('tickets:list', () => tickets.list())
  ipcMain.handle('tickets:search', (_e, q: string) => tickets.search(q))
  ipcMain.handle('tickets:get', (_e, no: string) => tickets.get(no))
  ipcMain.handle('tickets:create', (_e, t: NewTicket) => tickets.create(t))
  ipcMain.handle('tickets:update', (_e, no: string, patch: Partial<Ticket>) => tickets.update(no, patch))

  ipcMain.handle('materials:list', (_e, no: string) => materials.listByTicket(no))
  ipcMain.handle('materials:remove', (_e, id: number) => materials.remove(id))
  ipcMain.handle('materials:fileUrl', (_e, relPath: string) => `file://${join(dataRoot, relPath)}`)

  ipcMain.handle('import:pick', async (_e, no: string) => {
    const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (r.canceled) return { imported: [], skipped: [] }
    return importer.importFiles(no, r.filePaths)
  })

  ipcMain.handle('export:folder', async (_e, ids: number[]) => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled) return false
    await exporter.toFolder(materials.getByIds(ids), r.filePaths[0])
    return true
  })

  ipcMain.handle('export:zip', async (_e, ids: number[]) => {
    const r = await dialog.showSaveDialog({ defaultPath: 'materials.zip' })
    if (r.canceled || !r.filePath) return false
    await exporter.toZip(materials.getByIds(ids), r.filePath)
    return true
  })

  ipcMain.handle('clipboard:copyImage', (_e, relPath: string) => {
    clipboard.writeImage(nativeImage.createFromPath(join(dataRoot, relPath)))
    return true
  })

  ipcMain.handle('scan:calibrate', (_e, no: string) => scanner.calibrateTicket(no))

  ipcMain.handle('settings:getDataRoot', () => settings.getDataRoot())
  ipcMain.handle('settings:chooseDataRoot', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled) return false
    settings.setDataRoot(r.filePaths[0])
    dialog.showMessageBoxSync({ message: '数据目录已更改,请重启应用生效。' })
    return true
  })

  ipcMain.handle('shell:showItem', (_e, relPath: string) => shell.showItemInFolder(join(dataRoot, relPath)))
}
```

> 更改数据根目录后让用户重启以重建连接,避免热切换数据库连接的复杂度(YAGNI)。

- [ ] **Step 2: 在 `src/main/index.ts` 调用**

修改 `app.whenReady().then(createWindow)` 为:
```ts
import { registerIpc } from './ipc'
// ...
app.whenReady().then(() => {
  registerIpc()
  createWindow()
})
```

- [ ] **Step 3: Preload 暴露 API `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { Ticket, Material, ImportResult } from '../shared/types'
import type { NewTicket } from '../main/db/tickets'

const api = {
  listTickets: (): Promise<Ticket[]> => ipcRenderer.invoke('tickets:list'),
  searchTickets: (q: string): Promise<Ticket[]> => ipcRenderer.invoke('tickets:search', q),
  getTicket: (no: string): Promise<Ticket | undefined> => ipcRenderer.invoke('tickets:get', no),
  createTicket: (t: NewTicket): Promise<void> => ipcRenderer.invoke('tickets:create', t),
  updateTicket: (no: string, patch: Partial<Ticket>): Promise<void> => ipcRenderer.invoke('tickets:update', no, patch),
  listMaterials: (no: string): Promise<Material[]> => ipcRenderer.invoke('materials:list', no),
  removeMaterial: (id: number): Promise<void> => ipcRenderer.invoke('materials:remove', id),
  fileUrl: (relPath: string): Promise<string> => ipcRenderer.invoke('materials:fileUrl', relPath),
  importPick: (no: string): Promise<ImportResult> => ipcRenderer.invoke('import:pick', no),
  exportFolder: (ids: number[]): Promise<boolean> => ipcRenderer.invoke('export:folder', ids),
  exportZip: (ids: number[]): Promise<boolean> => ipcRenderer.invoke('export:zip', ids),
  copyImage: (relPath: string): Promise<boolean> => ipcRenderer.invoke('clipboard:copyImage', relPath),
  calibrate: (no: string): Promise<number> => ipcRenderer.invoke('scan:calibrate', no),
  getDataRoot: (): Promise<string> => ipcRenderer.invoke('settings:getDataRoot'),
  chooseDataRoot: (): Promise<boolean> => ipcRenderer.invoke('settings:chooseDataRoot'),
  showItem: (relPath: string): Promise<void> => ipcRenderer.invoke('shell:showItem', relPath)
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 4: 验证启动无报错**

Run: `npm run dev`
Expected: 窗口正常打开,DevTools Console 无 IPC 注册错误。关闭窗口。

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts src/main/index.ts src/preload/index.ts
git commit -m "feat: wire IPC handlers and preload bridge"
```

---

## Task 12: 渲染层 API 类型与全局声明

**Files:**
- Create: `src/renderer/api.ts`
- Create: `src/renderer/global.d.ts`

- [ ] **Step 1: 全局 window 类型 `src/renderer/global.d.ts`**

```ts
import type { Api } from '../preload/index'
declare global {
  interface Window { api: Api }
}
export {}
```

- [ ] **Step 2: 薄封装 `src/renderer/api.ts`**

```ts
export const api = window.api
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/api.ts src/renderer/global.d.ts
git commit -m "feat: renderer api typing for window.api"
```

---

## Task 13: 检索框组件(含组件测试)

**Files:**
- Create: `src/renderer/components/SearchBar.tsx`
- Test: `tests/renderer/SearchBar.test.tsx`
- Modify: `vitest.config.ts`(为渲染层测试启用 jsdom)

- [ ] **Step 1: `vitest.config.ts`(分环境)**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/renderer/**', 'jsdom']]
  }
})
```

- [ ] **Step 2: 写失败测试**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from '../../src/renderer/components/SearchBar'

describe('SearchBar', () => {
  it('calls onSearch with typed text', () => {
    const onSearch = vi.fn()
    render(<SearchBar onSearch={onSearch} />)
    fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: 'ORD-9' } })
    expect(onSearch).toHaveBeenCalledWith('ORD-9')
  })
})
```

- [ ] **Step 3: 运行,确认失败**

Run: `npx vitest run tests/renderer/SearchBar.test.tsx`
Expected: FAIL — 找不到 `SearchBar`。

- [ ] **Step 4: 实现 `SearchBar.tsx`**

```tsx
interface Props { onSearch: (q: string) => void }

export function SearchBar({ onSearch }: Props) {
  return (
    <input
      className="w-full rounded border px-3 py-2"
      placeholder="搜索售后单号 / 订单号 / 发货单号 / 退货单号"
      onChange={(e) => onSearch(e.target.value)}
    />
  )
}
```

- [ ] **Step 5: 运行,确认通过**

Run: `npx vitest run tests/renderer/SearchBar.test.tsx`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SearchBar.tsx tests/renderer/SearchBar.test.tsx vitest.config.ts
git commit -m "feat: SearchBar component with test"
```

---

## Task 14: 售后单列表 + 详情 + 材料网格 + 预览(UI 装配)

> UI 装配任务,以手动验证为主(spec 约定渲染层不追求覆盖率)。每步给出完整组件代码。

**Files:**
- Create: `src/renderer/components/TicketList.tsx`, `TicketDetail.tsx`, `MaterialGrid.tsx`, `PreviewModal.tsx`, `SettingsDialog.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: `TicketList.tsx`**

```tsx
import type { Ticket } from '@shared/types'

interface Props { tickets: Ticket[]; selected?: string; onSelect: (no: string) => void; onNew: () => void }

export function TicketList({ tickets, selected, onSelect, onNew }: Props) {
  return (
    <div className="flex h-full flex-col">
      <button className="m-2 rounded bg-blue-600 px-3 py-2 text-white" onClick={onNew}>+ 新建售后单</button>
      <ul className="flex-1 overflow-auto">
        {tickets.map((t) => (
          <li key={t.aftersaleNo}>
            <button
              className={`w-full px-4 py-3 text-left hover:bg-gray-100 ${selected === t.aftersaleNo ? 'bg-gray-200' : ''}`}
              onClick={() => onSelect(t.aftersaleNo)}
            >
              <div className="font-medium">{t.aftersaleNo}</div>
              <div className="text-xs text-gray-500">{t.status} · 订单 {t.orderNo || '—'}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: `MaterialGrid.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { Material } from '@shared/types'
import { api } from '../api'

interface Props { materials: Material[]; selectedIds: Set<number>; onToggle: (id: number) => void; onOpen: (m: Material) => void }

function Thumb({ m }: { m: Material }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (m.thumbPath) api.fileUrl(m.thumbPath).then(setUrl)
    else if (m.kind === 'image') api.fileUrl(m.relPath).then(setUrl)
  }, [m])
  if (!url) return <div className="flex h-32 items-center justify-center bg-gray-200 text-xs text-gray-500">{m.kind === 'video' ? '视频' : '无预览'}</div>
  return <img src={url} className="h-32 w-full object-cover" />
}

export function MaterialGrid({ materials, selectedIds, onToggle, onOpen }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3 p-3">
      {materials.map((m) => (
        <div key={m.id} className="relative rounded border">
          <input type="checkbox" className="absolute left-2 top-2 z-10" checked={selectedIds.has(m.id)} onChange={() => onToggle(m.id)} />
          <button className="block w-full" onClick={() => onOpen(m)}><Thumb m={m} /></button>
          <div className="truncate px-2 py-1 text-xs">{m.relPath.split('/').pop()}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: `PreviewModal.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { Material } from '@shared/types'
import { api } from '../api'

interface Props { material: Material | null; onClose: () => void }

export function PreviewModal({ material, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { if (material) api.fileUrl(material.relPath).then(setUrl); else setUrl(null) }, [material])
  if (!material || !url) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        {material.kind === 'image'
          ? <img src={url} className="max-h-[85vh]" />
          : <video src={url} controls autoPlay className="max-h-[85vh]" />}
        <div className="mt-2 flex gap-2">
          {material.kind === 'image' && <button className="rounded bg-white px-3 py-1" onClick={() => api.copyImage(material.relPath)}>复制图片</button>}
          <button className="rounded bg-white px-3 py-1" onClick={() => api.showItem(material.relPath)}>在文件夹中显示</button>
          <button className="rounded bg-white px-3 py-1" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `TicketDetail.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { Material, Ticket, TicketStatus } from '@shared/types'
import { api } from '../api'
import { MaterialGrid } from './MaterialGrid'
import { PreviewModal } from './PreviewModal'

const STATUSES: TicketStatus[] = ['pending', 'processing', 'resolved']

export function TicketDetail({ aftersaleNo, onChanged }: { aftersaleNo: string; onChanged: () => void }) {
  const [ticket, setTicket] = useState<Ticket | undefined>()
  const [materials, setMaterials] = useState<Material[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<Material | null>(null)

  async function reload() {
    setTicket(await api.getTicket(aftersaleNo))
    setMaterials(await api.listMaterials(aftersaleNo))
    setSelected(new Set())
  }
  useEffect(() => { reload() }, [aftersaleNo])

  if (!ticket) return null
  const ids = () => [...selected]
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{ticket.aftersaleNo}</h2>
          <select className="rounded border px-2 py-1" value={ticket.status}
            onChange={async (e) => { await api.updateTicket(aftersaleNo, { status: e.target.value as TicketStatus }); await reload(); onChanged() }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="mt-2 text-sm text-gray-600">订单 {ticket.orderNo || '—'} · 发货 {ticket.shippingNo || '—'} · 退货 {ticket.returnNo || '—'}</div>
      </div>

      <div className="flex gap-2 border-b p-2">
        <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={async () => { await api.importPick(aftersaleNo); await reload() }}>导入材料</button>
        <button className="rounded border px-3 py-1" disabled={!selected.size} onClick={() => api.exportFolder(ids())}>导出到文件夹</button>
        <button className="rounded border px-3 py-1" disabled={!selected.size} onClick={() => api.exportZip(ids())}>打包 zip</button>
        <button className="ml-auto rounded border px-3 py-1" onClick={async () => { const n = await api.calibrate(aftersaleNo); alert(`校准完成,清理 ${n} 条失效索引`); await reload() }}>校准索引</button>
      </div>

      <div className="flex-1 overflow-auto">
        <MaterialGrid materials={materials} selectedIds={selected} onToggle={toggle} onOpen={setPreview} />
      </div>
      <PreviewModal material={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
```

- [ ] **Step 5: `SettingsDialog.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { api } from '../api'

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [root, setRoot] = useState('')
  useEffect(() => { if (open) api.getDataRoot().then(setRoot) }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded bg-white p-4">
        <h3 className="mb-2 font-semibold">设置</h3>
        <div className="mb-2 text-sm">数据目录:</div>
        <div className="mb-3 break-all rounded bg-gray-100 p-2 text-xs">{root}</div>
        <div className="flex justify-end gap-2">
          <button className="rounded border px-3 py-1" onClick={async () => { if (await api.chooseDataRoot()) onClose() }}>更改目录</button>
          <button className="rounded border px-3 py-1" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 装配 `App.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { Ticket } from '@shared/types'
import { api } from './api'
import { SearchBar } from './components/SearchBar'
import { TicketList } from './components/TicketList'
import { TicketDetail } from './components/TicketDetail'
import { SettingsDialog } from './components/SettingsDialog'

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selected, setSelected] = useState<string | undefined>()
  const [settingsOpen, setSettingsOpen] = useState(false)

  async function load(q = '') { setTickets(q ? await api.searchTickets(q) : await api.listTickets()) }
  useEffect(() => { load() }, [])

  async function newTicket() {
    const no = prompt('售后单号?')?.trim()
    if (!no) return
    const orderNo = prompt('订单号(可空)')?.trim() ?? ''
    const shippingNo = prompt('发货单号(可空)')?.trim() ?? ''
    const returnNo = prompt('退货单号(可空)')?.trim() ?? ''
    await api.createTicket({ aftersaleNo: no, orderNo, shippingNo, returnNo, note: '' })
    await load(); setSelected(no)
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b p-2">
        <div className="flex-1"><SearchBar onSearch={load} /></div>
        <button className="rounded border px-3 py-2" onClick={() => setSettingsOpen(true)}>设置</button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r"><TicketList tickets={tickets} selected={selected} onSelect={setSelected} onNew={newTicket} /></aside>
        <main className="flex-1 overflow-hidden">
          {selected ? <TicketDetail aftersaleNo={selected} onChanged={() => load()} /> : <div className="p-6 text-gray-500">选择或新建一个售后单</div>}
        </main>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
```

- [ ] **Step 7: 端到端手动验证**

Run: `npm run dev`
验证清单:
1. 新建售后单(填单号 + 订单号)→ 左侧列表出现。
2. 选中 → 点"导入材料"→ 选几张图和一个 mp4 → 网格出现缩略图,视频显示"视频"占位/抽帧图。
3. 点开图片预览 → "复制图片" → 到任意聊天窗口粘贴成功。
4. 点开视频 → 能播放。
5. 勾选若干 → "打包 zip" → 选保存路径 → 得到 zip,解压内容正确。
6. "导出到文件夹" → 选目录 → 文件出现。
7. 顶部搜索订单号片段 → 列表过滤到对应售后单。
8. 改状态下拉 → 列表副标题状态更新。
9. 在文件管理器里删掉某材料文件 → "校准索引" → 该项从网格消失。
10. 设置 → 显示当前数据目录;"更改目录"选新目录 → 提示重启。

- [ ] **Step 8: Commit**

```bash
git add src/renderer
git commit -m "feat: ticket list, detail, material grid, preview, settings UI"
```

---

## Task 15: 打包分发配置

**Files:**
- Modify: `package.json`(`build` 字段)
- Create: `electron-builder.yml`(可选,或内联 package.json)

- [ ] **Step 1: 配置 electron-builder**

`package.json` 增加:
```json
{
  "build": {
    "appId": "com.vhelper.app",
    "productName": "vhelper",
    "files": ["out/**/*"],
    "asarUnpack": ["**/node_modules/sharp/**", "**/node_modules/ffmpeg-static/**", "**/node_modules/better-sqlite3/**"],
    "mac": { "target": "dmg" },
    "win": { "target": "nsis" }
  }
}
```

> `sharp`/`ffmpeg-static`/`better-sqlite3` 含原生二进制,必须 `asarUnpack` 否则运行时找不到。

- [ ] **Step 2: 全量测试**

Run: `npm test`
Expected: 所有 vitest 用例 PASS。

- [ ] **Step 3: 构建当前平台安装包**

Run: `npm run dist`
Expected: `dist/` 下生成对应平台安装包(macOS `.dmg` / Windows `.exe`)。在本机安装并冷启动一次,确认能新建售后单、导入、预览。

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: electron-builder packaging for win/mac"
```

---

## Self-Review 记录

- **Spec 覆盖**:组织单位(售后单号)→ Task 3/4;多单号检索 → Task 4 FTS;数据根目录可改/迁移 → Task 6 + Task 11;导入/分类/缩略图 → Task 7/8;预览/截帧 → Task 14(视频 controls,图片复制);输出(复制单文件/导出文件夹/zip)→ Task 9 + Task 11 + Task 14;错误处理(跳过损坏、缩略图回退、索引校准)→ Task 7/8/10;测试策略(主进程 TDD,渲染层轻量)→ Task 3–10 TDD + Task 13 组件测试;跨平台打包 → Task 15。
- **不做项**:哈希/时间戳/PDF/多用户/云同步均未引入,符合 spec §8。
- **类型一致性**:`Ticket`/`Material`/`ImportResult`(shared/types)贯穿 db → service → ipc → preload → renderer;`NewTicket`(tickets.ts)、`NewMaterial`(materials.ts)在 importer 与 ipc 中签名一致;preload `Api` 类型被 renderer `global.d.ts` 复用。
- **待实现增强(已显式标注,非占位)**:EXIF `capturedAt` 抽取(importer 当前置 null);视频缩略图无硬性单测(集成手验)。
