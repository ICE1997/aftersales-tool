import { mkdirSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'

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

  async forImage(absSrc: string): Promise<string | null> {
    const { rel, abs } = this.outPath(absSrc)
    try {
      await sharp(absSrc).resize(SIZE, SIZE, { fit: 'inside' }).jpeg().toFile(abs)
      return rel
    } catch {
      return null
    }
  }

  async forVideo(absSrc: string): Promise<string | null> {
    const { rel, abs } = this.outPath(absSrc)
    return new Promise((resolve) => {
      if (!ffmpegPath) return resolve(null)
      const proc = spawn(ffmpegPath, ['-y', '-i', absSrc, '-ss', '00:00:01', '-vframes', '1', '-vf', `scale=${SIZE}:-1`, abs], { stdio: ['ignore', 'ignore', 'ignore'] })
      proc.on('error', () => resolve(null))
      proc.on('close', (code: number | null) => resolve(code === 0 ? rel : null))
    })
  }
}
