import { copyFileSync, mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs'
import { join, basename, extname, relative } from 'node:path'
import type { Material, MaterialKind, ImportResult } from '../../shared/types'
import type { MaterialRepo } from '../db/materials'
import type { Thumbnailer } from './thumbnails'
import { safeDir } from './paths'

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

  private uniqueDest(dir: string, name: string): string {
    const ext = extname(name)
    const stem = basename(name, ext)
    let candidate = join(dir, name)
    let i = 1
    while (existsSync(candidate)) {
      candidate = join(dir, `${stem}-${i}${ext}`)
      i++
    }
    return candidate
  }

  private destDirFor(aftersaleNo: string, kind: MaterialKind): string {
    const dir = join(this.dataRoot, safeDir(aftersaleNo), kind === 'image' ? 'images' : 'videos')
    mkdirSync(dir, { recursive: true })
    return dir
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

  /** Copy one file into the ticket folder and record it. Throws on unsupported/missing. */
  async addFile(aftersaleNo: string, srcPath: string, name: string, folder = ''): Promise<Material> {
    const kind = this.kindOf(srcPath)
    if (!kind) throw new Error('unsupported file type')
    if (!existsSync(srcPath)) throw new Error('file not found')
    const dest = this.uniqueDest(this.destDirFor(aftersaleNo, kind), basename(srcPath))
    copyFileSync(srcPath, dest)
    return this.record(aftersaleNo, kind, dest, name, folder)
  }

  /** Write file bytes (e.g. a pasted image/file) into the ticket folder and record it. */
  async addBytes(aftersaleNo: string, fileName: string, buffer: Buffer, name: string, folder = ''): Promise<Material> {
    const kind = this.kindOf(fileName)
    if (!kind) throw new Error('unsupported file type')
    if (!buffer || buffer.length === 0) throw new Error('empty file')
    const dest = this.uniqueDest(this.destDirFor(aftersaleNo, kind), fileName)
    writeFileSync(dest, buffer)
    return this.record(aftersaleNo, kind, dest, name, folder)
  }

  /** Batch import (used by older callers/tests). Delegates to addFile, never aborting the batch. */
  async importFiles(aftersaleNo: string, files: string[]): Promise<ImportResult> {
    const result: ImportResult = { imported: [], skipped: [] }
    for (const file of files) {
      try {
        result.imported.push(await this.addFile(aftersaleNo, file, '', ''))
      } catch (e) {
        result.skipped.push({ file, reason: (e as Error).message })
      }
    }
    return result
  }
}
