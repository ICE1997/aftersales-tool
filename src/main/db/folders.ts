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
