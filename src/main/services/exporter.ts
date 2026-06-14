import { createWriteStream, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { ZipArchive } from 'archiver'
import type { Material } from '../../shared/types'

export class Exporter {
  constructor(private dataRoot: string) {}

  private abs(m: Material): string {
    return join(this.dataRoot, m.relPath)
  }

  private uniqueBasename(name: string, taken: (n: string) => boolean): string {
    const ext = extname(name); const stem = basename(name, ext)
    let candidate = name; let i = 1
    while (taken(candidate)) { candidate = `${stem}-${i}${ext}`; i++ }
    return candidate
  }

  async toFolder(materials: Material[], targetDir: string): Promise<void> {
    mkdirSync(targetDir, { recursive: true })
    for (const m of materials) {
      const name = this.uniqueBasename(basename(m.relPath), (n) => existsSync(join(targetDir, n)))
      copyFileSync(this.abs(m), join(targetDir, name))
    }
  }

  toZip(materials: Material[], zipPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath)
      const archive = new ZipArchive({ zlib: { level: 9 } })
      output.on('close', () => resolve())
      output.on('error', reject)
      archive.on('error', reject)
      archive.on('warning', (err) => reject(err))
      archive.pipe(output)
      const used = new Set<string>()
      for (const m of materials) {
        const name = this.uniqueBasename(basename(m.relPath), (n) => used.has(n))
        used.add(name)
        archive.file(this.abs(m), { name })
      }
      archive.finalize().catch(reject)
    })
  }
}
