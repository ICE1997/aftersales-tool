import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface ConfigShape { dataRoot?: string }

export class Settings {
  private file: string
  constructor(private configDir: string, private defaultRoot: string) {
    this.file = join(configDir, 'config.json')
  }

  private read(): ConfigShape {
    if (!existsSync(this.file)) return {}
    try { return JSON.parse(readFileSync(this.file, 'utf-8')) as ConfigShape } catch { return {} }
  }

  private write(cfg: ConfigShape): void {
    writeFileSync(this.file, JSON.stringify(cfg, null, 2), 'utf-8')
  }

  getDataRoot(): string {
    return this.read().dataRoot ?? this.defaultRoot
  }

  setDataRoot(root: string): void {
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      throw new Error(`data root not a directory: ${root}`)
    }
    this.write({ ...this.read(), dataRoot: root })
  }
}
