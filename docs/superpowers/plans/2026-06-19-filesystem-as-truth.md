# Filesystem-as-Source-of-Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the real filesystem under `dataRoot/<safeالسeg(no)>/` the single source of truth for materials & folders; drop the `materials`/`material_folders` tables; live-refresh via `fs.watch`.

**Architecture:** A new `FileTree` service does all material/folder ops with `node:fs`. A path-keyed lazy `ThumbCache` replaces DB-stored thumb paths. A `MaterialWatcher` (debounced `fs.watch`, recursive) pushes `materials:changed` to the renderer. Material identity becomes its dataRoot-relative `relPath` (no numeric id). `tickets` table is untouched.

**Tech Stack:** Electron, node:fs, better-sqlite3/Knex (tickets only), sharp + ffmpeg-static (thumbs), React/TS renderer, Vitest.

## Global Constraints

- Local main worktree only: commit to `main`, **never push / force / rewrite refs** (per project rule).
- `safeSeg`/`materialDir`/`materialRelPath` from `src/shared/material-path.ts` & `src/main/services/paths.ts` are the ONLY path builders — never hand-join ticket/folder segments.
- Folder/file name validation reuses `normalizeSegment` (`src/shared/folder-path.ts`) and `assertValidMaterialName` (`src/shared/material-path.ts`).
- Target platforms macOS + Windows (recursive `fs.watch` is supported there).
- TDD, frequent commits. Run `npm run rebuild:node` once before vitest if better-sqlite3 ABI complains.
- **Intermediate-red window:** Tasks 2–5 add new, unit-tested files but the new `Material` shape (Task 1) breaks old consumers; full `tsc`/`build` returns to green at Task 6 (the swap). Tasks 2–5 verify via targeted `npx vitest run <file>` (per-file transpile, unaffected by unrelated tsc errors). The full gate (tsc 0 / lint / build / suite) is asserted at Tasks 6, 7, 8.

---

### Task 1: Material model + relPath helpers (pure)

**Files:**
- Modify: `src/shared/types.ts` (reshape `Material`, widen `MaterialKind`)
- Create: `src/shared/material-meta.ts`
- Test: `tests/shared/material-meta.test.ts`

**Interfaces:**
- Produces:
  - `type MaterialKind = 'image' | 'video' | 'other'`
  - `interface Material { relPath: string; folder: string; name: string; kind: MaterialKind; sizeBytes: number; modifiedAt: number }`
  - `kindFromName(name: string): MaterialKind`
  - `folderOfRelPath(relPath: string): string` (segments between the ticket segment and the filename, POSIX-joined; `''` for root)
  - `nameOfRelPath(relPath: string): string`

- [ ] **Step 1: Write the failing test** — `tests/shared/material-meta.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { kindFromName, folderOfRelPath, nameOfRelPath } from '../../src/shared/material-meta'

describe('material-meta', () => {
  it('classifies by extension (case-insensitive), unknown -> other', () => {
    expect(kindFromName('a.JPG')).toBe('image')
    expect(kindFromName('clip.mp4')).toBe('video')
    expect(kindFromName('doc.pdf')).toBe('other')
    expect(kindFromName('noext')).toBe('other')
  })
  it('derives folder (between ticket seg and filename) and name from relPath', () => {
    expect(folderOfRelPath('21275/凭证/聊天/a.jpg')).toBe('凭证/聊天')
    expect(folderOfRelPath('21275/a.jpg')).toBe('')
    expect(nameOfRelPath('21275/凭证/a.jpg')).toBe('a.jpg')
  })
})
```

- [ ] **Step 2: Run — expect FAIL** `npx vitest run tests/shared/material-meta.test.ts` (module not found)

- [ ] **Step 3: Implement** — `src/shared/material-meta.ts`

