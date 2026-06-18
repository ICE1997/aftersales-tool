# Material Filename = Name, Single Per-Folder Directory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a material is created, store it on disk with its filename equal to the (sanitized) material name + original extension, in a single directory per logical folder (no images/videos split), with material names unique within each folder.

**Architecture:** Make the physical layout mirror the logical folder tree: `{dataRoot}/{safeSeg(售后单号)}/{folder segments}/{name}{ext}`. Pure path/name helpers live in `src/shared/material-path.ts` so both the DB layer (`FolderRepo`) and the service layer (`Importer`) share one source of truth. Create, move-to-folder, and folder-rename all keep disk and DB in sync; uniqueness is enforced in the main process.

**Tech Stack:** Electron + TypeScript, better-sqlite3 via Knex, React renderer, Vitest.

## Global Constraints

- Material name is **required** (non-empty after trim). Empty → throw `请输入材料名称`.
- Reject names containing `/ \ : * ? " < > |`, control chars, `.`, `..`, or a trailing dot → throw `材料名称不能包含 / \\ : * ? " < > | 等字符`.
- Material name must be unique within `(aftersaleNo, folder)` → throw `该文件夹下已存在同名材料`.
- Extension is preserved unchanged (`extname` of the source filename).
- No upfront migration of legacy materials. Legacy materials are only relocated when a folder op touches them; if their `name` is empty, fall back to their current basename.
- All commit messages end with the Co-Authored-By trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- Run tests with `npm test` (vitest). Type-check with `npx tsc --noEmit`.

---

### Task 1: Pure path & name helpers

**Files:**
- Create: `src/shared/material-path.ts`
- Modify: `src/main/services/paths.ts`
- Test: `tests/shared/material-path.test.ts`

**Interfaces:**
- Produces:
  - `safeSeg(s: string): string` — sanitize one path segment (illegal chars → `_`, strip trailing dots, trim; `''` → `'_'`).
  - `assertValidMaterialName(name: string): string` — throws on invalid; returns the trimmed name.
  - `materialRelPath(aftersaleNo: string, folder: string, name: string, ext: string): string` — POSIX-joined relative path `safeSeg(no)/[safeSeg(seg)...]/name+ext`.
  - `materialDir(dataRoot: string, aftersaleNo: string, folder: string): string` — absolute directory (from `src/main/services/paths.ts`).
  - `safeDir(aftersaleNo: string): string` — unchanged name, now re-exported from `material-path` (alias of `safeSeg`).

- [ ] **Step 1: Write the failing test**

Create `tests/shared/material-path.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { safeSeg, assertValidMaterialName, materialRelPath } from '../../src/shared/material-path'

describe('safeSeg', () => {
  it('replaces illegal characters with underscore', () => {
    expect(safeSeg('a/b:c*d')).toBe('a_b_c_d')
  })
  it('strips trailing dots and trims, falling back to underscore', () => {
    expect(safeSeg('  name.. ')).toBe('name')
    expect(safeSeg('...')).toBe('_')
  })
})

describe('assertValidMaterialName', () => {
  it('returns the trimmed name when valid', () => {
    expect(assertValidMaterialName('  客服对话 ')).toBe('客服对话')
  })
  it('throws on empty/whitespace', () => {
    expect(() => assertValidMaterialName('   ')).toThrow('请输入材料名称')
  })
  it('throws on illegal characters', () => {
    expect(() => assertValidMaterialName('a/b')).toThrow('材料名称不能包含')
    expect(() => assertValidMaterialName('a:b')).toThrow('材料名称不能包含')
    expect(() => assertValidMaterialName('..')).toThrow('材料名称不能包含')
    expect(() => assertValidMaterialName('name.')).toThrow('材料名称不能包含')
  })
})

describe('materialRelPath', () => {
  it('builds path for a nested folder', () => {
    expect(materialRelPath('AS-1', '凭证/聊天', '客服对话', '.jpg')).toBe('AS-1/凭证/聊天/客服对话.jpg')
  })
  it('places root-folder materials directly under the ticket dir', () => {
    expect(materialRelPath('AS-1', '', '截图', '.png')).toBe('AS-1/截图.png')
  })
  it('sanitizes ticket and folder segments', () => {
    expect(materialRelPath('AS/1', 'a:b', 'n', '.jpg')).toBe('AS_1/a_b/n.jpg')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/material-path.test.ts`
