import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { MaterialRepo } from '../db/materials'

export class Scanner {
  constructor(private dataRoot: string, private materials: MaterialRepo) {}

  /** 删除磁盘上已不存在的材料索引,返回删除条数。 */
  async calibrateTicket(aftersaleNo: string): Promise<number> {
    let removed = 0
    for (const m of await this.materials.listByTicket(aftersaleNo)) {
      if (!existsSync(join(this.dataRoot, m.relPath))) {
        if (m.thumbPath) { try { unlinkSync(join(this.dataRoot, m.thumbPath)) } catch { /* ignore */ } }
        await this.materials.remove(m.id)
        removed++
      }
    }
    return removed
  }
}
