import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Knex } from 'knex'
import { createDatabase } from '../../src/main/db/database'

export async function makeTempDb(): Promise<{ db: Knex; cleanup: () => Promise<void> }> {
  const dir = mkdtempSync(join(tmpdir(), 'vh-db-'))
  const db = await createDatabase(join(dir, 'aftersales-tool.db'))
  return { db, cleanup: async () => { await db.destroy(); rmSync(dir, { recursive: true, force: true }) } }
}