Expected: FAIL — cannot find module `src/shared/material-path`.

- [ ] **Step 3: Write the helpers**

Create `src/shared/material-path.ts`:

```typescript
// eslint-disable-next-line no-control-regex -- intentional: strip control chars from filenames
const ILLEGAL = /[<>:"/\\|?*\x00-\x1f]/

/** Sanitize one path segment: illegal chars -> '_', strip trailing dots, trim. */
export function safeSeg(s: string): string {
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars from filenames
  const cleaned = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.+$/, '').trim()
  return cleaned || '_'
}

/** Validate a user-entered material name. Returns the trimmed name or throws. */
export function assertValidMaterialName(name: string): string {
  const s = (name ?? '').trim()
  if (!s) throw new Error('请输入材料名称')
  if (s === '.' || s === '..' || ILLEGAL.test(s) || s.endsWith('.')) {
    throw new Error('材料名称不能包含 / \\ : * ? " < > | 等字符')
  }
  return s
}

/** Relative (POSIX) path for a material file: safeSeg(no)/[folder segs]/name+ext. */
export function materialRelPath(aftersaleNo: string, folder: string, name: string, ext: string): string {
  const segs = folder ? folder.split('/').map(safeSeg) : []
  return [safeSeg(aftersaleNo), ...segs, `${name}${ext}`].join('/')
}
```

- [ ] **Step 4: Update `src/main/services/paths.ts`**

Replace the entire contents of `src/main/services/paths.ts` with:

```typescript
import { join } from 'node:path'
import { safeSeg } from '../../shared/material-path'

/** Make an after-sale number safe to use as a single path segment. */
export const safeDir = safeSeg

/** Absolute directory that holds a material: dataRoot/safeSeg(no)/[folder segs]. */
export function materialDir(dataRoot: string, aftersaleNo: string, folder: string): string {
  const segs = folder ? folder.split('/').map(safeSeg) : []
  return join(dataRoot, safeSeg(aftersaleNo), ...segs)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/shared/material-path.test.ts`
Expected: PASS (9 assertions across 3 describe blocks).

- [ ] **Step 6: Type-check (catches broken `safeDir` imports)**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/material-path.ts src/main/services/paths.ts tests/shared/material-path.test.ts
git commit -m "feat(materials): add shared path/name helpers, materialDir

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: MaterialRepo uniqueness query + file-move update

