import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { safeDir } from './paths'

export class MaterialWatcher {
  private fsw: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  constructor(private dataRoot: string, private onChange: (no: string) => void, private debounceMs = 200) {}

  watch(no: string): void {
    this.unwatch()
    const dir = join(this.dataRoot, safeDir(no))
    try {
      this.fsw = watch(dir, { recursive: true }, () => {
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => this.onChange(no), this.debounceMs)
      })
    } catch { /* dir may not exist yet; ignore */ }
  }

  unwatch(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.fsw) { this.fsw.close(); this.fsw = null }
  }
}
