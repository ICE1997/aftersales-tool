import { mkdirSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { FFMPEG } from './ffmpeg-path'
import type { MaterialKind } from '../../shared/types'

const THUMB_DIR = '.thumbnails'
const SIZE = 320

export class Thumbnailer {
  constructor(private dataRoot: string) {
    mkdirSync(join(dataRoot, THUMB_DIR), { recursive: true })
  }

  private outPath(srcName: string): { rel: string; abs: string } {
    const hash = createHash('sha1').update(srcName).digest('hex').slice(0, 8)
    const name = `${basename(srcName, extname(srcName))}-${hash}.jpg`
    const rel = `${THUMB_DIR}/${name}`
    return { rel, abs: join(this.dataRoot, rel) }
  }

  private async forImageTo(absSrc: string, relOut: string): Promise<string | null> {
    const abs = join(this.dataRoot, relOut)
    try {
      await sharp(absSrc).resize(SIZE, SIZE, { fit: 'inside' }).jpeg().toFile(abs)
      return relOut
    } catch {
      return null
    }
  }

  private forVideoTo(absSrc: string, relOut: string): Promise<string | null> {
    const abs = join(this.dataRoot, relOut)
    return new Promise((resolve) => {
      if (!FFMPEG) return resolve(null)
      const proc = spawn(FFMPEG, ['-y', '-i', absSrc, '-ss', '00:00:01', '-vframes', '1', '-vf', `scale=${SIZE}:-1`, abs], { stdio: ['ignore', 'ignore', 'ignore'] })
      proc.on('error', () => resolve(null))
      proc.on('close', (code: number | null) => resolve(code === 0 ? relOut : null))
    })
  }

  async forImage(absSrc: string): Promise<string | null> {
    const { rel } = this.outPath(absSrc)
    return this.forImageTo(absSrc, rel)
  }

  async forVideo(absSrc: string): Promise<string | null> {
    const { rel } = this.outPath(absSrc)
    return this.forVideoTo(absSrc, rel)
  }

  async thumbFor(relPath: string, kind: MaterialKind, mtimeMs: number, sizeBytes: number): Promise<string | null> {
    if (kind === 'other') return null
    const hash = createHash('sha1').update(`${relPath}|${mtimeMs}|${sizeBytes}`).digest('hex').slice(0, 16)
    const rel = `${THUMB_DIR}/${hash}.jpg`
    if (existsSync(join(this.dataRoot, rel))) return rel
    const src = join(this.dataRoot, relPath)
    return kind === 'image' ? this.forImageTo(src, rel) : this.forVideoTo(src, rel)
  }
}