**Files:**
- Modify: `src/main/db/materials.ts`
- Test: `tests/db/materials.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `MaterialRepo.nameTaken(aftersaleNo: string, folder: string, name: string, exceptId?: number): Promise<boolean>`
  - `MaterialRepo.moveFile(id: number, relPath: string, folder: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Append inside the `describe('MaterialRepo', ...)` block in `tests/db/materials.test.ts`:

```typescript
  it('nameTaken detects duplicate name within the same folder only', async () => {
    await materials.add({ aftersaleNo: 'AS-1', name: '客服对话', relPath: 'AS-1/凭证/客服对话.jpg', kind: 'image', folder: '凭证', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    expect(await materials.nameTaken('AS-1', '凭证', '客服对话')).toBe(true)
    expect(await materials.nameTaken('AS-1', '物流', '客服对话')).toBe(false)
    expect(await materials.nameTaken('AS-1', '凭证', '别的')).toBe(false)
  })

  it('nameTaken can exclude a specific id (self when moving)', async () => {
    const id = await materials.add({ aftersaleNo: 'AS-1', name: 'a', relPath: 'AS-1/a.jpg', kind: 'image', folder: '', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    expect(await materials.nameTaken('AS-1', '', 'a')).toBe(true)
    expect(await materials.nameTaken('AS-1', '', 'a', id)).toBe(false)
  })

  it('moveFile updates rel_path and folder together', async () => {
    const id = await materials.add({ aftersaleNo: 'AS-1', name: 'a', relPath: 'AS-1/a.jpg', kind: 'image', folder: '', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    await materials.moveFile(id, 'AS-1/凭证/a.jpg', '凭证')
    const m = (await materials.getByIds([id]))[0]
    expect(m.relPath).toBe('AS-1/凭证/a.jpg')
    expect(m.folder).toBe('凭证')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/materials.test.ts`
Expected: FAIL — `materials.nameTaken is not a function`.

- [ ] **Step 3: Add the methods**

In `src/main/db/materials.ts`, add these methods to the `MaterialRepo` class (e.g. after `setFolder`):

```typescript
  async nameTaken(aftersaleNo: string, folder: string, name: string, exceptId?: number): Promise<boolean> {
    const q = this.db('materials').where({ aftersale_no: aftersaleNo, folder, name })
    if (exceptId != null) q.whereNot('id', exceptId)
    return !!(await q.first())
  }

  async moveFile(id: number, relPath: string, folder: string): Promise<void> {
    await this.db('materials').where('id', id).update({ rel_path: relPath, folder })
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/db/materials.test.ts`
Expected: PASS (all existing + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/materials.ts tests/db/materials.test.ts
git commit -m "feat(materials): add nameTaken and moveFile to MaterialRepo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Importer create — single dir, filename = name, validation, uniqueness

**Files:**
- Modify: `src/main/services/importer.ts`
- Test: `tests/services/importer.test.ts` (rewrite)

**Interfaces:**
- Consumes: `materialDir` (Task 1), `assertValidMaterialName` (Task 1), `MaterialRepo.nameTaken` (Task 2).
- Produces:
  - `Importer.addFile(aftersaleNo, srcPath, name, folder='')` — now: validates name, enforces per-folder uniqueness, writes to `materialDir/...{name}{ext}`.
  - `Importer.addBytes(aftersaleNo, fileName, buffer, name, folder='')` — same.
  - `Importer.moveToFolder(...)` is added later (Task 4).
  - `Importer.importFiles` is **removed**.

- [ ] **Step 1: Rewrite the importer test file**

Replace the entire contents of `tests/services/importer.test.ts` with:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Knex } from 'knex'
import sharp from 'sharp'
import { makeTempDb } from '../db/helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { Importer } from '../../src/main/services/importer'

let root: string
let db: Knex
let importer: Importer
let cleanupDb: () => Promise<void>

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'vh-imp-'))
  ;({ db, cleanup: cleanupDb } = await makeTempDb())
  await new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  const thumbStub = { forImage: async () => 'thumb.jpg', forVideo: async () => 'thumb.jpg' } as any
  importer = new Importer(root, new MaterialRepo(db), thumbStub, () => 42)
})
afterEach(async () => { rmSync(root, { recursive: true, force: true }); await cleanupDb() })

function makeFile(name: string, content = 'x'): string {
  const p = join(root, name)
  writeFileSync(p, content)
  return p
}

