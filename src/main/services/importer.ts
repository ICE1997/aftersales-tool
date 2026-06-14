import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import type { MaterialKind, ImportResult } from '../../shared/types'
import type { MaterialRepo } from '../db/materials'
import type { Thumbnailer } from './thumbnails'

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

  async importFiles(aftersaleNo: string, files: string[]): Promise<ImportResult> {
    const result: ImportResult = { imported: [], skipped: [] }
    for (const file of files) {
      try {
        const kind = this.kindOf(file)
        if (!kind) { result.skipped.push({ file, reason: 'unsupported file type' }); continue }
        if (!existsSync(file)) { result.skipped.push({ file, reason: 'file not found' }); continue }

        const subDir = kind === 'image' ? 'images' : 'videos'
        const destDir = join(this.dataRoot, aftersaleNo, subDir)
        mkdirSync(destDir, { recursive: true })
        const dest = this.uniqueDest(destDir, basename(file))
        copyFileSync(file, dest)

        const relPath = dest.slice(this.dataRoot.length + 1).split('\\').join('/')
        const thumbPath = kind === 'image' ? await this.thumb.forImage(dest) : await this.thumb.forVideo(dest)
        const id = this.materials.add({
          aftersaleNo, relPath, kind,
          capturedAt: null,
          importedAt: this.now(),
          sizeBytes: statSync(dest).size,
          thumbPath
        })
        result.imported.push(...this.materials.getByIds([id]))
      } catch (e) {
        result.skipped.push({ file, reason: (e as Error).message })
      }
    }
    return result
  }
}
