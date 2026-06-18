import { createWriteStream, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { ZipArchive } from 'archiver'

export class Exporter {
  constructor(private dataRoot: string) {}

  private uniqueName(name: string, taken: (n: string) => boolean): string {
    const ext = extname(name); const stem = basename(name, ext)
    let candidate = name; let i = 1
    while (taken(candidate)) { candidate = `${stem}-${i}${ext}`; i++ }
    return candidate
  }

  async toFolder(relPaths: string[], targetDir: string, folders: string[] = []): Promise<void> {
    mkdirSync(targetDir, { recursive: true })
    for (const f of folders) if (f) mkdirSync(join(targetDir, ...f.split('/')), { recursive: true })
    for (const rel of relPaths) {
      const folder = rel.split('/').slice(1, -1).join('/')
      const sub = folder ? join(targetDir, ...folder.split('/')) : targetDir
      mkdirSync(sub, { recursive: true })
      const name = this.uniqueName(basename(rel), (n) => existsSync(join(sub, n)))
      copyFileSync(join(this.dataRoot, rel), join(sub, name))
    }
  }

  toZip(relPaths: string[], zipPath: string, folders: string[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath)
      const archive = new ZipArchive({ zlib: { level: 9 } })
      output.on('close', () => resolve())
      output.on('error', reject)
      archive.on('error', reject)
      archive.on('warning', (err) => reject(err))
      archive.pipe(output)
      for (const f of folders) if (f) archive.append(Buffer.alloc(0), { name: `${f}/` })
      const usedByDir = new Map<string, Set<string>>()
      for (const rel of relPaths) {
        const dir = rel.split('/').slice(1, -1).join('/')
        const used = usedByDir.get(dir) ?? new Set<string>()
        const name = this.uniqueName(basename(rel), (n) => used.has(n))
        used.add(name); usedByDir.set(dir, used)
        const entry = dir ? `${dir}/${name}` : name
        archive.file(join(this.dataRoot, rel), { name: entry })
      }
      archive.finalize().catch(reject)
    })
  }
}
