# 物理目录同步逻辑文件夹 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让物理目录始终镜像逻辑文件夹:新建→建目录、重命名→整目录改名、打开售后单→建根目录。

**Architecture:** 把物理目录镜像抽到可单测的 `src/main/services/material-fs.ts`;IPC handler 调它。重命名改为整目录 `rename`(替换原逐文件 move 循环)。

**Tech Stack:** Electron(main)、Node fs、Vitest。

**ABI 提示:** 跑 vitest 前 `npm run rebuild:node`。

---

## File Structure
- **Create:** `src/main/services/material-fs.ts`、`tests/services/material-fs.test.ts`。
- **Modify:** `src/main/ipc.ts`(接线 + 移除逐文件 move 循环 + 清理 unused import)。

---

## Task 1: `material-fs.ts` + 单测

**Files:** Create `src/main/services/material-fs.ts`, `tests/services/material-fs.test.ts`

- [ ] **Step 1: 写失败测试** — `tests/services/material-fs.test.ts`
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureFolderDir, ensureRootDir, renameFolderDir } from '../../src/main/services/material-fs'
import { materialDir } from '../../src/main/services/paths'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'vh-mfs-')) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('material-fs', () => {
  it('ensureFolderDir creates the folder dir incl. ancestors + root; idempotent', () => {
    ensureFolderDir(root, 'AS1', 'a/b')
    expect(existsSync(materialDir(root, 'AS1', 'a/b'))).toBe(true)
    expect(existsSync(materialDir(root, 'AS1', 'a'))).toBe(true)
    expect(existsSync(materialDir(root, 'AS1', ''))).toBe(true)
    ensureFolderDir(root, 'AS1', 'a/b') // no throw on existing
    expect(existsSync(materialDir(root, 'AS1', 'a/b'))).toBe(true)
  })

  it('ensureRootDir creates the ticket root; idempotent', () => {
    ensureRootDir(root, 'AS2')
    expect(existsSync(materialDir(root, 'AS2', ''))).toBe(true)
    ensureRootDir(root, 'AS2')
    expect(existsSync(materialDir(root, 'AS2', ''))).toBe(true)
  })

  it('renameFolderDir moves files + empty subdirs; old gone, new present', () => {
    ensureFolderDir(root, 'AS3', 'old')
    ensureFolderDir(root, 'AS3', 'old/empty')
    writeFileSync(join(materialDir(root, 'AS3', 'old'), 'f.jpg'), 'x')
    renameFolderDir(root, 'AS3', 'old', 'new')
    expect(existsSync(materialDir(root, 'AS3', 'old'))).toBe(false)
    expect(existsSync(materialDir(root, 'AS3', 'new'))).toBe(true)
    expect(existsSync(join(materialDir(root, 'AS3', 'new'), 'f.jpg'))).toBe(true)
    expect(existsSync(materialDir(root, 'AS3', 'new/empty'))).toBe(true)
  })

  it('renameFolderDir falls back to ensure when the old dir is absent', () => {
    renameFolderDir(root, 'AS4', 'old', 'new')
    expect(existsSync(materialDir(root, 'AS4', 'new'))).toBe(true)
  })

  it('renameFolderDir is a no-op when oldPath === newPath', () => {
    ensureFolderDir(root, 'AS5', 'x')
    renameFolderDir(root, 'AS5', 'x', 'x')
    expect(existsSync(materialDir(root, 'AS5', 'x'))).toBe(true)
  })
})
```
Run: `npm run rebuild:node && npx vitest run tests/services/material-fs.test.ts` → FAIL (module missing).

- [ ] **Step 2: 实现** — `src/main/services/material-fs.ts`
```ts
import { mkdirSync, existsSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { materialDir } from './paths'

/** mkdir -p the physical dir for a logical folder (creates ancestors + ticket root). */
export function ensureFolderDir(dataRoot: string, aftersaleNo: string, path: string): void {
  mkdirSync(materialDir(dataRoot, aftersaleNo, path), { recursive: true })
}

/** mkdir -p the ticket's root material dir (dataRoot/<safeSeg(no)>). */
export function ensureRootDir(dataRoot: string, aftersaleNo: string): void {
  mkdirSync(materialDir(dataRoot, aftersaleNo, ''), { recursive: true })
}

/** Move a folder's physical dir (files + empty subdirs) from oldPath to newPath. */
export function renameFolderDir(dataRoot: string, aftersaleNo: string, oldPath: string, newPath: string): void {
  const oldDir = materialDir(dataRoot, aftersaleNo, oldPath)
  const newDir = materialDir(dataRoot, aftersaleNo, newPath)
  if (oldDir === newDir) return
  if (existsSync(oldDir)) {
    mkdirSync(dirname(newDir), { recursive: true })
    try { renameSync(oldDir, newDir) } catch { /* cross-device / perm: leave physical as-is (DB already updated) */ }
  } else {
    ensureFolderDir(dataRoot, aftersaleNo, newPath)
  }
}
```

- [ ] **Step 3: 跑测试** — `npx vitest run tests/services/material-fs.test.ts` → 5/5 PASS。

- [ ] **Step 4: Commit**
```bash
git add src/main/services/material-fs.ts tests/services/material-fs.test.ts
git commit -m "feat(materials): material-fs helpers to mirror logical folders to disk"
```

---

## Task 2: 接线 ipc.ts + 移除逐文件 move 循环

**Files:** Modify `src/main/ipc.ts`

- [ ] **Step 1: imports**
1. 顶部新增:
```ts
import { ensureFolderDir, ensureRootDir, renameFolderDir } from './services/material-fs'
import { joinPath, parentPath, normalizeSegment } from '../shared/folder-path'
```
2. 移除现已不用的 import(逐文件 move 循环删掉后,`renameSync`、`dirname` 仅在该循环用过):
   - `import { join, basename, extname, dirname } from 'node:path'` → `import { join, basename, extname } from 'node:path'`
   - `import { mkdirSync, existsSync, cpSync, rmSync, unlinkSync, renameSync, rmdirSync } from 'node:fs'` → 去掉 `renameSync`:`import { mkdirSync, existsSync, cpSync, rmSync, unlinkSync, rmdirSync } from 'node:fs'`

- [ ] **Step 2: `materials:list` 确保根目录** — 把
```ts
  ipcMain.handle('materials:list', (_e, no: string) => materials.listByTicket(no))
```
改为
```ts
  ipcMain.handle('materials:list', (_e, no: string) => { ensureRootDir(dataRoot, no); return materials.listByTicket(no) })
```

- [ ] **Step 3: `folders:create` 建目录** — 把
```ts
  ipcMain.handle('folders:create', (_e, no: string, path: string) => folderRepo.create(no, path))
```
改为
```ts
  ipcMain.handle('folders:create', async (_e, no: string, path: string) => {
    await folderRepo.create(no, path)
    ensureFolderDir(dataRoot, no, path)
  })
```

- [ ] **Step 4: `folders:rename` 改为整目录改名** — 把现有 handler(含逐文件 move 循环):
```ts
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
整体替换为:
```ts
  ipcMain.handle('folders:rename', async (_e, no: string, path: string, newName: string) => {
    await folderRepo.rename(no, path, newName) // updates DB folder/rel_path; throws on clash
    const newPath = joinPath(parentPath(path), normalizeSegment(newName))
    renameFolderDir(dataRoot, no, path, newPath)
  })
```
> `folderRepo.rename` 内部用相同的 `joinPath/parentPath/normalizeSegment` 算 newPath 并据此更新 DB,这里复算结果一致;若 newName 非法或同名冲突,`folderRepo.rename` 会先 throw,不会走到 `renameFolderDir`。

- [ ] **Step 5: 验证**
Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` → 0。
Run: `npm run lint` → PASS(确认无 unused `renameSync`/`dirname`)。
Run: `npm run build` → success。
Run: `npm run rebuild:node && npx vitest run` → 0 failures(汇报数量)。

- [ ] **Step 6: Commit**
```bash
git add src/main/ipc.ts
git commit -m "feat(materials): mirror folder create/rename + ensure root dir on open"
```

---

## 手验清单(dev)
`npm run rebuild:electron && npm run dev`:
- 新建空文件夹 → 数据目录里出现该目录(`~/Documents/aftersales-tool-data/<单号>/<文件夹>`)。
- 重命名文件夹(含空文件夹)→ 磁盘目录跟着改名、旧目录消失、里面文件还在。
- 打开一个无材料的售后单 → 出现其根目录 `<单号>/`。
- 删除文件夹 → 磁盘目录消失。
- 导入/移动/导出材料 → 行为不变。
- 验证后 `npm run rebuild:node` 还原 ABI。

---

## Self-Review(已核对 spec)
- **§2.1 material-fs.ts(ensureFolderDir/ensureRootDir/renameFolderDir;整目录改名 + 旧无新有 + 不存在则 ensure + oldPath===newPath 早返回)**:Task 1。✓
- **§2.2 接线(folders:create 建目录、folders:rename 整目录改名并移除逐文件循环、materials:list 建根、folders:remove/materials:move 不变)**:Task 2。✓
- **newPath 在 handler 复算(parentPath/joinPath/normalizeSegment)**:Task 2 Step 4。✓
- **清理 unused import(renameSync/dirname)**:Task 2 Step 1。✓
- **§5 测试(临时目录验证三函数)**:Task 1 Step 1。✓
- **A=2 不做全量补建 / B=1 打开时建根**:不加扫描;materials:list 建根。✓
- **占位符扫描**:无 TBD;每步完整代码。✓
- **类型一致**:`ensureFolderDir(dataRoot,no,path)`/`ensureRootDir(dataRoot,no)`/`renameFolderDir(dataRoot,no,oldPath,newPath)` 全程一致;ipc 调用匹配。✓
