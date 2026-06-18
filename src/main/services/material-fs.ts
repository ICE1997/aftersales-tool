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
