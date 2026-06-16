# 材料多级目录 Implementation Plan (Spec B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个售后单的材料支持多级文件夹(新建多级 / 重命名 / 删除连同内容 / 移动材料 / 导航),导出按层级还原。

**Architecture:** 逻辑文件夹:新增 `material_folders` 表(每售后单的目录路径,可空)+ `materials.folder` 路径列;物理文件仍按 images/videos 存放。文件夹的重命名/移动/删除是纯数据库操作(重命名=子树路径前缀重写)。导出时按 `material.folder` 还原层级。

**Tech Stack:** Electron(main/preload/renderer)、better-sqlite3、React + TypeScript + Tailwind、Vitest。

**ABI 提示:** 跑 vitest 前若报 `NODE_MODULE_VERSION`,先 `npm run rebuild:node`(命令已链上)。**逐任务绿灯**:后端任务(1–5)保证 vitest 绿;渲染层 `npm run build` 在任务 7 收尾验证。

---

## File Structure

**Create:**
- `src/shared/folder-path.ts` — 纯路径函数。
- `src/main/db/folders.ts` — `FolderRepo`。
- `tests/shared/folder-path.test.ts`、`tests/db/folders.test.ts`、`tests/main/exporter.test.ts`。

**Modify:**
- `src/shared/types.ts` — `Material.folder`、`CreateMaterialPayload` 加 `folder?`。
- `src/main/db/database.ts` — `material_folders` 表 + `materials.folder` 列。
- `src/main/db/materials.ts` — `NewMaterial.folder?`、`ROW`、`add`、`setFolder`。
- `src/main/services/importer.ts` — `addFile/addBytes/record` 加 `folder`。
- `src/main/services/exporter.ts` — 按层级导出。
- `src/main/ipc.ts`、`src/preload/index.ts` — `folders:*`、`materials:move`、`materials:create` 带 folder。
- `src/renderer/components/MaterialGrid.tsx` — 文件夹化。
- `src/renderer/components/TicketDetail.tsx` — currentFolder 接线 + 移动到。
- `src/renderer/components/NewMaterialDialog.tsx` — targetFolder。
- `tests/db/materials.test.ts`、`tests/db/database.test.ts` — folder 断言。

---

## Task 1: 纯路径函数 `folder-path.ts`

**Files:** Create `src/shared/folder-path.ts`, `tests/shared/folder-path.test.ts`

- [ ] **Step 1: 写失败测试** — `tests/shared/folder-path.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { normalizeSegment, joinPath, parentPath, folderName, ancestorsAndSelf, childrenFolders, isUnderOrEqual, rewritePrefix } from '../../src/shared/folder-path'

describe('folder-path', () => {
  it('normalizeSegment trims and rejects bad names', () => {
    expect(normalizeSegment('  凭证 ')).toBe('凭证')
    expect(() => normalizeSegment('')).toThrow()
    expect(() => normalizeSegment('a/b')).toThrow()
    expect(() => normalizeSegment('..')).toThrow()
    expect(() => normalizeSegment('.')).toThrow()
  })
  it('joinPath / parentPath / folderName', () => {
    expect(joinPath('', '凭证')).toBe('凭证')
    expect(joinPath('凭证', '聊天')).toBe('凭证/聊天')
    expect(parentPath('凭证/聊天')).toBe('凭证')
    expect(parentPath('凭证')).toBe('')
    expect(folderName('凭证/聊天')).toBe('聊天')
    expect(folderName('凭证')).toBe('凭证')
  })
  it('ancestorsAndSelf', () => {
    expect(ancestorsAndSelf('a/b/c')).toEqual(['a', 'a/b', 'a/b/c'])
    expect(ancestorsAndSelf('a')).toEqual(['a'])
    expect(ancestorsAndSelf('')).toEqual([])
  })
  it('childrenFolders returns immediate children, sorted/deduped', () => {
    const all = ['凭证', '凭证/聊天', '凭证/截图', '物流', '凭证/聊天/2024']
    expect(childrenFolders(all, '')).toEqual(['凭证', '物流'])
    expect(childrenFolders(all, '凭证')).toEqual(['凭证/聊天', '凭证/截图'])
    expect(childrenFolders(all, '凭证/聊天')).toEqual(['凭证/聊天/2024'])
  })
  it('isUnderOrEqual / rewritePrefix', () => {
    expect(isUnderOrEqual('凭证/聊天', '凭证')).toBe(true)
    expect(isUnderOrEqual('凭证', '凭证')).toBe(true)
    expect(isUnderOrEqual('凭证2', '凭证')).toBe(false)
    expect(rewritePrefix('凭证/聊天', '凭证', '证据')).toBe('证据/聊天')
    expect(rewritePrefix('凭证', '凭证', '证据')).toBe('证据')
    expect(rewritePrefix('物流', '凭证', '证据')).toBe('物流')
  })
})
```
Run `npm run rebuild:node && npx vitest run tests/shared/folder-path.test.ts` → FAIL (module missing).

