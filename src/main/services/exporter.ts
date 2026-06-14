import { createWriteStream, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { ZipArchive } from 'archiver'
import type { Material } from '../../shared/types'

export class Exporter {
  constructor(private dataRoot: string) {}

  private abs(m: Material): string {
    return join(this.dataRoot, m.relPath)
  }

  private uniqueName(dir: string, name: string): string {
    const ext = extname(name)
    const stem = basename(name, ext)
    let candidate = join(dir, name)
    let i = 1
    while (existsSync(candidate)) { candidate = join(dir, `${stem}-${i}${ext}`); i++ }
    return candidate
  }

  async toFolder(materials: Material[], targetDir: string): Promise<void> {
    mkdirSync(targetDir, { recursive: true })
    for (const m of materials) {
      copyFileSync(this.abs(m), this.uniqueName(targetDir, basename(m.relPath)))
    }
  }

  toZip(materials: Material[], zipPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath)
      const archive = new ZipArchive({ zlib: { level: 9 } })
      output.on('close', () => resolve())
      archive.on('error', reject)
      archive.pipe(output)
      const used = new Set<string>()
      for (const m of materials) {
        let name = basename(m.relPath)
        const ext = extname(name); const stem = basename(name, ext)
        let i = 1
        while (used.has(name)) { name = `${stem}-${i}${ext}`; i++ }
        used.add(name)
        archive.file(this.abs(m), { name })
      }
      archive.finalize()
    })
  }
}
