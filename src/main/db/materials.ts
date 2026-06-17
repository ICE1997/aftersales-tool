import type { Knex } from 'knex'
import type { Material } from '../../shared/types'

const MATERIAL_COLS = {
  id: 'id', aftersaleNo: 'aftersale_no', name: 'name', relPath: 'rel_path', kind: 'kind',
  capturedAt: 'captured_at', importedAt: 'imported_at', sizeBytes: 'size_bytes', thumbPath: 'thumb_path', folder: 'folder'
} as const

export type NewMaterial = Omit<Material, 'id' | 'name' | 'folder'> & { name?: string; folder?: string }

export class MaterialRepo {
  constructor(private db: Knex) {}

  async add(m: NewMaterial): Promise<number> {
    const [id] = await this.db('materials').insert({
      aftersale_no: m.aftersaleNo, name: m.name ?? '', rel_path: m.relPath, kind: m.kind,
      captured_at: m.capturedAt, imported_at: m.importedAt, size_bytes: m.sizeBytes,
      thumb_path: m.thumbPath, folder: m.folder ?? ''
    })
    return Number(id)
  }

  async listByTicket(aftersaleNo: string): Promise<Material[]> {
    return (await this.db('materials').select(MATERIAL_COLS).where('aftersale_no', aftersaleNo).orderBy('imported_at')) as Material[]
  }

  async getByIds(ids: number[]): Promise<Material[]> {
    if (ids.length === 0) return []
    return (await this.db('materials').select(MATERIAL_COLS).whereIn('id', ids)) as Material[]
  }

  async setThumb(id: number, thumbPath: string): Promise<void> {
    await this.db('materials').where('id', id).update({ thumb_path: thumbPath })
  }

  async setFolder(id: number, folder: string): Promise<void> {
    await this.db('materials').where('id', id).update({ folder })
  }

  async remove(id: number): Promise<void> {
    await this.db('materials').where('id', id).del()
  }
}