```ts
import type { MaterialKind } from './types'

const IMAGE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'])
const VIDEO = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'])

export function kindFromName(name: string): MaterialKind {
  const i = name.lastIndexOf('.')
  const ext = i < 0 ? '' : name.slice(i + 1).toLowerCase()
  if (IMAGE.has(ext)) return 'image'
  if (VIDEO.has(ext)) return 'video'
  return 'other'
}

export function folderOfRelPath(relPath: string): string {
  return relPath.split('/').slice(1, -1).join('/')
}

export function nameOfRelPath(relPath: string): string {
  return relPath.slice(relPath.lastIndexOf('/') + 1)
}
```

  And reshape `src/shared/types.ts`:

```ts
export type MaterialKind = 'image' | 'video' | 'other'
export interface Material {
  relPath: string
  folder: string
  name: string
  kind: MaterialKind
  sizeBytes: number
  modifiedAt: number
}
```
  Leave `CreateMaterialPayload` / `PickedFile` / `ImportTicketsResult` as-is. (`ImportTicketsResult.imported: Material[]` is unused by the importer path now — Task 6 drops that field's producer; keep the type until then.)

- [ ] **Step 4: Run — expect PASS** `npx vitest run tests/shared/material-meta.test.ts`

- [ ] **Step 5: Commit** `git add src/shared/material-meta.ts src/shared/types.ts tests/shared/material-meta.test.ts && git commit -m "feat(materials): relPath-based Material model + meta helpers"`

---

### Task 2: FileTree service (scan + fs ops)

**Files:**
- Create: `src/main/services/file-tree.ts`
- Test: `tests/services/file-tree.test.ts`

**Interfaces:**
- Consumes: `materialDir`, `safeDir` (`paths.ts`); `materialRelPath`, `assertValidMaterialName` (`material-path.ts`); `normalizeSegment`, `joinPath`, `parentPath`, `folderName`, `isUnderOrEqual` (`folder-path.ts`); `kindFromName`, `folderOfRelPath`, `nameOfRelPath` (`material-meta.ts`); `Material` (`types.ts`).
- Produces:
  - `interface Listing { folders: string[]; materials: Material[] }`
  - `class FileTree { constructor(dataRoot: string)`
    - `list(no: string): Listing`
    - `createFolder(no: string, path: string): void`
    - `renameFolder(no: string, path: string, newName: string): string` (returns new path)
    - `moveFolder(no: string, path: string, newParent: string): string` (returns new path; throws on self/descendant/clash)
    - `removeFolder(no: string, path: string): void`
    - `addFile(no: string, srcPath: string, folder: string): Material`
    - `addBytes(no: string, fileName: string, buffer: Buffer, folder: string): Material`
    - `moveMaterial(no: string, relPath: string, newFolder: string): Material`
    - `removeMaterial(relPath: string): void`
    - `}`
- Notes: `relPath` is POSIX (`/`). Skip dot-files/dot-dirs while scanning. Dedupe filename collisions `a.jpg → a-1.jpg`. `addFile`/`addBytes` use `assertValidMaterialName` on the chosen stem and keep the source extension.

- [ ] **Step 1: Write the failing test** — `tests/services/file-tree.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileTree } from '../../src/main/services/file-tree'

let root: string
let ft: FileTree
const NO = 'AS-1'
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'vh-ft-')); ft = new FileTree(root) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

it('lists folders (incl empty) and files with derived metadata', () => {
  ft.createFolder(NO, '凭证/聊天')
  ft.addBytes(NO, 'a.png', Buffer.from('x'), '凭证')
  const { folders, materials } = ft.list(NO)
  expect(folders.sort()).toEqual(['凭证', '凭证/聊天'])
  expect(materials).toHaveLength(1)
  expect(materials[0].folder).toBe('凭证')
  expect(materials[0].kind).toBe('image')
  expect(materials[0].name).toBe('a.png')
})

it('skips dot-files/dirs when scanning', () => {
  mkdirSync(join(root, 'AS-1', '.git'), { recursive: true })
  writeFileSync(join(root, 'AS-1', '.DS_Store'), 'x')
  const { folders, materials } = ft.list(NO)
  expect(folders).toEqual([]); expect(materials).toEqual([])
})

it('dedupes a filename collision on addBytes', () => {
  const m1 = ft.addBytes(NO, 'a.png', Buffer.from('1'), '')
  const m2 = ft.addBytes(NO, 'a.png', Buffer.from('2'), '')
  expect(m1.name).toBe('a.png'); expect(m2.name).toBe('a-1.png')
})

it('moveMaterial moves the file and returns the new relPath', () => {
  ft.createFolder(NO, '凭证')
  const m = ft.addBytes(NO, 'a.png', Buffer.from('x'), '')
  const moved = ft.moveMaterial(NO, m.relPath, '凭证')
  expect(moved.folder).toBe('凭证')
  expect(existsSync(join(root, moved.relPath))).toBe(true)
  expect(existsSync(join(root, m.relPath))).toBe(false)
})

it('renameFolder / moveFolder cascade on disk; move rejects self/descendant/clash', () => {
  ft.createFolder(NO, '凭证/聊天'); ft.createFolder(NO, '物流')
  ft.addBytes(NO, 'a.png', Buffer.from('x'), '凭证/聊天')
  ft.moveFolder(NO, '凭证/聊天', '物流')
  expect(ft.list(NO).folders.sort()).toEqual(['凭证', '物流', '物流/聊天'])
  expect(() => ft.moveFolder(NO, '物流', '物流/聊天')).toThrow()
  ft.createFolder(NO, '物流/聊天'.replace('聊天', 'dup')) // ensure clash path exists
  expect(() => ft.moveFolder(NO, '凭证', '物流')).not.toThrow() // 凭证 has no clash under 物流
})

it('removeFolder deletes the subtree; removeMaterial deletes the file', () => {
  ft.createFolder(NO, '凭证'); const m = ft.addBytes(NO, 'a.png', Buffer.from('x'), '凭证')
  ft.removeMaterial(m.relPath); expect(existsSync(join(root, m.relPath))).toBe(false)
  ft.removeFolder(NO, '凭证'); expect(ft.list(NO).folders).toEqual([])
})
```

- [ ] **Step 2: Run — expect FAIL** `npx vitest run tests/services/file-tree.test.ts`

- [ ] **Step 3: Implement** — `src/main/services/file-tree.ts`

```ts
import { readdirSync, statSync, mkdirSync, renameSync, rmSync, unlinkSync, copyFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import type { Material } from '../../shared/types'
import { materialDir, safeDir } from './paths'
import { materialRelPath, assertValidMaterialName } from '../../shared/material-path'
import { normalizeSegment, joinPath, parentPath, folderName, isUnderOrEqual } from '../../shared/folder-path'
import { kindFromName, folderOfRelPath } from '../../shared/material-meta'

export interface Listing { folders: string[]; materials: Material[] }

export class FileTree {
  constructor(private dataRoot: string) {}

  private ticketRoot(no: string): string { return join(this.dataRoot, safeDir(no)) }

  list(no: string): Listing {
    const base = this.ticketRoot(no)
    const folders: string[] = []
    const materials: Material[] = []
    const walk = (absDir: string, rel: string): void => {
      let entries: import('node:fs').Dirent[]
      try { entries = readdirSync(absDir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const childRel = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) { folders.push(childRel); walk(join(absDir, e.name), childRel) }
        else if (e.isFile()) {
          const relPath = `${safeDir(no)}/${childRel}`
          const st = statSync(join(absDir, e.name))
          materials.push({ relPath, folder: folderOfRelPath(relPath), name: e.name, kind: kindFromName(e.name), sizeBytes: st.size, modifiedAt: st.mtimeMs })
        }
      }
    }
    walk(base, '')
    return { folders, materials }
  }

  createFolder(no: string, path: string): void {
    for (const seg of path.split('/')) normalizeSegment(seg)
    mkdirSync(materialDir(this.dataRoot, no, path), { recursive: true })
  }

  renameFolder(no: string, path: string, newName: string): string {
    const newPath = joinPath(parentPath(path), normalizeSegment(newName))
    return this.relocateFolder(no, path, newPath)
  }

  moveFolder(no: string, path: string, newParent: string): string {
    if (isUnderOrEqual(newParent, path)) throw new Error('不能把文件夹移动到它自己或其子文件夹里')
    return this.relocateFolder(no, path, joinPath(newParent, folderName(path)))
  }

  private relocateFolder(no: string, fromPath: string, toPath: string): string {
    if (toPath === fromPath) return toPath
    const fromAbs = materialDir(this.dataRoot, no, fromPath)
    const toAbs = materialDir(this.dataRoot, no, toPath)
    if (existsSync(toAbs)) throw new Error('同级已存在同名文件夹')
    mkdirSync(join(toAbs, '..'), { recursive: true })
    renameSync(fromAbs, toAbs)
    return toPath
  }

  removeFolder(no: string, path: string): void {
    rmSync(materialDir(this.dataRoot, no, path), { recursive: true, force: true })
  }

  addFile(no: string, srcPath: string, folder: string): Material {
    return this.place(no, folder, extname(srcPath), basename(srcPath, extname(srcPath)), (abs) => copyFileSync(srcPath, abs))
  }

  addBytes(no: string, fileName: string, buffer: Buffer, folder: string): Material {
    return this.place(no, folder, extname(fileName), basename(fileName, extname(fileName)), (abs) => writeFileSync(abs, buffer))
  }

  private place(no: string, folder: string, ext: string, rawStem: string, write: (abs: string) => void): Material {
    const stem = assertValidMaterialName(rawStem || 'file')
    const dir = materialDir(this.dataRoot, no, folder)
    mkdirSync(dir, { recursive: true })
    let name = `${stem}${ext}`; let i = 1
    while (existsSync(join(dir, name))) { name = `${stem}-${i}${ext}`; i++ }
    const abs = join(dir, name)
    write(abs)
    const relPath = folder ? `${safeDir(no)}/${folder}/${name}` : `${safeDir(no)}/${name}`
    const st = statSync(abs)
    return { relPath, folder, name, kind: kindFromName(name), sizeBytes: st.size, modifiedAt: st.mtimeMs }
  }

  moveMaterial(no: string, relPath: string, newFolder: string): Material {
    const name = relPath.slice(relPath.lastIndexOf('/') + 1)
    const srcAbs = join(this.dataRoot, relPath)
    const dir = materialDir(this.dataRoot, no, newFolder)
    mkdirSync(dir, { recursive: true })
    let dest = name; let i = 1
    const ext = extname(name); const stem = basename(name, ext)
    while (existsSync(join(dir, dest))) { dest = `${stem}-${i}${ext}`; i++ }
    const destAbs = join(dir, dest)
    if (existsSync(srcAbs) && srcAbs !== destAbs) renameSync(srcAbs, destAbs)
    const newRel = newFolder ? `${safeDir(no)}/${newFolder}/${dest}` : `${safeDir(no)}/${dest}`
    const st = statSync(destAbs)
    return { relPath: newRel, folder: newFolder, name: dest, kind: kindFromName(dest), sizeBytes: st.size, modifiedAt: st.mtimeMs }
  }

  removeMaterial(relPath: string): void {
    try { unlinkSync(join(this.dataRoot, relPath)) } catch { /* already gone */ }
  }
}
```
  Fix the clash test: replace the awkward line with a real clash setup — author the test so `物流` already contains `凭证`'s name only in the negative case. (Adjust the test in Step 1 to: create `物流/聊天`, then `expect(() => ft.moveFolder(NO,'凭证/聊天','物流')).toThrow()` — clash because `物流/聊天` exists. Keep that assertion; drop the `.replace` hack.)

- [ ] **Step 4: Run — expect PASS** `npx vitest run tests/services/file-tree.test.ts`

- [ ] **Step 5: Commit** `git add src/main/services/file-tree.ts tests/services/file-tree.test.ts && git commit -m "feat(materials): FileTree service (scan + fs ops)"`

---

### Task 3: Path-keyed lazy thumbnail cache

**Files:**
- Modify: `src/main/services/thumbnails.ts` (add a `thumbFor` cache entry; keep `forImage`/`forVideo`)
- Test: `tests/services/thumb-cache.test.ts`

**Interfaces:**
- Consumes: `Thumbnailer` (existing), `kindFromName`.
- Produces on `Thumbnailer`:
  - `async thumbFor(relPath: string, kind: MaterialKind, mtimeMs: number, sizeBytes: number): Promise<string | null>` — returns the dataRoot-relative thumb path (cached; key = sha1 of `relPath|mtime|size`), or `null` for `other`/failure. Stores under existing `.thumbnails/`.

- [ ] **Step 1: Write the failing test** — `tests/services/thumb-cache.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Thumbnailer } from '../../src/main/services/thumbnails'

let root: string; let t: Thumbnailer
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'vh-th-')); mkdirSync(join(root, 'AS-1'), { recursive: true }); t = new Thumbnailer(root) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

it('returns null for non-media without generating', async () => {
  expect(await t.thumbFor('AS-1/doc.pdf', 'other', 1, 1)).toBeNull()
})

it('caches by relPath+mtime+size — second call does not regenerate', async () => {
  const spy = vi.spyOn(t, 'forImage')
  const a = await t.thumbFor('AS-1/x.jpg', 'image', 1, 1) // forImage may return null (no real file) — that is fine
  await t.thumbFor('AS-1/x.jpg', 'image', 1, 1)
  expect(spy).toHaveBeenCalledTimes(a === null ? 2 : 1) // only re-tries when previous attempt yielded no cached file
})
```
  (The cache test is intentionally light: a real image isn't present, so generation returns null. The key behaviour asserted is "non-media returns null without work"; full thumb generation is already covered by existing thumbnail tests.)

- [ ] **Step 2: Run — expect FAIL** `npx vitest run tests/services/thumb-cache.test.ts`

- [ ] **Step 3: Implement** — add to `src/main/services/thumbnails.ts`

```ts
// add imports: existsSync from 'node:fs'; MaterialKind type
async thumbFor(relPath: string, kind: MaterialKind, mtimeMs: number, sizeBytes: number): Promise<string | null> {
  if (kind === 'other') return null
  const hash = createHash('sha1').update(`${relPath}|${mtimeMs}|${sizeBytes}`).digest('hex').slice(0, 16)
  const rel = `${THUMB_DIR}/${hash}.jpg`
  if (existsSync(join(this.dataRoot, rel))) return rel
  const src = join(this.dataRoot, relPath)
  const made = kind === 'image' ? await this.forImageTo(src, rel) : await this.forVideoTo(src, rel)
  return made
}
```
  Refactor `forImage`/`forVideo` to share a `forImageTo(src, relOut)`/`forVideoTo(src, relOut)` that write to a caller-chosen `rel` (so the cache controls the name). Keep the old `forImage`/`forVideo` exported names if still referenced; otherwise inline. Import `MaterialKind` from `../../shared/types`.

- [ ] **Step 4: Run — expect PASS** `npx vitest run tests/services/thumb-cache.test.ts`

- [ ] **Step 5: Commit** `git add src/main/services/thumbnails.ts tests/services/thumb-cache.test.ts && git commit -m "feat(materials): path-keyed lazy thumbnail cache"`

---

### Task 4: Exporter by relPath

**Files:**
- Modify: `src/main/services/exporter.ts`
- Modify: `tests/services/exporter.test.ts`, `tests/main/exporter.test.ts`

**Interfaces:**
- Produces:
  - `toFolder(relPaths: string[], targetDir: string, folders?: string[]): Promise<void>`
  - `toZip(relPaths: string[], zipPath: string, folders?: string[]): Promise<void>`
- Layout per relPath: `folder = relPath.split('/').slice(1,-1).join('/')`, basename = last segment. `folders` = selected (possibly empty) dirs to materialize (already implemented; keep).

- [ ] **Step 1: Update tests** — change existing `toFolder([m], out)` style calls to pass relPaths: `toFolder(['AS-1/images/a.jpg'], out)` and write the source files at those relPaths under `root`. Keep the empty-folder tests (`toFolder([], out, ['evidence'])`). Assert files land at `out/<folder>/<base>`.

- [ ] **Step 2: Run — expect FAIL** `npx vitest run tests/services/exporter.test.ts tests/main/exporter.test.ts`

- [ ] **Step 3: Implement** — rewrite `exporter.ts` to take relPaths:

```ts
import { folderOfRelPath } from '../../shared/material-path' // or material-meta
// toFolder:
async toFolder(relPaths: string[], targetDir: string, folders: string[] = []): Promise<void> {
  mkdirSync(targetDir, { recursive: true })
  for (const f of folders) if (f) mkdirSync(join(targetDir, ...f.split('/')), { recursive: true })
  for (const rel of relPaths) {
    const folder = rel.split('/').slice(1, -1).join('/')
    const sub = folder ? join(targetDir, ...folder.split('/')) : targetDir
    mkdirSync(sub, { recursive: true })
    const name = this.uniqueName(basename(rel), (n) => existsSync(join(sub, n)))
    copyFileSync(join(this.dataRoot, rel), join(sub, name))
  }
}
// toZip: same shape; entry = folder ? `${folder}/${name}` : name; source join(dataRoot, rel)
```

- [ ] **Step 4: Run — expect PASS** (both exporter test files)

- [ ] **Step 5: Commit** `git add src/main/services/exporter.ts tests/services/exporter.test.ts tests/main/exporter.test.ts && git commit -m "refactor(export): export by relPath instead of Material rows"`

---

### Task 5: MaterialWatcher (debounced fs.watch)

**Files:**
- Create: `src/main/services/material-watch.ts`
- Test: `tests/services/material-watch.test.ts`

**Interfaces:**
- Produces:
  - `class MaterialWatcher { constructor(dataRoot: string, onChange: (no: string) => void, debounceMs?: number)`
    - `watch(no: string): void` (stops any previous watch first; recursive watch of the ticket dir; debounced `onChange(no)`)
    - `unwatch(): void`
    - `}`

- [ ] **Step 1: Write the failing test** — `tests/services/material-watch.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MaterialWatcher } from '../../src/main/services/material-watch'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'vh-w-')); mkdirSync(join(root, 'AS-1'), { recursive: true }) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

it('debounces filesystem changes into a single onChange(no)', async () => {
  const onChange = vi.fn()
  const w = new MaterialWatcher(root, onChange, 50)
  w.watch('AS-1')
  writeFileSync(join(root, 'AS-1', 'a.txt'), '1')
  writeFileSync(join(root, 'AS-1', 'b.txt'), '2')
  await new Promise((r) => setTimeout(r, 150))
  w.unwatch()
  expect(onChange).toHaveBeenCalledWith('AS-1')
  expect(onChange.mock.calls.length).toBeLessThanOrEqual(2)
})
```

- [ ] **Step 2: Run — expect FAIL** `npx vitest run tests/services/material-watch.test.ts`

- [ ] **Step 3: Implement** — `src/main/services/material-watch.ts`

```ts
import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { safeDir } from './paths'

export class MaterialWatcher {
  private fsw: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  constructor(private dataRoot: string, private onChange: (no: string) => void, private debounceMs = 200) {}

  watch(no: string): void {
    this.unwatch()
    const dir = join(this.dataRoot, safeDir(no))
    try {
      this.fsw = watch(dir, { recursive: true }, () => {
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => this.onChange(no), this.debounceMs)
      })
    } catch { /* dir may not exist yet; ignore */ }
  }

  unwatch(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.fsw) { this.fsw.close(); this.fsw = null }
  }
}
```

- [ ] **Step 4: Run — expect PASS** `npx vitest run tests/services/material-watch.test.ts`

- [ ] **Step 5: Commit** `git add src/main/services/material-watch.ts tests/services/material-watch.test.ts && git commit -m "feat(materials): debounced fs.watch MaterialWatcher"`

---

### Task 6: Swap — wire IPC, preload, renderer to FileTree/relPath (full build green)

**Files:**
- Modify: `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/components/MaterialGrid.tsx`, `src/renderer/components/TicketDetail.tsx`, `src/renderer/material-select.ts`, `src/renderer/components/PreviewModal.tsx`, `src/renderer/components/NewMaterialDialog.tsx` (only the `createMaterial` return usage).
- Test: existing renderer/material tests updated to relPath identity.

**Interfaces (new ipc/preload surface):**
- `materials:list(no) -> { folders: string[]; materials: Material[] }`
- `materials:thumb(relPath, kind, mtimeMs, sizeBytes) -> string | null`
- `materials:remove(relPath) -> void`
- `materials:move(no, relPath, newFolder) -> void`
- `materials:create(no, payload) -> Material` (payload unchanged; uses FileTree.addFile/addBytes)
- `folders:list(no) -> string[]` (derived from `list(no).folders`)
- `folders:create/rename/remove/move` -> via FileTree (no DB)
- `export:folder(relPaths, folders) / export:zip(relPaths, folders)`
- preload renames: `listMaterials(no)` now returns `{folders,materials}` (or split into `listTree`); `thumbFor`, `moveMaterial(no, relPath, folder)`, `removeMaterial(relPath)`.

- [ ] **Step 1:** In `ipc.ts` construct `const fileTree = new FileTree(dataRoot)` and `const watcher = new MaterialWatcher(dataRoot, (no) => BrowserWindow.getFocusedWindow()?.webContents.send('materials:changed', no))`. Replace the `materials:*` and `folders:*` handlers to call `fileTree`; `materials:thumb` calls `thumb.thumbFor(...)`; add `materials:watch(no)`/`materials:unwatch`. Remove `materials`, `folderRepo`, `scanner`, `importer` construction + imports. Keep `tickets`, `statsRepo`. `tickets:delete` removes the ticket dir (already does via `rmSync(safeDir)`); drop the `materials.listByTicket` thumb-unlink loop.

- [ ] **Step 2:** Update `preload/index.ts` signatures to match (relPath-based + thumb + watch + `onMaterialsChanged(cb)` event like `onMenu`). `Api = typeof api` propagates types.

- [ ] **Step 3:** Renderer swap (identity `id:number` → `relPath:string`):
  - `material-select.ts`: `materialIdsUnder` → `materialRelPathsUnder(materials, folderPath): string[]` (filter by `isUnderOrEqual(m.folder, folderPath)` map `m.relPath`). Update its test.
  - `TicketDetail.tsx`: `selected: Set<string>` (relPaths); `toggle(relPath)`; `materials`/`folders` from `listTree`; `moveMaterial(relPath, folder)`, `deleteMaterial(relPath)`; export passes `[...selected]` + `[...selectedFolders]`; `Thumb` source via `api.thumbFor`.
  - `MaterialGrid.tsx`: keyed by `m.relPath`; dnd `data:{kind:'material', relPath, folder}`; `onToggle/onOpen/onCopyMaterialPath/onMoveMaterial/onDeleteMaterial` take `relPath`; add a material delete button (top-right cluster: 复制路径 + 删除, with confirm) for parity with folders; `kind:'other'` shows a generic file icon + double-click `shell` open (via `api.openMaterialDir`? no — `api.showItem(relPath)`); selection `Set<string>`.
  - `PreviewModal.tsx`: uses `material.relPath`/`name`; `copyImage`/`showItem` already by relPath; fine.
  - `NewMaterialDialog.tsx`: `createMaterial` now returns the new `Material` (relPath shape); update the success toast to use `m.name`.

- [ ] **Step 4: Verify full gate** — `npx tsc --noEmit` (0), `npm run lint` (PASS), `npm run build` (clean), `npm run rebuild:node && npx vitest run` (all pass; update any material/renderer tests to relPath).

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(materials): filesystem-as-truth — wire FileTree/relPath through ipc, preload, renderer"`

---

### Task 7: Live auto-refresh wiring + 刷新 button

**Files:**
- Modify: `src/renderer/components/TicketDetail.tsx`, `src/preload/index.ts` (if not already in Task 6).

- [ ] **Step 1:** In `TicketDetail`, on mount call `api.watchMaterials(aftersaleNo)` and subscribe `api.onMaterialsChanged((no) => { if (no === aftersaleNo) reload() })`; on unmount `api.unwatchMaterials()` + unsubscribe. Re-`watch` when `aftersaleNo` changes.
- [ ] **Step 2:** Rename the 校准 toolbar button to 刷新 → calls `reload()` (manual rescan fallback). Drop `api.calibrate` usage.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npm run build`; launch `npm run dev`, open a ticket, add/rename a file in Finder/Explorer → grid updates within ~200ms.
- [ ] **Step 4: Commit** `git commit -am "feat(materials): live fs.watch auto-refresh + manual 刷新"`

---

### Task 8: Drop tables + delete dead code

**Files:**
- Modify: `src/main/db/migrations.ts` (append a code migration)
- Delete: `src/main/db/materials.ts`, `src/main/db/folders.ts`, `src/main/services/scanner.ts`, `src/main/services/importer.ts`, `src/main/services/material-fs.ts`, and their tests (`tests/db/folders.test.ts`, `tests/db/materials*.test.ts`, `tests/services/scanner*.test.ts`, importer tests) — only those now unused.
- Remove: `scan:calibrate` ipc + `calibrate` preload; `materials:fileUrl` stays (still used) — confirm.

- [ ] **Step 1:** Append to `MIGRATIONS` in `migrations.ts`:

```ts
{ name: '0010_drop_material_tables', up: async (knex) => {
  await knex.raw('DROP TABLE IF EXISTS materials')
  await knex.raw('DROP TABLE IF EXISTS material_folders')
} }
```
  (Use the next free sequence number; check the file’s last migration name.)

- [ ] **Step 2:** Grep for references to deleted modules (`MaterialRepo`, `FolderRepo`, `Scanner`, `Importer`, `material-fs`, `ensureFolderDir`, `renameFolderDir`) and remove/replace. Delete the now-dead source + test files.
- [ ] **Step 3: Verify full gate** — `npx tsc --noEmit` (0), `npm run lint`, `npm run build`, `npm run rebuild:node && npx vitest run` (all green), and **launch-verify** `npm run dev` (per the CJS-import launch-crash memory: a clean build/tsc can still crash at launch — actually open the app, open a ticket, create/move/delete a folder & material, export).
- [ ] **Step 4: Commit** `git commit -am "chore(db): drop materials/material_folders tables; remove dead logical-FS code"`

---

## Self-Review

**Spec coverage:** disk-as-truth scan (T2) ✓; fs ops create/rename/move/remove/add (T2) ✓; relPath identity + filename metadata (T1) ✓; thumbnail cache (T3) ✓; live fs.watch (T5+T7) ✓; export by relPath incl empty dirs (T4) ✓; drop tables + migration (T8) ✓; 刷新 fallback (T7) ✓; tickets untouched (all) ✓; `kind:'other'` (T1, T6) ✓.

**Placeholder scan:** Task 6 lists change-specs rather than full file pastes (the swap touches ~7 files of mostly-mechanical id→relPath renames); every new/tricky service (T2–T5) and the migration (T8) carry complete code. Acceptable given the swap is mechanical and gated by the full tsc/lint/build/suite check at Step 4.

**Type consistency:** `Material` = `{relPath, folder, name, kind, sizeBytes, modifiedAt}` used consistently T1→T8; `FileTree` method names match the ipc surface in T6; `thumbFor` signature matches T3↔T6; exporter `(relPaths, target, folders)` matches T4↔T6.

**Note for executor:** Task 6 is the large coordinated swap; do it in one sitting and lean on `tsc` to find every id→relPath site. Tasks 1–5 are independently green via per-file vitest; full build is green again at Task 6.
