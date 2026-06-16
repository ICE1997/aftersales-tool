# 「新建材料」(自定义名称 + 剪贴板/文件选择器) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「导入材料」改为「新建材料」:一次新建一个材料、总是可命名(DB 标题)、来源支持剪贴板(图像/文件)与文件选择器,带预览。

**Architecture:** `materials` 表新增 `name` 列(附老库迁移);Importer 抽出 `record` 助手并新增 `addFile`/`addImageBuffer`;新增剪贴板模块(纯解析 + Electron 读取);IPC 用 `clipboard:peek`/`materials:pickFile`/`materials:create` 替换 `import:pick`;渲染层新增 `NewMaterialDialog`,材料卡片/预览改用标题。

**Tech Stack:** Electron, better-sqlite3, sharp, React + TS, Vitest。

---

## File Structure

```
src/shared/types.ts                         # + Material.name; + ClipboardPeek / PickedFile / CreateMaterialPayload
src/main/db/database.ts                      # + ensureColumn(); materials 建表含 name + 迁移
src/main/db/materials.ts                     # ROW + name；add 默认 name=''
src/main/services/importer.ts                # record/addFile/addImageBuffer；importFiles 改为委托
src/main/services/clipboard-parse.ts         # 纯解析:parseFileUrl / parseWindowsFileNameW
src/main/services/clipboard-source.ts        # Electron:peekClipboard / readClipboardSource
src/main/ipc.ts                              # 移除 import:pick;新增 3 个 handler
src/preload/index.ts                         # 移除 importPick;新增 peekClipboard/pickFile/createMaterial
src/renderer/components/NewMaterialDialog.tsx# 新建材料对话框
src/renderer/components/TicketDetail.tsx     # 「新建材料」按钮 + 接入对话框
src/renderer/components/MaterialGrid.tsx     # 卡片标题 = name || 文件名
src/renderer/components/PreviewModal.tsx     # 标题 = name || 文件名

tests/db/database.test.ts                    # 迁移用例
tests/db/materials.test.ts                   # name round-trip
tests/services/importer.test.ts              # addFile/addImageBuffer
tests/services/clipboard-parse.test.ts       # 纯解析
tests/services/exporter.test.ts              # Material 字面量补 name
tests/renderer/NewMaterialDialog.test.tsx    # 组件测试
```

> 全套测试在 **system Node ABI** 下运行(`npm run rebuild:node` 后 `npx vitest run`)。`npm run dev` 前需 `npm run rebuild:electron`。

---

## Task 1: 共享类型

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `tests/services/exporter.test.ts`

- [ ] **Step 1: 给 Material 加 name,并新增三个跨进程类型**

在 `src/shared/types.ts` 的 `Material` 接口里加 `name`,并在文件末尾追加新类型:
```ts
export interface Material {
  id: number
  aftersaleNo: string
  name: string
  relPath: string
  kind: MaterialKind
  capturedAt: number | null
  importedAt: number
  sizeBytes: number
  thumbPath: string | null
}

export interface ClipboardPeek {
  type: 'image' | 'file' | 'empty'
  name?: string
  thumbDataUrl?: string
  path?: string
}

export interface PickedFile {
  path: string
  name: string
}

export type CreateMaterialPayload =
  | { source: 'file'; path: string; name: string }
  | { source: 'clipboard'; name: string }
```

- [ ] **Step 2: 修复 exporter 测试里的 Material 字面量**

`tests/services/exporter.test.ts` 的 `material()` 返回一个完整 `Material` 字面量,给它加 `name: ''`:
```ts
return { id: 1, aftersaleNo: 'AS-1', name: '', relPath, kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 5, thumbPath: null }
```

- [ ] **Step 3: 全套测试确认无回归**

