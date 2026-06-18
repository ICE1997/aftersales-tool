import type { Knex } from 'knex'
import { ancestorsAndSelf, isUnderOrEqual, joinPath, parentPath, rewritePrefix, normalizeSegment, folderName } from '../../shared/folder-path'
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

  /** Rename a folder in place (keep its parent, change its leaf name). */
  async rename(aftersaleNo: string, path: string, newName: string): Promise<MovedFile[]> {
    const newPath = joinPath(parentPath(path), normalizeSegment(newName))
    if (newPath === path) return []
    await this.assertNoClash(aftersaleNo, newPath)
    return this.reprefixPaths(aftersaleNo, path, newPath)
  }

  /** Move a folder under a new parent ('' = root), keeping its own name. */
  async move(aftersaleNo: string, path: string, newParent: string): Promise<MovedFile[]> {
    if (isUnderOrEqual(newParent, path)) throw new Error('不能把文件夹移动到它自己或其子文件夹里')
    const newPath = joinPath(newParent, folderName(path))
    if (newPath === path) return []
    await this.assertNoClash(aftersaleNo, newPath)
    return this.reprefixPaths(aftersaleNo, path, newPath)
  }

  private async assertNoClash(aftersaleNo: string, newPath: string): Promise<void> {
    const clash = await this.db('material_folders').where({ aftersale_no: aftersaleNo, path: newPath }).first()
    if (clash) throw new Error('同级已存在同名文件夹')
  }

  /** Re-prefix a folder subtree from `fromPath` to `toPath`, cascading to descendant
   *  folders and the materials inside them. Returns the on-disk file moves needed. */
  private async reprefixPaths(aftersaleNo: string, fromPath: string, toPath: string): Promise<MovedFile[]> {
    const moves: MovedFile[] = []
    await this.db.transaction(async (trx) => {
      const fs = (await trx('material_folders').select('id', 'path').where('aftersale_no', aftersaleNo)) as { id: number; path: string }[]
      for (const f of fs) if (isUnderOrEqual(f.path, fromPath)) await trx('material_folders').where('id', f.id).update({ path: rewritePrefix(f.path, fromPath, toPath) })
      const ms = (await trx('materials').select('id', 'name', { relPath: 'rel_path' }, 'folder').where('aftersale_no', aftersaleNo)) as { id: number; name: string; relPath: string; folder: string }[]
      const seenRels = new Set<string>()
      for (const m of ms) {
        if (!isUnderOrEqual(m.folder, fromPath)) continue
        const newFolder = rewritePrefix(m.folder, fromPath, toPath)
        const ext = extname(m.relPath)
        const stem = m.name || basename(m.relPath, ext)
        const newRel = materialRelPath(aftersaleNo, newFolder, stem, ext)
        if (seenRels.has(newRel)) throw new Error('移动后会产生重名材料，请先调整冲突的材料名称')
        seenRels.add(newRel)
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