- [ ] **Step 2: 实现** — `src/shared/folder-path.ts`
```ts
export function normalizeSegment(name: string): string {
  const s = name.trim()
  if (!s || s.includes('/') || s === '.' || s === '..') throw new Error('非法的文件夹名')
  return s
}
export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}
export function parentPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}
export function folderName(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}
export function ancestorsAndSelf(path: string): string[] {
  if (!path) return []
  const segs = path.split('/')
  return segs.map((_, i) => segs.slice(0, i + 1).join('/'))
}
export function childrenFolders(allPaths: string[], parent: string): string[] {
  const out = new Set<string>()
  for (const p of allPaths) if (parentPath(p) === parent) out.add(p)
  return [...out].sort()
}
export function isUnderOrEqual(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}
export function rewritePrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix
  if (path.startsWith(oldPrefix + '/')) return newPrefix + path.slice(oldPrefix.length)
  return path
}
```
Run `npm run rebuild:node && npx vitest run tests/shared/folder-path.test.ts` → PASS. Then `npx vitest run` → 0 failures.

- [ ] **Step 3: Commit**
```bash
git add src/shared/folder-path.ts tests/shared/folder-path.test.ts
git commit -m "feat: pure folder-path helpers"
```

---

## Task 2: 类型 + DB 表/列 + MaterialRepo

**Files:** Modify `src/shared/types.ts`, `src/main/db/database.ts`, `src/main/db/materials.ts`; Test `tests/db/materials.test.ts`, `tests/db/database.test.ts`

- [ ] **Step 1: 写失败测试** — 在 `tests/db/materials.test.ts` 的 describe 内追加(它已有构造 ticket + MaterialRepo 的 setup;沿用其变量名 `materials`/`db`;材料 `add` 需要 aftersaleNo 等字段——按文件现有 helper 风格补 `folder`):
```ts
  it('stores folder (default empty) and moves a material', () => {
    const id = materials.add({ aftersaleNo: 'AS-1', name: 'a', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    expect(materials.getByIds([id])[0].folder).toBe('')
    const id2 = materials.add({ aftersaleNo: 'AS-1', name: 'b', relPath: 'AS-1/images/b.jpg', kind: 'image', folder: '凭证', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    expect(materials.getByIds([id2])[0].folder).toBe('凭证')
    materials.setFolder(id, '凭证/聊天')
    expect(materials.getByIds([id])[0].folder).toBe('凭证/聊天')
  })
```
And in `tests/db/database.test.ts` add:
```ts
describe('material folders schema', () => {
  it('fresh db has material_folders table and materials.folder column', () => {
    const db = createDatabase(':memory:')
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name)
    expect(names).toContain('material_folders')
    const cols = (db.prepare('PRAGMA table_info(materials)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('folder')
  })
})
```
(The materials.test setup must create the `AS-1` ticket first — it already does in its `beforeEach`; if `add` previously didn't include `folder`, that's fine since it defaults.)

Run `npm run rebuild:node && npx vitest run tests/db/materials.test.ts tests/db/database.test.ts` → FAIL.

- [ ] **Step 2: 类型** — `src/shared/types.ts`
In `Material`, add `folder: string` (after `thumbPath`):
```ts
  thumbPath: string | null
  folder: string
```
Change `CreateMaterialPayload` to carry an optional folder on both branches:
```ts
export type CreateMaterialPayload = (
  | { source: 'file'; path: string; name: string }
  | { source: 'paste'; fileName: string; name: string; bytes: Uint8Array }
) & { folder?: string }
```

- [ ] **Step 3: DB** — `src/main/db/database.ts`
In the base `db.exec(\`...\`)` schema string, add the folders table (after the `materials` index, before `tickets_fts`):
```sql
    CREATE TABLE IF NOT EXISTS material_folders (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      aftersale_no TEXT NOT NULL REFERENCES tickets(aftersale_no) ON DELETE CASCADE,
      path         TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      UNIQUE(aftersale_no, path)
    );
    CREATE INDEX IF NOT EXISTS idx_folders_ticket ON material_folders(aftersale_no);
```
After the existing `ensureColumn(db, 'materials', 'name', ...)` line, add:
```ts
  ensureColumn(db, 'materials', 'folder', "folder TEXT NOT NULL DEFAULT ''")
```

- [ ] **Step 4: MaterialRepo** — `src/main/db/materials.ts`
`ROW` — append `, folder`:
```ts
const ROW = `id, aftersale_no AS aftersaleNo, name, rel_path AS relPath, kind,
  captured_at AS capturedAt, imported_at AS importedAt, size_bytes AS sizeBytes, thumb_path AS thumbPath, folder`
```
`NewMaterial` — make folder optional:
```ts
export type NewMaterial = Omit<Material, 'id' | 'name' | 'folder'> & { name?: string; folder?: string }
```
`add` — include folder (default ''):
```ts
  add(m: NewMaterial): number {
    const info = this.db.prepare(
      `INSERT INTO materials (aftersale_no, name, rel_path, kind, captured_at, imported_at, size_bytes, thumb_path, folder)
       VALUES (@aftersaleNo, @name, @relPath, @kind, @capturedAt, @importedAt, @sizeBytes, @thumbPath, @folder)`
    ).run({ ...m, name: m.name ?? '', folder: m.folder ?? '' })
    return Number(info.lastInsertRowid)
  }
```
Add `setFolder` (after `setThumb`):
```ts
  setFolder(id: number, folder: string): void {
    this.db.prepare('UPDATE materials SET folder = ? WHERE id = ?').run(folder, id)
  }
```