describe('Importer.addFile', () => {
  it('names the file after the material name and stores it in the ticket root dir', async () => {
    const img = makeFile('IMG_0001.jpg')
    const m = await importer.addFile('AS-1', img, '破损正面')
    expect(m.name).toBe('破损正面')
    expect(m.kind).toBe('image')
    expect(m.relPath).toBe('AS-1/破损正面.jpg')
    expect(existsSync(join(root, 'AS-1/破损正面.jpg'))).toBe(true)
  })

  it('places images and videos together in the folder directory (no images/videos split)', async () => {
    const img = makeFile('a.jpg')
    const vid = makeFile('b.mp4')
    const mi = await importer.addFile('AS-1', img, '图', '凭证')
    const mv = await importer.addFile('AS-1', vid, '视频', '凭证')
    expect(mi.relPath).toBe('AS-1/凭证/图.jpg')
    expect(mv.relPath).toBe('AS-1/凭证/视频.mp4')
    expect(existsSync(join(root, 'AS-1/凭证/图.jpg'))).toBe(true)
    expect(existsSync(join(root, 'AS-1/凭证/视频.mp4'))).toBe(true)
  })

  it('rejects a duplicate name within the same folder', async () => {
    await importer.addFile('AS-1', makeFile('a.jpg'), '凭证图', '凭证')
    await expect(importer.addFile('AS-1', makeFile('b.jpg'), '凭证图', '凭证')).rejects.toThrow('该文件夹下已存在同名材料')
  })

  it('allows the same name in different folders', async () => {
    const m1 = await importer.addFile('AS-1', makeFile('a.jpg'), '同名', '凭证')
    const m2 = await importer.addFile('AS-1', makeFile('b.jpg'), '同名', '物流')
    expect(m1.relPath).toBe('AS-1/凭证/同名.jpg')
    expect(m2.relPath).toBe('AS-1/物流/同名.jpg')
  })

  it('rejects an empty name', async () => {
    await expect(importer.addFile('AS-1', makeFile('a.jpg'), '   ')).rejects.toThrow('请输入材料名称')
  })

  it('rejects a name with illegal characters', async () => {
    await expect(importer.addFile('AS-1', makeFile('a.jpg'), 'a/b')).rejects.toThrow('材料名称不能包含')
  })

  it('throws on unsupported type before validating the name', async () => {
    await expect(importer.addFile('AS-1', makeFile('note.txt'), 'x')).rejects.toThrow(/unsupported/i)
  })

  it('sanitizes illegal chars in aftersaleNo when building the destination dir', async () => {
    const illegalNo = 'AS/2026:06'
    await new TicketRepo(db, () => 1).create({ aftersaleNo: illegalNo, orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const m = await importer.addFile(illegalNo, makeFile('p.jpg'), '图')
    expect(m.aftersaleNo).toBe(illegalNo)
    expect(m.relPath).toBe('AS_2026_06/图.jpg')
    expect(existsSync(join(root, 'AS_2026_06/图.jpg'))).toBe(true)
  })
})

describe('Importer.addBytes', () => {
  it('writes pasted bytes named after the material name', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#0a0' } }).png().toBuffer()
    const m = await importer.addBytes('AS-1', 'paste.png', png, '剪贴板图', '凭证')
    expect(m.name).toBe('剪贴板图')
    expect(m.relPath).toBe('AS-1/凭证/剪贴板图.png')
    expect(existsSync(join(root, m.relPath))).toBe(true)
  })

  it('classifies a video by extension and keeps it in one dir', async () => {
    const m = await importer.addBytes('AS-1', 'clip.mp4', Buffer.from('x'), '视频')
    expect(m.kind).toBe('video')
    expect(m.relPath).toBe('AS-1/视频.mp4')
  })

  it('throws on unsupported type', async () => {
    await expect(importer.addBytes('AS-1', 'note.txt', Buffer.from('x'), 'x')).rejects.toThrow(/unsupported/i)
  })

  it('rejects an empty buffer', async () => {
    await expect(importer.addBytes('AS-1', 'paste.png', Buffer.alloc(0), 'x')).rejects.toThrow(/empty/i)
  })

  it('rejects a duplicate name within the same folder', async () => {
    await importer.addBytes('AS-1', 'a.png', Buffer.from('x'), '同名', '凭证')
    await expect(importer.addBytes('AS-1', 'b.png', Buffer.from('y'), '同名', '凭证')).rejects.toThrow('该文件夹下已存在同名材料')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/importer.test.ts`
Expected: FAIL — current importer still writes to `images/`, keeps original filename, and has no validation.

- [ ] **Step 3: Rewrite the importer**

Replace the entire contents of `src/main/services/importer.ts` with:

```typescript
import { copyFileSync, mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { join, basename, extname, relative } from 'node:path'
import type { Material, MaterialKind } from '../../shared/types'
import type { MaterialRepo } from '../db/materials'
import type { Thumbnailer } from './thumbnails'
import { materialDir } from './paths'
import { assertValidMaterialName } from '../../shared/material-path'

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

  /** Resolve the destination dir + absolute path for a (validated) material. mkdir's the dir. */
  private destFor(aftersaleNo: string, folder: string, name: string, ext: string): string {
    const dir = materialDir(this.dataRoot, aftersaleNo, folder)
    mkdirSync(dir, { recursive: true })
    return join(dir, `${name}${ext}`)
  }

  /** Generate thumbnail, insert the material row, return the created Material. */
  private async record(aftersaleNo: string, kind: MaterialKind, destAbs: string, name: string, folder: string): Promise<Material> {
    const relPath = relative(this.dataRoot, destAbs).split('\\').join('/')
    const thumbPath = kind === 'image' ? await this.thumb.forImage(destAbs) : await this.thumb.forVideo(destAbs)
    const id = await this.materials.add({
      aftersaleNo, name, relPath, kind, folder,
      capturedAt: null,
      importedAt: this.now(),
      sizeBytes: statSync(destAbs).size,
      thumbPath
    })
    const created = (await this.materials.getByIds([id]))[0]
    if (!created) throw new Error(`material not found after insert: ${id}`)
    return created
  }

  /** Copy one file into the ticket folder, named after the material name. */
  async addFile(aftersaleNo: string, srcPath: string, name: string, folder = ''): Promise<Material> {
    const kind = this.kindOf(srcPath)
    if (!kind) throw new Error('unsupported file type')
    if (!existsSync(srcPath)) throw new Error('file not found')
    const clean = assertValidMaterialName(name)
    if (await this.materials.nameTaken(aftersaleNo, folder, clean)) throw new Error('该文件夹下已存在同名材料')
    const dest = this.destFor(aftersaleNo, folder, clean, extname(srcPath))
    copyFileSync(srcPath, dest)
    return this.record(aftersaleNo, kind, dest, clean, folder)
  }

  /** Write file bytes (e.g. a pasted image/file) into the ticket folder, named after the material name. */
  async addBytes(aftersaleNo: string, fileName: string, buffer: Buffer, name: string, folder = ''): Promise<Material> {
    const kind = this.kindOf(fileName)
    if (!kind) throw new Error('unsupported file type')
    if (!buffer || buffer.length === 0) throw new Error('empty file')
    const clean = assertValidMaterialName(name)
    if (await this.materials.nameTaken(aftersaleNo, folder, clean)) throw new Error('该文件夹下已存在同名材料')
    const dest = this.destFor(aftersaleNo, folder, clean, extname(fileName))
    writeFileSync(dest, buffer)
    return this.record(aftersaleNo, kind, dest, clean, folder)
  }
}
```

Note: `ImportResult` import and the `importFiles` method are removed. `basename` stays imported because Task 4 adds `moveToFolder` which uses it; if a lint "unused import" error appears now, remove `basename` here and re-add it in Task 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/importer.test.ts`
Expected: PASS (all addFile + addBytes tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (If it reports `ImportResult` unused in `src/shared/types.ts`, leave the type — it may be used elsewhere; only fix errors about `importFiles` callers, of which there should be none in `src/`.)

- [ ] **Step 6: Commit**

```bash
git add src/main/services/importer.ts tests/services/importer.test.ts
git commit -m "feat(materials): create files named after material name in one per-folder dir

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Move material to another folder — sync the file on disk

**Files:**
- Modify: `src/main/services/importer.ts`
- Modify: `src/main/ipc.ts:122`
- Test: `tests/services/importer-move.test.ts`

**Interfaces:**
- Consumes: `materialRelPath` (Task 1), `MaterialRepo.nameTaken` / `moveFile` (Task 2).
- Produces: `Importer.moveToFolder(id: number, folder: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `tests/services/importer-move.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Knex } from 'knex'
import { makeTempDb } from '../db/helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { Importer } from '../../src/main/services/importer'

let root: string
let db: Knex
let importer: Importer
let materials: MaterialRepo
let cleanupDb: () => Promise<void>

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'vh-mv-'))
  ;({ db, cleanup: cleanupDb } = await makeTempDb())
  await new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  materials = new MaterialRepo(db)
  const thumbStub = { forImage: async () => 'thumb.jpg', forVideo: async () => 'thumb.jpg' } as any
  importer = new Importer(root, materials, thumbStub, () => 42)
})
afterEach(async () => { rmSync(root, { recursive: true, force: true }); await cleanupDb() })

function makeFile(name: string, content = 'x'): string {
  const p = join(root, name)
  writeFileSync(p, content)
  return p
}

describe('Importer.moveToFolder', () => {
  it('moves the file on disk and updates rel_path + folder', async () => {
    const m = await importer.addFile('AS-1', makeFile('a.jpg'), '凭证图')
    expect(existsSync(join(root, 'AS-1/凭证图.jpg'))).toBe(true)

    await importer.moveToFolder(m.id, '凭证/聊天')

    const moved = (await materials.getByIds([m.id]))[0]
    expect(moved.folder).toBe('凭证/聊天')
    expect(moved.relPath).toBe('AS-1/凭证/聊天/凭证图.jpg')
    expect(existsSync(join(root, 'AS-1/凭证/聊天/凭证图.jpg'))).toBe(true)
    expect(existsSync(join(root, 'AS-1/凭证图.jpg'))).toBe(false)
  })

  it('rejects moving into a folder that already has the same name', async () => {
    const m = await importer.addFile('AS-1', makeFile('a.jpg'), '同名')
    await importer.addFile('AS-1', makeFile('b.jpg'), '同名', '凭证')
    await expect(importer.moveToFolder(m.id, '凭证')).rejects.toThrow('该文件夹下已存在同名材料')
  })

  it('is a no-op when the folder is unchanged', async () => {
    const m = await importer.addFile('AS-1', makeFile('a.jpg'), '图', '凭证')
    await importer.moveToFolder(m.id, '凭证')
    expect(existsSync(join(root, 'AS-1/凭证/图.jpg'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/importer-move.test.ts`
Expected: FAIL — `importer.moveToFolder is not a function`.

- [ ] **Step 3: Add `moveToFolder` to the importer**

In `src/main/services/importer.ts`: ensure `renameSync` is imported from `node:fs` and `basename` from `node:path`, add the `materialRelPath` import, then add the method.

Update the imports at the top:

```typescript
import { copyFileSync, mkdirSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { join, basename, extname, relative } from 'node:path'
```

```typescript
import { materialRelPath, assertValidMaterialName } from '../../shared/material-path'
```

Add this method to the `Importer` class (after `addBytes`):

```typescript
  /** Move a material to another logical folder, relocating its file on disk to match. */
  async moveToFolder(id: number, folder: string): Promise<void> {
    const m = (await this.materials.getByIds([id]))[0]
    if (!m) throw new Error('material not found')
    if (m.folder === folder) return
    if (m.name && await this.materials.nameTaken(m.aftersaleNo, folder, m.name, id)) {
      throw new Error('该文件夹下已存在同名材料')
    }
    const ext = extname(m.relPath)
    // New materials always have a name; legacy materials may not — fall back to current basename.
    const stem = m.name || basename(m.relPath, ext)
    const newRel = materialRelPath(m.aftersaleNo, folder, stem, ext)
    const srcAbs = join(this.dataRoot, m.relPath)
    const destAbs = join(this.dataRoot, newRel)
    mkdirSync(join(this.dataRoot, materialRelPath(m.aftersaleNo, folder, '_', '').slice(0, -1)), { recursive: true })
    if (existsSync(srcAbs) && srcAbs !== destAbs) renameSync(srcAbs, destAbs)
    await this.materials.moveFile(id, newRel, folder)
  }
```

Note on the `mkdirSync` line: it creates the destination directory by reusing `materialDir`. Prefer importing `materialDir` and writing it clearly instead — replace that line with:

```typescript
    mkdirSync(materialDir(this.dataRoot, m.aftersaleNo, folder), { recursive: true })
```

(`materialDir` is already imported in Task 3.)

- [ ] **Step 4: Wire the IPC handler**

In `src/main/ipc.ts`, change line 122 from:

```typescript
  ipcMain.handle('materials:move', (_e, id: number, folder: string) => materials.setFolder(id, folder))
```

to:

```typescript
  ipcMain.handle('materials:move', (_e, id: number, folder: string) => importer.moveToFolder(id, folder))
```

- [ ] **Step 5: Run tests + type-check**

Run: `npx vitest run tests/services/importer-move.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/main/services/importer.ts src/main/ipc.ts tests/services/importer-move.test.ts
git commit -m "feat(materials): relocate file on disk when moving material between folders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Folder rename + remove — sync files on disk

**Files:**
- Modify: `src/main/db/folders.ts`
- Modify: `src/main/ipc.ts:116-121` (folders:remove) and `:115` (folders:rename)
- Test: `tests/db/folders.test.ts`

**Interfaces:**
- Consumes: `materialRelPath` (Task 1).
- Produces:
  - `FolderRepo.rename(...)` now returns `Array<{ oldRelPath: string; newRelPath: string }>` (the files to move on disk; rel_path already updated in DB).
  - `folders:rename` IPC handler renames those files on disk after the DB update.

- [ ] **Step 1: Write the failing test**

Append inside `describe('FolderRepo', ...)` in `tests/db/folders.test.ts`:

```typescript
  it('rename rewrites material rel_path and returns the disk moves', async () => {
    await folders.create('AS-1', '凭证/聊天')
    const mid = await materials.add({ aftersaleNo: 'AS-1', name: 'x', relPath: 'AS-1/凭证/聊天/x.jpg', kind: 'image', folder: '凭证/聊天', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    const moves = await folders.rename('AS-1', '凭证', '证据')
    expect((await materials.getByIds([mid]))[0].folder).toBe('证据/聊天')
    expect((await materials.getByIds([mid]))[0].relPath).toBe('AS-1/证据/聊天/x.jpg')
    expect(moves).toEqual([{ oldRelPath: 'AS-1/凭证/聊天/x.jpg', newRelPath: 'AS-1/证据/聊天/x.jpg' }])
  })

  it('rename falls back to current basename for legacy materials with empty name', async () => {
    await folders.create('AS-1', '凭证')
    const mid = await materials.add({ aftersaleNo: 'AS-1', name: '', relPath: 'AS-1/images/legacy.jpg', kind: 'image', folder: '凭证', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    const moves = await folders.rename('AS-1', '凭证', '证据')
    expect((await materials.getByIds([mid]))[0].relPath).toBe('AS-1/证据/legacy.jpg')
    expect(moves).toEqual([{ oldRelPath: 'AS-1/images/legacy.jpg', newRelPath: 'AS-1/证据/legacy.jpg' }])
  })
```

The existing `rename rewrites the folder subtree and material folders` test asserts only folder labels and still passes; leave it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/folders.test.ts`
Expected: FAIL — `moves` is `undefined` / rel_path unchanged.

- [ ] **Step 3: Update `FolderRepo.rename`**

In `src/main/db/folders.ts`:

Add imports at the top (extend the existing import line and add `node:path` + material-path):

```typescript
import { ancestorsAndSelf, isUnderOrEqual, joinPath, parentPath, rewritePrefix, normalizeSegment } from '../../shared/folder-path'
import { materialRelPath } from '../../shared/material-path'
import { basename, extname } from 'node:path'
```

Add a type near the top (next to `AffectedMaterial`):

```typescript
export interface MovedFile { oldRelPath: string; newRelPath: string }
```

Replace the `rename` method with:

```typescript
  async rename(aftersaleNo: string, path: string, newName: string): Promise<MovedFile[]> {
    const newPath = joinPath(parentPath(path), normalizeSegment(newName))
    if (newPath === path) return []
    const clash = await this.db('material_folders').where({ aftersale_no: aftersaleNo, path: newPath }).first()
    if (clash) throw new Error('同级已存在同名文件夹')
    const moves: MovedFile[] = []
    await this.db.transaction(async (trx) => {
      const fs = (await trx('material_folders').select('id', 'path').where('aftersale_no', aftersaleNo)) as { id: number; path: string }[]
      for (const f of fs) if (isUnderOrEqual(f.path, path)) await trx('material_folders').where('id', f.id).update({ path: rewritePrefix(f.path, path, newPath) })
      const ms = (await trx('materials').select('id', 'name', { relPath: 'rel_path' }, 'folder').where('aftersale_no', aftersaleNo)) as { id: number; name: string; relPath: string; folder: string }[]
      for (const m of ms) {
        if (!isUnderOrEqual(m.folder, path)) continue
        const newFolder = rewritePrefix(m.folder, path, newPath)
        const ext = extname(m.relPath)
        const stem = m.name || basename(m.relPath, ext)
        const newRel = materialRelPath(aftersaleNo, newFolder, stem, ext)
        await trx('materials').where('id', m.id).update({ folder: newFolder, rel_path: newRel })
        if (newRel !== m.relPath) moves.push({ oldRelPath: m.relPath, newRelPath: newRel })
      }
    })
    return moves
  }
```

- [ ] **Step 4: Run the DB test to verify it passes**

Run: `npx vitest run tests/db/folders.test.ts`
Expected: PASS (existing + 2 new tests).

- [ ] **Step 5: Update the IPC handlers to move/clean files on disk**

In `src/main/ipc.ts`:

Add `renameSync`, `rmdirSync` to the `node:fs` import (line 3), and `dirname` to the `node:path` import (line 2):

```typescript
import { join, basename, extname, dirname } from 'node:path'
import { mkdirSync, existsSync, cpSync, rmSync, unlinkSync, renameSync, rmdirSync } from 'node:fs'
```

Replace the `folders:rename` handler (line 115) with:

```typescript
  ipcMain.handle('folders:rename', async (_e, no: string, path: string, newName: string) => {
    const moves = await folderRepo.rename(no, path, newName)
    for (const mv of moves) {
      const src = join(dataRoot, mv.oldRelPath)
      const dest = join(dataRoot, mv.newRelPath)
      if (!existsSync(src) || src === dest) continue
      mkdirSync(dirname(dest), { recursive: true })
      try { renameSync(src, dest) } catch { /* ignore: source missing or already moved */ }
    }
  })
```

Replace the `folders:remove` handler (lines 116-121) with (adds best-effort rmdir of the emptied folder dir):

```typescript
  ipcMain.handle('folders:remove', async (_e, no: string, path: string) => {
    for (const m of await folderRepo.remove(no, path)) {
      try { unlinkSync(join(dataRoot, m.relPath)) } catch { /* ignore */ }
      if (m.thumbPath) { try { unlinkSync(join(dataRoot, m.thumbPath)) } catch { /* ignore */ } }
    }
    try { rmdirSync(materialDir(dataRoot, no, path), { recursive: true }) } catch { /* ignore: dir missing or not empty */ }
  })
```

Add `materialDir` to the paths import at the top of `src/main/ipc.ts` (line 17):

```typescript
import { safeDir, materialDir } from './services/paths'
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/main/db/folders.ts src/main/ipc.ts tests/db/folders.test.ts
git commit -m "feat(materials): move/clean files on disk when renaming or removing folders

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Renderer — require a material name

**Files:**
- Modify: `src/renderer/components/NewMaterialDialog.tsx:73`

**Interfaces:**
- Consumes: existing `api.createMaterial` (errors already surface to the error banner).
- Produces: 创建 button disabled until name is non-empty; thrown errors (duplicate/illegal) already shown inline via the existing `catch`.

- [ ] **Step 1: Make name required for validity**

In `src/renderer/components/NewMaterialDialog.tsx`, change line 73 from:

```typescript
  const valid = tab === 'clipboard' ? !!pending : !!picked
```

to:

```typescript
  const hasSource = tab === 'clipboard' ? !!pending : !!picked
  const valid = hasSource && name.trim().length > 0
```

- [ ] **Step 2: Verify the build type-checks**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Manual smoke (documented, run during Task 7)**

When the app runs (Task 7), in 新建材料: with a file selected but the name cleared, 创建 is disabled; entering a name that already exists in the folder shows `该文件夹下已存在同名材料`; entering `a/b` shows the illegal-character message.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/NewMaterialDialog.tsx
git commit -m "feat(materials): require a material name in the new-material dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all test files pass (the rewritten importer tests, new move/folders/material-path tests, and all pre-existing suites).

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors. (If `basename`/`ImportResult`/other imports are reported unused, remove them.)

- [ ] **Step 4: Manual app verification**

Run: `npm run dev`. In a ticket detail view:
1. 新建材料 → 选择文件 → name `破损正面` in folder 根目录 → 创建. Confirm the file appears and on disk lives at `{dataRoot}/{ticket}/破损正面.jpg` (use 在文件夹中显示 / reveal-in-finder).
2. Add a video the same way into a subfolder → confirm it lands in the same folder dir as images (no `videos/`).
3. Try the same name twice in one folder → error. Same name in two folders → allowed.
4. Move a material to another folder (the folder dropdown) → confirm the file moves on disk.
5. Rename a folder → confirm files relocate under the new folder dir.

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore(materials): cleanup after material-filename feature

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(Skip if there is nothing to commit.)

---

## Self-Review

**Spec coverage:**
- Filename = material name + unchanged ext → Task 3 (create), Task 4 (move keeps name), Task 5 (rename keeps name).
- All materials in one directory, no videos/photos split → Task 3 (`materialDir`, removed `images|videos`).
- Name unique per folder → Task 2 (`nameTaken`), enforced in Task 3 (create) and Task 4 (move).
- Physical = logical, full sync (move + folder rename/remove) → Tasks 4 and 5.
- Reject illegal chars / empty name → Task 1 (`assertValidMaterialName`), surfaced in Task 6.
- Legacy materials only relocated when touched, basename fallback → Task 4 (`moveToFolder`) and Task 5 (`rename`).
- Remove test-only `importFiles` → Task 3.
- Renderer name-required → Task 6.

**Placeholder scan:** No TBD/TODO; every code step shows full code.

**Type consistency:** `safeSeg`, `assertValidMaterialName`, `materialRelPath` (Task 1) are consumed with matching signatures in Tasks 3/4/5. `nameTaken(aftersaleNo, folder, name, exceptId?)` and `moveFile(id, relPath, folder)` (Task 2) used consistently in Tasks 3/4. `FolderRepo.rename` new return type `MovedFile[]` consumed by the `folders:rename` IPC handler in Task 5. `materialDir(dataRoot, no, folder)` defined in Task 1, used in Tasks 3/4/5.
