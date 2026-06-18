import type { Knex } from 'knex'
import { ancestorsAndSelf, isUnderOrEqual, joinPath, parentPath, rewritePrefix, normalizeSegment } from '../../shared/folder-path'
import { materialRelPath } from '../../shared/material-path'
import { basename, extname } from 'node:path'

type Now = () => number
export interface AffectedMaterial { relPath: string; thumbPath: string | null }
export interface MovedFile { oldRelPath: string; newRelPath: string }

export class FolderRepo {
  constructor(private db: Knex, private now: Now = () => Date.now()) {}

  async create(aftersaleNo: string, path: string): Promise<void> {
    for (const seg of path.split('/')) normalizeSegment(seg) // throws on empty / '/' / '.' / '..'
    const ts = this.now()
    await this.db.transaction(async (trx) => {
      for (const p of ancestorsAndSelf(path)) {
        await trx('material_folders')
          .insert({ aftersale_no: aftersaleNo, path: p, created_at: ts })
          .onConflict(['aftersale_no', 'path']).ignore()
      }
    })
  }

  async list(aftersaleNo: string): Promise<string[]> {
    return await this.db('material_folders').where('aftersale_no', aftersaleNo).orderBy('path').pluck('path')
  }

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

  async remove(aftersaleNo: string, path: string): Promise<AffectedMaterial[]> {
    let affected: AffectedMaterial[] = []
    await this.db.transaction(async (trx) => {
      const ms = (await trx('materials')
        .select('id', { relPath: 'rel_path' }, { thumbPath: 'thumb_path' }, 'folder')
        .where('aftersale_no', aftersaleNo)) as { id: number; relPath: string; thumbPath: string | null; folder: string }[]
      const inSub = ms.filter((m) => isUnderOrEqual(m.folder, path))
      affected = inSub.map((m) => ({ relPath: m.relPath, thumbPath: m.thumbPath }))
      if (inSub.length) await trx('materials').whereIn('id', inSub.map((m) => m.id)).del()
      const fs = (await trx('material_folders').select('id', 'path').where('aftersale_no', aftersaleNo)) as { id: number; path: string }[]
      const delIds = fs.filter((f) => isUnderOrEqual(f.path, path)).map((f) => f.id)
      if (delIds.length) await trx('material_folders').whereIn('id', delIds).del()
    })
    return affected
  }
}