- [ ] **Step 5: 跑测试**
Run `npm run rebuild:node && npx vitest run tests/db/materials.test.ts tests/db/database.test.ts` → PASS. Then `npx vitest run` → 0 failures (report counts).

- [ ] **Step 6: Commit**
```bash
git add src/shared/types.ts src/main/db/database.ts src/main/db/materials.ts tests/db/materials.test.ts tests/db/database.test.ts
git commit -m "feat(db): material_folders table + materials.folder column + setFolder"
```

---

## Task 3: `FolderRepo`

**Files:** Create `src/main/db/folders.ts`, `tests/db/folders.test.ts`

- [ ] **Step 1: 写失败测试** — `tests/db/folders.test.ts`
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { FolderRepo } from '../../src/main/db/folders'

let db: Database
let folders: FolderRepo
let materials: MaterialRepo

beforeEach(() => {
  db = createDatabase(':memory:')
  new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  folders = new FolderRepo(db, () => 1)
  materials = new MaterialRepo(db)
})

describe('FolderRepo', () => {
  it('create inserts the path and all ancestors', () => {
    folders.create('AS-1', '凭证/聊天/2024')
    expect(folders.list('AS-1')).toEqual(['凭证', '凭证/聊天', '凭证/聊天/2024'])
  })

  it('rename rewrites the folder subtree and material folders', () => {
    folders.create('AS-1', '凭证/聊天')
    const mid = materials.add({ aftersaleNo: 'AS-1', name: 'x', relPath: 'AS-1/images/x.jpg', kind: 'image', folder: '凭证/聊天', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    folders.rename('AS-1', '凭证', '证据')
    expect(folders.list('AS-1')).toEqual(['证据', '证据/聊天'])
    expect(materials.getByIds([mid])[0].folder).toBe('证据/聊天')
  })

  it('rename rejects a name that collides with an existing sibling', () => {
    folders.create('AS-1', '凭证')
    folders.create('AS-1', '物流')
    expect(() => folders.rename('AS-1', '物流', '凭证')).toThrow()
  })

  it('remove deletes the subtree and returns affected materials', () => {
    folders.create('AS-1', '凭证/聊天')
    folders.create('AS-1', '物流')
    const inSub = materials.add({ aftersaleNo: 'AS-1', name: 'a', relPath: 'AS-1/images/a.jpg', kind: 'image', folder: '凭证/聊天', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: 'AS-1/thumb/a.jpg' })
    const outside = materials.add({ aftersaleNo: 'AS-1', name: 'b', relPath: 'AS-1/images/b.jpg', kind: 'image', folder: '物流', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    const affected = folders.remove('AS-1', '凭证')
    expect(affected).toEqual([{ relPath: 'AS-1/images/a.jpg', thumbPath: 'AS-1/thumb/a.jpg' }])
    expect(folders.list('AS-1')).toEqual(['物流'])
    expect(materials.getByIds([inSub])).toEqual([])
    expect(materials.getByIds([outside])[0].folder).toBe('物流')
  })
})
```
Run → FAIL (module missing).

- [ ] **Step 2: 实现** — `src/main/db/folders.ts`
```ts
import type { Database } from 'better-sqlite3'
import { ancestorsAndSelf, isUnderOrEqual, joinPath, parentPath, rewritePrefix, normalizeSegment } from '../../shared/folder-path'

type Now = () => number
export interface AffectedMaterial { relPath: string; thumbPath: string | null }

export class FolderRepo {
  constructor(private db: Database, private now: Now = () => Date.now()) {}

  create(aftersaleNo: string, path: string): void {
    const ts = this.now()
    const ins = this.db.prepare('INSERT OR IGNORE INTO material_folders (aftersale_no, path, created_at) VALUES (?, ?, ?)')
    this.db.transaction(() => {
      for (const p of ancestorsAndSelf(path)) ins.run(aftersaleNo, p, ts)
    })()
  }

  list(aftersaleNo: string): string[] {
    return (this.db.prepare('SELECT path FROM material_folders WHERE aftersale_no = ? ORDER BY path').all(aftersaleNo) as { path: string }[]).map((r) => r.path)
  }

  rename(aftersaleNo: string, path: string, newName: string): void {
    const newPath = joinPath(parentPath(path), normalizeSegment(newName))
    if (newPath === path) return
    if (this.db.prepare('SELECT 1 FROM material_folders WHERE aftersale_no = ? AND path = ?').get(aftersaleNo, newPath)) {
      throw new Error('同级已存在同名文件夹')
    }
    this.db.transaction(() => {
      const fs = this.db.prepare('SELECT id, path FROM material_folders WHERE aftersale_no = ?').all(aftersaleNo) as { id: number; path: string }[]
      const updF = this.db.prepare('UPDATE material_folders SET path = ? WHERE id = ?')
      for (const f of fs) if (isUnderOrEqual(f.path, path)) updF.run(rewritePrefix(f.path, path, newPath), f.id)
      const ms = this.db.prepare('SELECT id, folder FROM materials WHERE aftersale_no = ?').all(aftersaleNo) as { id: number; folder: string }[]
      const updM = this.db.prepare('UPDATE materials SET folder = ? WHERE id = ?')
      for (const m of ms) if (isUnderOrEqual(m.folder, path)) updM.run(rewritePrefix(m.folder, path, newPath), m.id)
    })()
  }

  remove(aftersaleNo: string, path: string): AffectedMaterial[] {
    let affected: AffectedMaterial[] = []
    this.db.transaction(() => {
      const ms = this.db.prepare('SELECT id, rel_path AS relPath, thumb_path AS thumbPath, folder FROM materials WHERE aftersale_no = ?')
        .all(aftersaleNo) as { id: number; relPath: string; thumbPath: string | null; folder: string }[]
      const inSub = ms.filter((m) => isUnderOrEqual(m.folder, path))
      affected = inSub.map((m) => ({ relPath: m.relPath, thumbPath: m.thumbPath }))
      const delM = this.db.prepare('DELETE FROM materials WHERE id = ?')
      for (const m of inSub) delM.run(m.id)
      const fs = this.db.prepare('SELECT id, path FROM material_folders WHERE aftersale_no = ?').all(aftersaleNo) as { id: number; path: string }[]
      const delF = this.db.prepare('DELETE FROM material_folders WHERE id = ?')
      for (const f of fs) if (isUnderOrEqual(f.path, path)) delF.run(f.id)
    })()
    return affected
  }
}
```
Run `npm run rebuild:node && npx vitest run tests/db/folders.test.ts` → PASS. Then `npx vitest run` → 0 failures.

- [ ] **Step 3: Commit**
```bash
git add src/main/db/folders.ts tests/db/folders.test.ts
git commit -m "feat(db): FolderRepo (create/list/rename/remove) over logical folders"
```

---

## Task 4: Importer 透传 folder + Exporter 按层级导出

**Files:** Modify `src/main/services/importer.ts`, `src/main/services/exporter.ts`; Test `tests/main/exporter.test.ts`

- [ ] **Step 1: Importer 加 folder 入参** — `src/main/services/importer.ts`
Change `record` signature + `materials.add` call to include folder, and thread folder through `addFile`/`addBytes`/`importFiles`:
- `record(aftersaleNo, kind, destAbs, name, folder)`: add `folder` param; in `this.materials.add({ ... })` add `folder,`.
- `addFile(aftersaleNo, srcPath, name, folder = '')` → `return this.record(aftersaleNo, kind, dest, name, folder)`.
- `addBytes(aftersaleNo, fileName, buffer, name, folder = '')` → `return this.record(aftersaleNo, kind, dest, name, folder)`.
- `importFiles`: call `this.addFile(aftersaleNo, file, '', '')`.
Concretely the `record` body's add call becomes:
```ts
    const id = this.materials.add({
      aftersaleNo, name, relPath, kind, folder,
      capturedAt: null,
      importedAt: this.now(),
      sizeBytes: statSync(destAbs).size,
      thumbPath
    })
```
and its signature:
```ts
  private async record(aftersaleNo: string, kind: MaterialKind, destAbs: string, name: string, folder: string): Promise<Material> {
```

- [ ] **Step 2: 写 Exporter 失败测试** — `tests/main/exporter.test.ts`
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Material } from '../../src/shared/types'
import { Exporter } from '../../src/main/services/exporter'

let root: string
function mat(relPath: string, folder: string): Material {
  return { id: 0, aftersaleNo: 'AS-1', name: '', relPath, kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null, folder }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-exp-'))
  // create source files under <root>/data/AS-1/images
  mkdirSync(join(root, 'data', 'AS-1', 'images'), { recursive: true })
  writeFileSync(join(root, 'data', 'AS-1', 'images', 'a.jpg'), 'a')
  writeFileSync(join(root, 'data', 'AS-1', 'images', 'b.jpg'), 'b')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('Exporter.toFolder preserves the folder hierarchy', () => {
  it('writes files into per-folder subdirectories', async () => {
    const ex = new Exporter(join(root, 'data'))
    const out = join(root, 'out')
    await ex.toFolder([
      mat('AS-1/images/a.jpg', '凭证/聊天'),
      mat('AS-1/images/b.jpg', '')
    ], out)
    expect(existsSync(join(out, '凭证', '聊天', 'a.jpg'))).toBe(true)
    expect(existsSync(join(out, 'b.jpg'))).toBe(true)
  })

  it('dedupes same-name files within the same destination folder', async () => {
    const ex = new Exporter(join(root, 'data'))
    const out = join(root, 'out')
    await ex.toFolder([mat('AS-1/images/a.jpg', '凭证'), mat('AS-1/images/b.jpg', '凭证')], out)
    // both basenames differ here; force a collision by exporting a.jpg twice into same folder
    await ex.toFolder([mat('AS-1/images/a.jpg', 'dup'), mat('AS-1/images/a.jpg', 'dup')], out)
    const files = readdirSync(join(out, 'dup')).sort()
    expect(files).toEqual(['a-1.jpg', 'a.jpg'])
  })
})
```
Run `npm run rebuild:node && npx vitest run tests/main/exporter.test.ts` → FAIL (toFolder still flattens).

> Note: `tests/main/` may be a new folder — that's fine; Vitest's node project picks up `tests/**`. If the project config restricts test globs, place the file under `tests/db/exporter.test.ts` instead (same imports). Verify it's collected.

- [ ] **Step 3: 实现 Exporter 层级** — `src/main/services/exporter.ts`
Replace the file body with folder-aware export (uses POSIX folder paths for zip entries; real subdirs for folder export; dedup within each destination folder):
```ts
import { createWriteStream, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { ZipArchive } from 'archiver'
import type { Material } from '../../shared/types'

export class Exporter {
  constructor(private dataRoot: string) {}

  private abs(m: Material): string {
    return join(this.dataRoot, m.relPath)
  }

  private uniqueName(name: string, taken: (n: string) => boolean): string {
    const ext = extname(name); const stem = basename(name, ext)
    let candidate = name; let i = 1
    while (taken(candidate)) { candidate = `${stem}-${i}${ext}`; i++ }
    return candidate
  }

  async toFolder(materials: Material[], targetDir: string): Promise<void> {
    mkdirSync(targetDir, { recursive: true })
    for (const m of materials) {
      const sub = m.folder ? join(targetDir, ...m.folder.split('/')) : targetDir
      mkdirSync(sub, { recursive: true })
      const name = this.uniqueName(basename(m.relPath), (n) => existsSync(join(sub, n)))
      copyFileSync(this.abs(m), join(sub, name))
    }
  }

  toZip(materials: Material[], zipPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath)
      const archive = new ZipArchive({ zlib: { level: 9 } })
      output.on('close', () => resolve())
      output.on('error', reject)
      archive.on('error', reject)
      archive.on('warning', (err) => reject(err))
      archive.pipe(output)
      const usedByDir = new Map<string, Set<string>>()
      for (const m of materials) {
        const dir = m.folder
        const used = usedByDir.get(dir) ?? new Set<string>()
        const name = this.uniqueName(basename(m.relPath), (n) => used.has(n))
        used.add(name); usedByDir.set(dir, used)
        const entry = dir ? `${dir}/${name}` : name
        archive.file(this.abs(m), { name: entry })
      }
      archive.finalize().catch(reject)
    })
  }
}
```
Run `npm run rebuild:node && npx vitest run tests/main/exporter.test.ts` → PASS. Then `npx vitest run` → 0 failures.

- [ ] **Step 4: Commit**
```bash
git add src/main/services/importer.ts src/main/services/exporter.ts tests/main/exporter.test.ts
git commit -m "feat: importer passes folder; exporter preserves folder hierarchy"
```

---

## Task 5: IPC + preload

**Files:** Modify `src/main/ipc.ts`, `src/preload/index.ts`

- [ ] **Step 1: ipc.ts**
Import FolderRepo (top, with other db imports):
```ts
import { FolderRepo } from './db/folders'
```
Construct it next to the other repos (after `const materials = new MaterialRepo(db)`):
```ts
  const folderRepo = new FolderRepo(db)
```
Update `materials:create` to pass folder:
```ts
  ipcMain.handle('materials:create', async (_e, no: string, payload: import('../shared/types').CreateMaterialPayload) => {
    const folder = payload.folder ?? ''
    if (payload.source === 'file') return importer.addFile(no, payload.path, payload.name, folder)
    if (payload.source === 'paste') return importer.addBytes(no, payload.fileName, Buffer.from(payload.bytes), payload.name, folder)
    throw new Error('unknown material source')
  })
```
Add the folder/move handlers (near `materials:*`):
```ts
  ipcMain.handle('folders:list', (_e, no: string) => folderRepo.list(no))
  ipcMain.handle('folders:create', (_e, no: string, path: string) => folderRepo.create(no, path))
  ipcMain.handle('folders:rename', (_e, no: string, path: string, newName: string) => folderRepo.rename(no, path, newName))
  ipcMain.handle('folders:remove', (_e, no: string, path: string) => {
    for (const m of folderRepo.remove(no, path)) {
      try { unlinkSync(join(dataRoot, m.relPath)) } catch { /* ignore */ }
      if (m.thumbPath) { try { unlinkSync(join(dataRoot, m.thumbPath)) } catch { /* ignore */ } }
    }
  })
  ipcMain.handle('materials:move', (_e, id: number, folder: string) => materials.setFolder(id, folder))
```
(`unlinkSync` and `join` are already imported in ipc.ts.)

- [ ] **Step 2: preload/index.ts**
Add methods (next to the materials methods):
```ts
  listFolders: (no: string): Promise<string[]> => ipcRenderer.invoke('folders:list', no),
  createFolder: (no: string, path: string): Promise<void> => ipcRenderer.invoke('folders:create', no, path),
  renameFolder: (no: string, path: string, newName: string): Promise<void> => ipcRenderer.invoke('folders:rename', no, path, newName),
  removeFolder: (no: string, path: string): Promise<void> => ipcRenderer.invoke('folders:remove', no, path),
  moveMaterial: (id: number, folder: string): Promise<void> => ipcRenderer.invoke('materials:move', id, folder),
```

- [ ] **Step 3: Verify**
`npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "src/(main|preload)/" | grep -vE "Cannot find (name|module).*(node:|Buffer|process|console|__dirname|require)"` → no output.
`npm run rebuild:node && npx vitest run` → 0 failures.

- [ ] **Step 4: Commit**
```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat(ipc): folder endpoints + material move + create-with-folder"
```

---

## Task 6: `MaterialGrid` 文件夹化

**Files:** Modify `src/renderer/components/MaterialGrid.tsx`

- [ ] **Step 1: 重写 `MaterialGrid.tsx`**
New props add folder navigation + ops. The component filters files by `currentFolder` and derives subfolders via `childrenFolders`. Folder create/rename use inline inputs (no `window.prompt`). Delete uses an inline confirm.
```tsx
import { useEffect, useState } from 'react'
import type { Material } from '@shared/types'
import { api } from '../api'
import { childrenFolders, folderName, ancestorsAndSelf } from '../../shared/folder-path'
import { IconPlay, IconCheck, IconImage, IconFolder, IconClose } from './icons'

interface Props {
  materials: Material[]
  folders: string[]
  currentFolder: string
  selectedIds: Set<number>
  onToggle: (id: number) => void
  onOpen: (m: Material) => void
  onEnterFolder: (path: string) => void
  onCreateFolder: (name: string) => void
  onRenameFolder: (path: string, newName: string) => void
  onDeleteFolder: (path: string) => void
}

function Thumb({ m }: { m: Material }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (m.thumbPath) api.fileUrl(m.thumbPath).then(setUrl)
    else if (m.kind === 'image') api.fileUrl(m.relPath).then(setUrl)
  }, [m.thumbPath, m.relPath, m.kind])
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-paper-2 text-muted">
        {m.kind === 'video' ? <IconPlay className="text-2xl opacity-40" /> : <IconImage className="text-2xl opacity-30" />}
      </div>
    )
  }
  return <img src={url} alt="" className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.05]" />
}

export function MaterialGrid({ materials, folders, currentFolder, selectedIds, onToggle, onOpen, onEnterFolder, onCreateFolder, onRenameFolder, onDeleteFolder }: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const subfolders = childrenFolders(folders, currentFolder)
  const files = materials.filter((m) => m.folder === currentFolder)
  const crumbs = ['', ...ancestorsAndSelf(currentFolder)]

  function submitCreate() {
    const n = newName.trim()
    if (n) onCreateFolder(n)
    setCreating(false); setNewName('')
  }
  function submitRename(path: string) {
    const n = renameVal.trim()
    if (n && n !== folderName(path)) onRenameFolder(path, n)
    setRenaming(null); setRenameVal('')
  }

  return (
    <div className="p-6">
      {/* breadcrumb + new folder */}
      <div className="mb-4 flex items-center gap-1 text-sm text-muted">
        {crumbs.map((c, i) => (
          <span key={c || 'root'} className="flex items-center gap-1">
            {i > 0 && <span>/</span>}
            <button className="btn-ghost px-2 py-0.5 text-xs disabled:opacity-60" disabled={c === currentFolder} onClick={() => onEnterFolder(c)}>
              {c === '' ? '根目录' : folderName(c)}
            </button>
          </span>
        ))}
        <span className="flex-1" />
        {creating ? (
          <span className="flex items-center gap-1">
            <input autoFocus className="field h-7 w-32 py-1 text-xs" value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }} placeholder="文件夹名" />
            <button className="btn-primary px-2 py-1 text-xs" onClick={submitCreate}>建</button>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setCreating(false); setNewName('') }}>取消</button>
          </span>
        ) : (
          <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setCreating(true)}><IconFolder className="text-[14px]" /> 新建文件夹</button>
        )}
      </div>

      {subfolders.length === 0 && files.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-paper-2 text-muted"><IconImage className="text-2xl" /></div>
          <p className="text-sm text-muted">此目录为空 — 「新建材料」添加文件,或「新建文件夹」</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
          {/* folder tiles */}
          {subfolders.map((path) => (
            <div key={`f:${path}`} className="group relative flex flex-col rounded-xl2 border border-line bg-surface transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lift">
              <button className="flex aspect-square w-full flex-col items-center justify-center gap-2 text-accent" onClick={() => onEnterFolder(path)}>
                <IconFolder className="text-4xl" />
              </button>
              {renaming === path ? (
                <div className="flex items-center gap-1 px-2 py-2">
                  <input autoFocus className="field h-7 py-1 text-xs" value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') submitRename(path); if (e.key === 'Escape') setRenaming(null) }} />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-1 px-2.5 py-2">
                  <span className="truncate text-[12px] text-ink">{folderName(path)}</span>
                  <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink" title="重命名" onClick={() => { setRenaming(path); setRenameVal(folderName(path)) }}>✎</button>
                    <button className="rounded p-1 text-muted hover:bg-danger-soft hover:text-danger" title="删除" onClick={() => setConfirmDel(path)}>🗑</button>
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* file tiles */}
          {files.map((m, i) => {
            const sel = selectedIds.has(m.id)
            return (
              <div key={m.id}
                className={`group relative animate-rise overflow-hidden rounded-xl2 border bg-surface transition-all duration-150 ${sel ? 'border-accent shadow-card ring-2 ring-accent ring-offset-2 ring-offset-paper' : 'border-line hover:-translate-y-0.5 hover:shadow-lift'}`}
                style={{ animationDelay: `${Math.min(i, 16) * 18}ms` }}>
                <button className="relative block aspect-square w-full overflow-hidden bg-paper-2" onClick={() => onOpen(m)}>
                  <Thumb m={m} />
                  {m.kind === 'video' && (
                    <span className="pointer-events-none absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg" style={{ background: 'rgba(33,30,24,.55)', backdropFilter: 'blur(2px)' }}>
                      <IconPlay className="text-[15px]" />
                    </span>
                  )}
                </button>
                <button onClick={() => onToggle(m.id)} aria-label={sel ? '取消选择' : '选择'}
                  className={`absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border backdrop-blur transition ${sel ? 'border-accent bg-accent text-white' : 'border-white/70 bg-white/65 text-transparent opacity-0 hover:text-muted group-hover:opacity-100'}`}>
                  <IconCheck className="text-[13px]" />
                </button>
                <div className="truncate px-2.5 py-2 font-mono text-[11px] text-ink-soft">{m.name || m.relPath.split('/').pop()}</div>
              </div>
            )
          })}
        </div>
      )}

      {confirmDel && (
        <div className="scrim" onClick={() => setConfirmDel(null)}>
          <div className="modal-card max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-bold">删除文件夹</h3>
              <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2" onClick={() => setConfirmDel(null)}><IconClose className="text-[16px]" /></button>
            </div>
            <p className="text-sm text-ink-soft">将删除「{folderName(confirmDel)}」及其全部子文件夹与材料,此操作不可撤销。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirmDel(null)}>取消</button>
              <button className="btn-danger-solid" onClick={() => { onDeleteFolder(confirmDel); setConfirmDel(null) }}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```
(`IconFolder`, `IconClose` already exist in `./icons`. The `✎`/`🗑` glyphs are placeholders for compactness; if the codebase has edit/trash icons prefer `IconTrash` — keep simple text if not.)

- [ ] **Step 2: Verify (type/build)**
`npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "MaterialGrid"` → MaterialGrid itself should be clean; `TicketDetail` will error until Task 7 (it passes the OLD props) — that's expected. `npx vitest run` → 0 failures (no test imports MaterialGrid).

- [ ] **Step 3: Commit**
```bash
git add src/renderer/components/MaterialGrid.tsx
git commit -m "feat(ui): folder-aware MaterialGrid (breadcrumb, folder tiles, create/rename/delete)"
```

---

## Task 7: TicketDetail 接线 + NewMaterialDialog 目标目录 + 收尾

**Files:** Modify `src/renderer/components/TicketDetail.tsx`, `src/renderer/components/NewMaterialDialog.tsx`

- [ ] **Step 1: NewMaterialDialog targetFolder**
`src/renderer/components/NewMaterialDialog.tsx`:
- Props add `targetFolder: string`:
```tsx
interface Props { open: boolean; aftersaleNo: string; targetFolder: string; onCreated: (m: Material) => void; onCancel: () => void }
export function NewMaterialDialog({ open, aftersaleNo, targetFolder, onCreated, onCancel }: Props) {
```
- In `create()`, add `folder` to both payloads:
```tsx
      const payload = tab === 'clipboard'
        ? { source: 'paste' as const, fileName: pending!.fileName, name, bytes: pending!.bytes, folder: targetFolder }
        : { source: 'file' as const, path: picked!.path, name, folder: targetFolder }
```
- Under the header (after the `<h3>新建材料</h3>` row's container), show the destination. Add right after the title `<div className="mb-4 ...">` block:
```tsx
        <div className="mb-3 text-xs text-muted">将添加到:<span className="text-ink-soft">{targetFolder === '' ? '根目录' : targetFolder}</span></div>
```

- [ ] **Step 2: TicketDetail wiring**
`src/renderer/components/TicketDetail.tsx`:
- Add imports:
```tsx
import { childrenFolders } from '../../shared/folder-path'
```
(only if needed; the move-to picker lists all folders, so not strictly required — skip if unused.)
- Add state (near other useState):
```tsx
  const [folders, setFolders] = useState<string[]>([])
  const [currentFolder, setCurrentFolder] = useState('')
```
- In `reload()`, also load folders and reset selection (after setting materials):
```tsx
  async function reload() {
    currentNo.current = aftersaleNo
    const [t, ms, fs] = await Promise.all([api.getTicket(aftersaleNo), api.listMaterials(aftersaleNo), api.listFolders(aftersaleNo)])
    if (currentNo.current !== aftersaleNo) return
    setTicket(t)
    setMaterials(ms)
    setFolders(fs)
    setSelected(new Set())
  }
```
- Reset currentFolder when switching tickets: in the `useEffect(() => { ... }, [aftersaleNo])`, add `setCurrentFolder('')`.
- Add folder op handlers (near other async fns):
```tsx
  async function createFolder(name: string) {
    const path = currentFolder ? `${currentFolder}/${name.trim()}` : name.trim()
    try { await api.createFolder(aftersaleNo, path); await reload() } catch (e) { setMsg(`新建文件夹失败:${(e as Error).message}`) }
  }
  async function renameFolder(path: string, newName: string) {
    try { await api.renameFolder(aftersaleNo, path, newName); await reload() } catch (e) { setMsg(`重命名失败:${(e as Error).message}`) }
  }
  async function deleteFolder(path: string) {
    await api.removeFolder(aftersaleNo, path)
    if (currentFolder === path || currentFolder.startsWith(path + '/')) setCurrentFolder('')
    await reload()
  }
  async function moveSelected(folder: string) {
    for (const id of selected) await api.moveMaterial(id, folder)
    await reload()
  }
```
- In the materials selection toolbar (where 导出/打包 are), add a 移动到 picker. Inside the `selected.size > 0` block, after the 打包 zip button, add:
```tsx
                <select className="rounded border border-line bg-surface px-1.5 py-1 text-xs" defaultValue="" onChange={(e) => { if (e.target.value !== '__none') { void moveSelected(e.target.value === '__root' ? '' : e.target.value); e.target.value = '__none' } }}>
                  <option value="__none">移动到…</option>
                  <option value="__root">根目录</option>
                  {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
```
- Replace the `<MaterialGrid .../>` usage with the folder-aware props:
```tsx
            <MaterialGrid
              materials={materials}
              folders={folders}
              currentFolder={currentFolder}
              selectedIds={selected}
              onToggle={toggle}
              onOpen={setPreview}
              onEnterFolder={setCurrentFolder}
              onCreateFolder={createFolder}
              onRenameFolder={renameFolder}
              onDeleteFolder={deleteFolder}
            />
```
- Update the `<NewMaterialDialog ... />` to pass `targetFolder={currentFolder}`:
```tsx
      <NewMaterialDialog
        open={newOpen}
        aftersaleNo={aftersaleNo}
        targetFolder={currentFolder}
        onCancel={() => setNewOpen(false)}
        onCreated={async (m) => { setNewOpen(false); await reload(); setMsg(`已新建材料:${m.name || m.relPath.split('/').pop()}`) }}
      />
```

- [ ] **Step 3: Verify everything**
1. `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "^src/" | grep -vE "Cannot find (name|module).*(node:|Buffer|process|console|HTMLElement|File|Blob|URL|window|document|Image|DataTransfer|ClipboardEvent|import\.meta|__dirname|require)"` → no output.
2. `npm run build` → success.
3. `npm run rebuild:node && npx vitest run` → 0 failures (report counts).

- [ ] **Step 4: Commit**
```bash
git add src/renderer/components/TicketDetail.tsx src/renderer/components/NewMaterialDialog.tsx
git commit -m "feat(ui): folder navigation in ticket detail; new material targets current folder; move materials"
```

---

## 手验清单(dev)

`npm run rebuild:electron && npm run dev`:
- 进入某售后单 → 「新建文件夹」建「凭证」→ 进入「凭证」再建「聊天」(多级)。
- 在「凭证/聊天」内「新建材料」→ 材料出现在该目录;返回根目录看不到它。
- 勾选材料 →「移动到…」选另一个目录 → 材料移走。
- 重命名「凭证」→「证据」→ 其内材料与子目录路径跟随(进入仍可见)。
- 删除某目录 → 二次确认后,其内材料消失(磁盘文件被清理)。
- 选中跨目录材料 → 导出到文件夹 / 打包 zip → 输出按目录层级还原。
- 验证后 `npm run rebuild:node` 还原 ABI。

---

## Self-Review(已核对 spec)

- **§2.1 表 + §2.2 类型**:Task 2(material_folders 表、materials.folder 列、Material/NewMaterial/CreateMaterialPayload folder)。✓
- **§3 纯函数**:Task 1(normalizeSegment/joinPath/parentPath/folderName/ancestorsAndSelf/childrenFolders/isUnderOrEqual/rewritePrefix)。✓
- **§4.1 FolderRepo**:Task 3(create 建祖先 / list / rename 子树重写+materials.folder / remove 递归返回受影响文件)。✓
- **§4.2 MaterialRepo**:Task 2(add folder / setFolder / ROW)。✓
- **§4.3 Importer**:Task 4(folder 入参)。✓ **§4.4 Exporter**:Task 4(层级 + 同目录去重)。✓
- **§4.5 IPC/preload**:Task 5(folders:* / materials:move / create 带 folder / 删目录清理文件)。✓
- **§5.1 MaterialGrid**:Task 6(面包屑/文件夹瓦片/新建/重命名/删除/文件按 currentFolder 过滤)。✓
- **§5.2 TicketDetail**:Task 7(currentFolder 状态、reload 取 folders、新建材料入当前目录、移动到 picker)。✓
- **§5.3 NewMaterialDialog**:Task 7(targetFolder)。✓
- **§6 测试**:folder-path / FolderRepo / MaterialRepo / Exporter + 手验。✓
- **类型一致**:`folder` 字段名在 types/materials/importer/exporter/ipc/grid/detail 全程一致;FolderRepo 方法名(create/list/rename/remove)与 ipc/preload 一致;preload(listFolders/createFolder/renameFolder/removeFolder/moveMaterial)与 ipc channel 一致。✓
- **占位符扫描**:无 TBD;每步含完整代码;MaterialGrid 的 ✎/🗑 给了「优先用 IconTrash」的说明。✓
