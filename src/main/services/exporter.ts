import { createWriteStream, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { ZipArchive } from 'archiver'
import type { Material } from '../../shared/types'

export class Exporter {
  constructor(private dataRoot: string) {}

  private abs(m: Material): string {
    return join(this.dataRoot, m.relPath)
  }

  private uniqueName(name: string, taken: (n: string) => boolean): string {
    const ext = extname(name); const stem = basename(name, ext)
    let candidate = name; let i = 1
    while (taken(candidate)) { candidate = `${stem}-${i}${ext}`; i++ }
    return candidate
  }

  async toFolder(materials: Material[], targetDir: string, folders: string[] = []): Promise<void> {
    mkdirSync(targetDir, { recursive: true })
    for (const f of folders) if (f) mkdirSync(join(targetDir, ...f.split('/')), { recursive: true }) // selected (possibly empty) dirs
    for (const m of materials) {
      const sub = m.folder ? join(targetDir, ...m.folder.split('/')) : targetDir
      mkdirSync(sub, { recursive: true })
      const name = this.uniqueName(basename(m.relPath), (n) => existsSync(join(sub, n)))
      copyFileSync(this.abs(m), join(sub, name))
    }
  }

  toZip(materials: Material[], zipPath: string, folders: string[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath)
      const archive = new ZipArchive({ zlib: { level: 9 } })
      output.on('close', () => resolve())
      output.on('error', reject)
      archive.on('error', reject)
      archive.on('warning', (err) => reject(err))
      archive.pipe(output)
      for (const f of folders) if (f) archive.append(Buffer.alloc(0), { name: `${f}/` }) // selected (possibly empty) dirs
      const usedByDir = new Map<string, Set<string>>()
      for (const m of materials) {
        const dir = m.folder ?? ''
        const used = usedByDir.get(dir) ?? new Set<string>()
        const name = this.uniqueName(basename(m.relPath), (n) => used.has(n))
        used.add(name); usedByDir.set(dir, used)
        const entry = dir ? `${dir}/${name}` : name
        archive.file(this.abs(m), { name: entry })
      }
      archive.finalize().catch(reject)
    })
  }
}