Run: `npx vitest run`
Expected: 38 passed(类型新增不破坏现有用例)。

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts tests/services/exporter.test.ts
git commit -m "feat: add Material.name and clipboard/create payload types"
```

---

## Task 2: DB 迁移(materials.name + 老库升级)

**Files:**
- Modify: `src/main/db/database.ts`
- Test: `tests/db/database.test.ts`

- [ ] **Step 1: 写失败测试**(在 `tests/db/database.test.ts` 末尾追加)

```ts
import Database from 'better-sqlite3'
import { ensureColumn } from '../../src/main/db/database'

describe('ensureColumn', () => {
  it('adds a missing column with its default', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT)')
    ensureColumn(db, 't', 'name', "name TEXT NOT NULL DEFAULT ''")
    const cols = (db.prepare('PRAGMA table_info(t)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('name')
    db.prepare('INSERT INTO t (a) VALUES (?)').run('x')
    expect((db.prepare('SELECT name FROM t').get() as { name: string }).name).toBe('')
  })

  it('is idempotent (no throw if column already exists)', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
    expect(() => ensureColumn(db, 't', 'name', "name TEXT NOT NULL DEFAULT ''")).not.toThrow()
  })
})

describe('materials.name column', () => {
  it('exists on a freshly created database', () => {
    const db = createDatabase(':memory:')
    const cols = (db.prepare('PRAGMA table_info(materials)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('name')
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/db/database.test.ts`
Expected: FAIL — `ensureColumn` 未导出 / materials 无 name 列。

- [ ] **Step 3: 实现**

在 `src/main/db/database.ts`:给 `materials` 建表语句加 `name` 列(放在 `kind` 之后),并新增 + 调用 `ensureColumn`。

materials 建表里加一行:
```sql
      kind         TEXT NOT NULL,
      name         TEXT NOT NULL DEFAULT '',
```

在 `migrate(db)` 的 `db.exec(...)` 之后追加:
```ts
  ensureColumn(db, 'materials', 'name', "name TEXT NOT NULL DEFAULT ''")
```

在文件中新增导出的助手:
```ts
export function ensureColumn(db: DB, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}
```

- [ ] **Step 4: 运行,确认通过 + 全套**

Run: `npx vitest run tests/db/database.test.ts` → PASS
Run: `npx vitest run` → 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/main/db/database.ts tests/db/database.test.ts
git commit -m "feat: add materials.name column with additive migration"
```

---

## Task 3: MaterialRepo 写入/读出 name

**Files:**
- Modify: `src/main/db/materials.ts`
- Test: `tests/db/materials.test.ts`

- [ ] **Step 1: 写失败测试**(追加到 `tests/db/materials.test.ts` 的 describe 内)

```ts
  it('stores and returns a custom name', () => {
    const id = materials.add({ aftersaleNo: 'AS-1', name: '聊天截图', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 5, sizeBytes: 100, thumbPath: null })
    expect(materials.getByIds([id])[0].name).toBe('聊天截图')
    expect(materials.listByTicket('AS-1')[0].name).toBe('聊天截图')
  })

  it('defaults name to empty string when omitted', () => {
    const id = materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/b.jpg', kind: 'image', capturedAt: null, importedAt: 5, sizeBytes: 100, thumbPath: null })
    expect(materials.getByIds([id])[0].name).toBe('')
  })
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/db/materials.test.ts`
Expected: FAIL(name 未持久化 / 绑定缺 @name)。

- [ ] **Step 3: 实现**

在 `src/main/db/materials.ts`:
1. `ROW` 常量加入 `name`(放在 `kind` 后):
```ts
const ROW = `id, aftersale_no AS aftersaleNo, name, rel_path AS relPath, kind,
  captured_at AS capturedAt, imported_at AS importedAt, size_bytes AS sizeBytes, thumb_path AS thumbPath`
```
2. `NewMaterial` 让 name 可选,默认 `''`:
```ts
export type NewMaterial = Omit<Material, 'id' | 'name'> & { name?: string }
```
3. `add` 写入 name(默认空串):
```ts
  add(m: NewMaterial): number {
    const info = this.db.prepare(
      `INSERT INTO materials (aftersale_no, name, rel_path, kind, captured_at, imported_at, size_bytes, thumb_path)
       VALUES (@aftersaleNo, @name, @relPath, @kind, @capturedAt, @importedAt, @sizeBytes, @thumbPath)`
    ).run({ ...m, name: m.name ?? '' })
    return Number(info.lastInsertRowid)
  }
```

- [ ] **Step 4: 运行,确认通过 + 全套**

Run: `npx vitest run tests/db/materials.test.ts` → PASS
Run: `npx vitest run` → 全绿(scanner/importer 等用 add 不传 name 的旧用例仍通过,因 name 可选)。

- [ ] **Step 5: Commit**

```bash
git add src/main/db/materials.ts tests/db/materials.test.ts
git commit -m "feat: persist material name in MaterialRepo"
```

---

## Task 4: Importer 新增 addFile / addImageBuffer

**Files:**
- Modify: `src/main/services/importer.ts`
- Test: `tests/services/importer.test.ts`

- [ ] **Step 1: 写失败测试**(追加到 `tests/services/importer.test.ts` 的 describe 内)

```ts
  it('addFile copies a single file and stores the custom name', async () => {
    const img = makeFile('photo.jpg')
    const m = await importer.addFile('AS-1', img, '破损正面')
    expect(m.name).toBe('破损正面')
    expect(m.kind).toBe('image')
    expect(existsSync(join(root, 'AS-1/images/photo.jpg'))).toBe(true)
  })

  it('addFile throws on unsupported type', async () => {
    const txt = makeFile('note.txt')
    await expect(importer.addFile('AS-1', txt, 'x')).rejects.toThrow(/unsupported/i)
  })

  it('addImageBuffer writes a png and stores the name', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#0a0' } }).png().toBuffer()
    const m = await importer.addImageBuffer('AS-1', png, '剪贴板图')
    expect(m.name).toBe('剪贴板图')
    expect(m.kind).toBe('image')
    expect(m.relPath).toMatch(/^AS-1\/images\/paste-\d+\.png$/)
    expect(existsSync(join(root, m.relPath))).toBe(true)
  })
```

在该测试文件顶部确保已 `import sharp from 'sharp'`(若未导入则加上)。`importer` 在 `beforeEach` 中已用真实 `MaterialRepo` 与 `thumbStub` 构造,且 `now: () => 42`,故 `paste-42.png`。

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/services/importer.test.ts`
Expected: FAIL — `addFile` / `addImageBuffer` 未定义。

- [ ] **Step 3: 重写 `src/main/services/importer.ts`**

```ts
import { copyFileSync, mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import type { Material, MaterialKind, ImportResult } from '../../shared/types'
import type { MaterialRepo } from '../db/materials'
import type { Thumbnailer } from './thumbnails'
import { safeDir } from './paths'

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

  private destDirFor(aftersaleNo: string, kind: MaterialKind): string {
    const dir = join(this.dataRoot, safeDir(aftersaleNo), kind === 'image' ? 'images' : 'videos')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  /** Generate thumbnail, insert the material row, return the created Material. */
  private async record(aftersaleNo: string, kind: MaterialKind, destAbs: string, name: string): Promise<Material> {
    const relPath = destAbs.slice(this.dataRoot.length + 1).split('\\').join('/')
    const thumbPath = kind === 'image' ? await this.thumb.forImage(destAbs) : await this.thumb.forVideo(destAbs)
    const id = this.materials.add({
      aftersaleNo, name, relPath, kind,
      capturedAt: null,
      importedAt: this.now(),
      sizeBytes: statSync(destAbs).size,
      thumbPath
    })
    return this.materials.getByIds([id])[0]
  }

  /** Copy one file into the ticket folder and record it. Throws on unsupported/missing. */
  async addFile(aftersaleNo: string, srcPath: string, name: string): Promise<Material> {
    const kind = this.kindOf(srcPath)
    if (!kind) throw new Error('unsupported file type')
    if (!existsSync(srcPath)) throw new Error('file not found')
    const dest = this.uniqueDest(this.destDirFor(aftersaleNo, kind), basename(srcPath))
    copyFileSync(srcPath, dest)
    return this.record(aftersaleNo, kind, dest, name)
  }

  /** Save an image buffer (e.g. from the clipboard) as a png and record it. */
  async addImageBuffer(aftersaleNo: string, buffer: Buffer, name: string): Promise<Material> {
    const dest = this.uniqueDest(this.destDirFor(aftersaleNo, 'image'), `paste-${this.now()}.png`)
    writeFileSync(dest, buffer)
    return this.record(aftersaleNo, 'image', dest, name)
  }

  /** Batch import (used by older callers/tests). Delegates to addFile, never aborting the batch. */
  async importFiles(aftersaleNo: string, files: string[]): Promise<ImportResult> {
    const result: ImportResult = { imported: [], skipped: [] }
    for (const file of files) {
      try {
        result.imported.push(await this.addFile(aftersaleNo, file, ''))
      } catch (e) {
        result.skipped.push({ file, reason: (e as Error).message })
      }
    }
    return result
  }
}
```

- [ ] **Step 4: 运行,确认通过 + 全套**

Run: `npx vitest run tests/services/importer.test.ts` → PASS(含旧的 importFiles 用例:去重 `photo-1.jpg`、跳过 unsupported/missing 不变)。
Run: `npx vitest run` → 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/main/services/importer.ts tests/services/importer.test.ts
git commit -m "feat: Importer.addFile/addImageBuffer with custom name"
```

---

## Task 5: 剪贴板模块(纯解析 + Electron 读取)

**Files:**
- Create: `src/main/services/clipboard-parse.ts`
- Create: `src/main/services/clipboard-source.ts`
- Test: `tests/services/clipboard-parse.test.ts`

- [ ] **Step 1: 写失败测试** `tests/services/clipboard-parse.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { parseFileUrl, parseWindowsFileNameW } from '../../src/main/services/clipboard-parse'

describe('parseFileUrl', () => {
  it('decodes a file URL to a path', () => {
    expect(parseFileUrl('file:///Users/x/a%20b.png')).toBe('/Users/x/a b.png')
  })
  it('trims surrounding whitespace', () => {
    expect(parseFileUrl('  file:///tmp/p.png\n')).toBe('/tmp/p.png')
  })
})

describe('parseWindowsFileNameW', () => {
  it('reads the first NUL-terminated UTF-16LE path', () => {
    const buf = Buffer.from('C:\\imgs\\a.png\0', 'utf16le')
    expect(parseWindowsFileNameW(buf)).toBe('C:\\imgs\\a.png')
  })
  it('returns the first of several NUL-separated paths', () => {
    const buf = Buffer.from('C:\\a.png\0C:\\b.png\0', 'utf16le')
    expect(parseWindowsFileNameW(buf)).toBe('C:\\a.png')
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/services/clipboard-parse.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现纯解析** `src/main/services/clipboard-parse.ts`

```ts
import { fileURLToPath } from 'node:url'

/** Convert a file:// URL (e.g. from macOS clipboard 'public.file-url') to a filesystem path. */
export function parseFileUrl(url: string): string {
  return fileURLToPath(url.trim())
}

/** Parse a Windows 'FileNameW' clipboard buffer (UTF-16LE, NUL-separated) and return the first path. */
export function parseWindowsFileNameW(buffer: Buffer): string {
  return buffer.toString('utf16le').replace(/\0+$/g, '').split('\0')[0] ?? ''
}
```

- [ ] **Step 4: 运行,确认通过**

Run: `npx vitest run tests/services/clipboard-parse.test.ts` → PASS。

- [ ] **Step 5: 实现 Electron 读取** `src/main/services/clipboard-source.ts`

> 该文件依赖 electron,不做 vitest 单测(Task 9 dev 手验)。

```ts
import { clipboard } from 'electron'
import { basename, extname } from 'node:path'
import { parseFileUrl, parseWindowsFileNameW } from './clipboard-parse'
import type { ClipboardPeek } from '../../shared/types'

function clipboardFilePath(): string | null {
  if (process.platform === 'darwin') {
    const u = clipboard.read('public.file-url')
    if (!u) return null
    try { return parseFileUrl(u) } catch { return null }
  }
  if (process.platform === 'win32') {
    const buf = clipboard.readBuffer('FileNameW')
    if (!buf || buf.length === 0) return null
    return parseWindowsFileNameW(buf) || null
  }
  return null
}

/** Inspect the clipboard for the new-material preview. */
export function peekClipboard(): ClipboardPeek {
  const img = clipboard.readImage()
  if (!img.isEmpty()) {
    return { type: 'image', name: '粘贴图片', thumbDataUrl: img.resize({ width: 240 }).toDataURL() }
  }
  const p = clipboardFilePath()
  if (p) return { type: 'file', name: basename(p, extname(p)), path: p }
  return { type: 'empty' }
}

/** Read the clipboard at create time. */
export function readClipboardSource(): { kind: 'image'; buffer: Buffer } | { kind: 'file'; path: string } | null {
  const img = clipboard.readImage()
  if (!img.isEmpty()) return { kind: 'image', buffer: img.toPNG() }
  const p = clipboardFilePath()
  if (p) return { kind: 'file', path: p }
  return null
}
```

- [ ] **Step 6: 类型检查 + 全套**

Run: `npm run build` → 干净。
Run: `npx vitest run` → 全绿。

- [ ] **Step 7: Commit**

```bash
git add src/main/services/clipboard-parse.ts src/main/services/clipboard-source.ts tests/services/clipboard-parse.test.ts
git commit -m "feat: clipboard source module (pure parsers + electron read)"
```

---

## Task 6: IPC + Preload 接线

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: 改 `src/main/ipc.ts`**

1. 顶部 import 增补:
```ts
import { join, basename, extname } from 'node:path'
```
(把原 `import { join } from 'node:path'` 替换为上面这行。)
并新增:
```ts
import { peekClipboard, readClipboardSource } from './services/clipboard-source'
```

2. 删除 `import:pick` 这个 handler:
```ts
  ipcMain.handle('import:pick', async (_e, no: string) => {
    const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (r.canceled) return { imported: [], skipped: [] }
    return importer.importFiles(no, r.filePaths)
  })
```

3. 在原 `import:pick` 位置新增三个 handler:
```ts
  ipcMain.handle('clipboard:peek', () => peekClipboard())

  ipcMain.handle('materials:pickFile', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return null
    const p = r.filePaths[0]
    return { path: p, name: basename(p, extname(p)) }
  })

  ipcMain.handle('materials:create', async (_e, no: string, payload: import('../shared/types').CreateMaterialPayload) => {
    if (payload.source === 'file') return importer.addFile(no, payload.path, payload.name)
    const src = readClipboardSource()
    if (!src) throw new Error('剪贴板没有可用的图片或文件')
    if (src.kind === 'image') return importer.addImageBuffer(no, src.buffer, payload.name)
    return importer.addFile(no, src.path, payload.name)
  })
```

- [ ] **Step 2: 改 `src/preload/index.ts`**

1. 类型 import 增补 `ClipboardPeek, PickedFile, CreateMaterialPayload`:
```ts
import type { Ticket, Material, ImportResult, ClipboardPeek, PickedFile, CreateMaterialPayload } from '../shared/types'
```
(保留现有 `Material`/`ImportResult` 等;`NewTicket` 仍从其处导入不变。)

2. 删除 `importPick` 那一行:
```ts
  importPick: (no: string): Promise<ImportResult> => ipcRenderer.invoke('import:pick', no),
```

3. 在同位置新增:
```ts
  peekClipboard: (): Promise<ClipboardPeek> => ipcRenderer.invoke('clipboard:peek'),
  pickFile: (): Promise<PickedFile | null> => ipcRenderer.invoke('materials:pickFile'),
  createMaterial: (no: string, payload: CreateMaterialPayload): Promise<Material> => ipcRenderer.invoke('materials:create', no, payload),
```

> 此时 `ImportResult` 在 preload 可能不再被引用 —— 若 `npm run build` 报未使用,从该 import 列表里去掉 `ImportResult`。

- [ ] **Step 3: 类型检查 + 全套**

Run: `npm run build` → 干净(若有未使用导入按提示删除)。
Run: `npx vitest run` → 全绿。

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat: replace import:pick with peek/pickFile/createMaterial IPC"
```

---

## Task 7: NewMaterialDialog 组件

**Files:**
- Create: `src/renderer/components/NewMaterialDialog.tsx`
- Test: `tests/renderer/NewMaterialDialog.test.tsx`

- [ ] **Step 1: 写失败测试** `tests/renderer/NewMaterialDialog.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const peekClipboard = vi.fn()
const createMaterial = vi.fn()
const pickFile = vi.fn()
vi.mock('../../src/renderer/api', () => ({
  api: {
    peekClipboard: (...a: unknown[]) => peekClipboard(...a),
    createMaterial: (...a: unknown[]) => createMaterial(...a),
    pickFile: (...a: unknown[]) => pickFile(...a)
  }
}))

import { NewMaterialDialog } from '../../src/renderer/components/NewMaterialDialog'

beforeEach(() => { peekClipboard.mockReset(); createMaterial.mockReset(); pickFile.mockReset() })

describe('NewMaterialDialog', () => {
  it('previews a clipboard image, prefills the name, lets you rename, and creates', async () => {
    peekClipboard.mockResolvedValue({ type: 'image', name: '粘贴图片', thumbDataUrl: 'data:image/png;base64,AAAA' })
    createMaterial.mockResolvedValue({ id: 1, name: '聊天截图', relPath: 'AS-1/images/paste-1.png', kind: 'image' })
    const onCreated = vi.fn()
    render(<NewMaterialDialog open={true} aftersaleNo="AS-1" onCreated={onCreated} onCancel={() => {}} />)
    const input = await screen.findByPlaceholderText('材料名称')
    await waitFor(() => expect((input as HTMLInputElement).value).toBe('粘贴图片'))
    fireEvent.change(input, { target: { value: '聊天截图' } })
    fireEvent.click(screen.getByText('创建'))
    await waitFor(() => expect(createMaterial).toHaveBeenCalledWith('AS-1', { source: 'clipboard', name: '聊天截图' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it('disables 创建 and shows a hint when the clipboard is empty', async () => {
    peekClipboard.mockResolvedValue({ type: 'empty' })
    render(<NewMaterialDialog open={true} aftersaleNo="AS-1" onCreated={() => {}} onCancel={() => {}} />)
    await waitFor(() => expect((screen.getByText('创建').closest('button') as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByText(/剪贴板没有可用的图片或文件/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/renderer/NewMaterialDialog.test.tsx`
Expected: FAIL — 组件不存在。

- [ ] **Step 3: 实现** `src/renderer/components/NewMaterialDialog.tsx`

```tsx
import { useEffect, useState } from 'react'
import type { ClipboardPeek, Material } from '@shared/types'
import { api } from '../api'
import { IconClose } from './icons'

interface Props { open: boolean; aftersaleNo: string; onCreated: (m: Material) => void; onCancel: () => void }

type Tab = 'clipboard' | 'file'

export function NewMaterialDialog({ open, aftersaleNo, onCreated, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>('clipboard')
  const [peek, setPeek] = useState<ClipboardPeek | null>(null)
  const [picked, setPicked] = useState<{ path: string; name: string } | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function refreshClipboard() {
    const p = await api.peekClipboard()
    setPeek(p)
    setName(p.name ?? '')
  }

  useEffect(() => {
    if (!open) return
    setTab('clipboard'); setPicked(null); setError(null); setPeek(null); setName('')
    refreshClipboard()
  }, [open])

  if (!open) return null

  const valid = tab === 'clipboard' ? !!peek && peek.type !== 'empty' : !!picked

  async function choose(next: Tab) {
    setError(null)
    setTab(next)
    if (next === 'clipboard') { setPicked(null); await refreshClipboard() }
  }

  async function pick() {
    setError(null)
    const f = await api.pickFile()
    if (f) { setPicked(f); setName(f.name) }
  }

  async function create() {
    if (!valid || busy) return
    setBusy(true); setError(null)
    try {
      const payload = tab === 'clipboard'
        ? { source: 'clipboard' as const, name }
        : { source: 'file' as const, path: picked!.path, name }
      const m = await api.createMaterial(aftersaleNo, payload)
      onCreated(m)
    } catch (e) {
      setError((e as Error).message || '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">新建材料</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onCancel} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>

        <div className="mb-4 inline-flex rounded-lg border border-line bg-paper-2 p-0.5 text-sm">
          <button className={`rounded-md px-3 py-1.5 ${tab === 'clipboard' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`} onClick={() => choose('clipboard')}>从剪贴板</button>
          <button className={`rounded-md px-3 py-1.5 ${tab === 'file' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`} onClick={() => choose('file')}>选择文件</button>
        </div>

        <div className="mb-4 flex min-h-[88px] items-center justify-center rounded-lg border border-line bg-paper-2 p-3 text-center text-sm text-muted">
          {tab === 'clipboard' ? (
            peek?.type === 'image' ? <img src={peek.thumbDataUrl} alt="" className="max-h-24 rounded" />
            : peek?.type === 'file' ? <span className="font-mono text-xs text-ink-soft">{peek.path}</span>
            : <div className="flex flex-col items-center gap-2"><span>剪贴板没有可用的图片或文件</span><button className="btn-ghost px-2.5 py-1 text-xs" onClick={refreshClipboard}>刷新</button></div>
          ) : (
            picked ? <span className="font-mono text-xs text-ink-soft">{picked.path}</span>
            : <button className="btn-ghost" onClick={pick}>选择文件…</button>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-soft">名称</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="材料名称" />
        </label>

        {error && <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!valid || busy} onClick={create}>创建</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行,确认通过 + 全套**

Run: `npx vitest run tests/renderer/NewMaterialDialog.test.tsx` → PASS(2 例)。
Run: `npx vitest run` → 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/NewMaterialDialog.tsx tests/renderer/NewMaterialDialog.test.tsx
git commit -m "feat: NewMaterialDialog (clipboard/file source + custom name)"
```

---

## Task 8: 接入详情页 + 标题展示

**Files:**
- Modify: `src/renderer/components/TicketDetail.tsx`
- Modify: `src/renderer/components/MaterialGrid.tsx`
- Modify: `src/renderer/components/PreviewModal.tsx`

- [ ] **Step 1: TicketDetail 接入对话框**

在 `src/renderer/components/TicketDetail.tsx`:

1. 顶部 import 增补组件:
```ts
import { NewMaterialDialog } from './NewMaterialDialog'
```

2. 新增状态(与其他 `useState` 放一起):
```ts
  const [newOpen, setNewOpen] = useState(false)
```

3. 删除 `doImport` 函数:
```ts
  async function doImport() {
    const res = await api.importPick(aftersaleNo)
    await reload()
    const skipped = res.skipped.length
    setMsg(`导入 ${res.imported.length} 个${skipped ? `,跳过 ${skipped} 个(${res.skipped.map(s => s.reason).join('、')})` : ''}`)
  }
```

4. 工具栏「导入材料」按钮改为打开对话框:
```tsx
        <button className="btn-primary" onClick={() => setNewOpen(true)}><IconImport className="text-[16px]" /> 新建材料</button>
```

5. 在组件返回的最后(`<PreviewModal ... />` 之后)加入对话框:
```tsx
      <NewMaterialDialog
        open={newOpen}
        aftersaleNo={aftersaleNo}
        onCancel={() => setNewOpen(false)}
        onCreated={async (m) => { setNewOpen(false); await reload(); setMsg(`已新建材料:${m.name || m.relPath.split('/').pop()}`) }}
      />
```

- [ ] **Step 2: MaterialGrid 卡片标题用 name 兜底**

在 `src/renderer/components/MaterialGrid.tsx`,卡片底部文件名那行:
```tsx
            <div className="truncate px-2.5 py-2 font-mono text-[11px] text-ink-soft">{m.name || m.relPath.split('/').pop()}</div>
```

- [ ] **Step 3: PreviewModal 标题用 name 兜底**

在 `src/renderer/components/PreviewModal.tsx`,把
```tsx
  const name = material.relPath.split('/').pop()
```
改为
```tsx
  const name = material.name || material.relPath.split('/').pop()
```

- [ ] **Step 4: 类型检查 + 全套**

Run: `npm run build` → 干净(确认 `TicketDetail` 不再引用 `api.importPick`)。
Run: `npx vitest run` → 全绿(渲染层既有测试不受影响)。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TicketDetail.tsx src/renderer/components/MaterialGrid.tsx src/renderer/components/PreviewModal.tsx
git commit -m "feat: wire NewMaterialDialog; show material name in grid/preview"
```

---

## Task 9: 真机验证(dev)

**Files:** 无(仅验证)

- [ ] **Step 1: 切到 Electron ABI 并启动 dev**

```bash
npm run rebuild:electron
npm run dev
```

- [ ] **Step 2: 手动验证清单**

1. 新建/进入一个售后单 → 工具栏显示「新建材料」。
2. 截图(系统截图到剪贴板)→ 点「新建材料」→「从剪贴板」显示缩略图,名称预填「粘贴图片」→ 改名「聊天记录」→ 创建 → 网格出现该材料,卡片显示「聊天记录」。
3. 在访达/资源管理器复制一个图片文件 → 「新建材料」→「从剪贴板」显示该文件名 → 创建 → 成功。
4. 「选择文件」→ 选一个 mp4 → 名称预填文件名 → 创建 → 网格出现视频(带播放角标)。
5. 清空剪贴板(复制一段不含图片/文件的文字)→「从剪贴板」显示「剪贴板没有可用的图片或文件」且「创建」禁用;点「刷新」可重读。
6. 不支持的文件(如 .txt)经「选择文件」创建 → 对话框红色提示「unsupported file type」。
7. 预览弹窗标题显示材料名称。

- [ ] **Step 3: 还原 ABI**

```bash
npm run rebuild:node
npx vitest run   # 确认仍全绿
```

- [ ] **Step 4: (可选)收尾**

dev 验证若发现问题,回到对应任务修正;无问题则本功能完成。

---

## Self-Review 记录

- **Spec 覆盖**:名称=DB 标题 → Task 1/3;迁移 → Task 2;Importer addFile/addImageBuffer + record → Task 4;剪贴板图像/文件(含平台解析纯函数)→ Task 5;IPC peek/pickFile/create 替换 import:pick → Task 6;NewMaterialDialog(预览/预填/刷新/错误)→ Task 7;入口改名 + 接入 + 标题展示 → Task 8;错误处理(空剪贴板禁用、create 再读为空抛错、不支持类型、取消)分布于 Task 5/6/7;dev 手验 → Task 9。
- **不做项**:多文件批量新建、剪贴板多文件、按名重命名磁盘文件、改动既有缩略图/导出/打包 —— 均未引入。
- **类型一致性**:`Material.name`(Task 1)贯穿 repo(Task 3)、importer 返回(Task 4)、preload/IPC(Task 6)、渲染层(Task 7/8);`ClipboardPeek`/`PickedFile`/`CreateMaterialPayload`(Task 1)在 clipboard-source(Task 5)、IPC/preload(Task 6)、对话框(Task 7)中签名一致;`api.peekClipboard/pickFile/createMaterial` 名称在 preload(Task 6)与对话框/测试(Task 7)一致;旧 `api.importPick` 在 Task 6(preload)与 Task 8(TicketDetail)同步移除。
- **NewMaterial 兼容**:`name` 设为可选默认 `''`(Task 3),故 scanner/materials 既有 `add(...)` 调用无需改动;仅 exporter 测试的完整 `Material` 字面量补 `name`(Task 1)。
