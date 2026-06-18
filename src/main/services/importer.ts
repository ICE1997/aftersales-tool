import { copyFileSync, mkdirSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { join, basename, extname, relative } from 'node:path'
import type { Material, MaterialKind } from '../../shared/types'
import type { MaterialRepo } from '../db/materials'
import type { Thumbnailer } from './thumbnails'
import { materialDir } from './paths'
import { materialRelPath, assertValidMaterialName } from '../../shared/material-path'

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
    mkdirSync(materialDir(this.dataRoot, m.aftersaleNo, folder), { recursive: true })
    if (existsSync(srcAbs) && srcAbs !== destAbs) renameSync(srcAbs, destAbs)
    await this.materials.moveFile(id, newRel, folder)
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
