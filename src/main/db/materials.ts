import type { Database } from 'better-sqlite3'
import type { Material } from '../../shared/types'

const ROW = `id, aftersale_no AS aftersaleNo, name, rel_path AS relPath, kind,
  captured_at AS capturedAt, imported_at AS importedAt, size_bytes AS sizeBytes, thumb_path AS thumbPath, folder`

export type NewMaterial = Omit<Material, 'id' | 'name' | 'folder'> & { name?: string; folder?: string }

export class MaterialRepo {
  constructor(private db: Database) {}

  add(m: NewMaterial): number {
    const info = this.db.prepare(
      `INSERT INTO materials (aftersale_no, name, rel_path, kind, captured_at, imported_at, size_bytes, thumb_path, folder)
       VALUES (@aftersaleNo, @name, @relPath, @kind, @capturedAt, @importedAt, @sizeBytes, @thumbPath, @folder)`
    ).run({ ...m, name: m.name ?? '', folder: m.folder ?? '' })
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

  setFolder(id: number, folder: string): void {
    this.db.prepare('UPDATE materials SET folder = ? WHERE id = ?').run(folder, id)
  }

  remove(id: number): void {
    this.db.prepare('DELETE FROM materials WHERE id = ?').run(id)
  }
}
