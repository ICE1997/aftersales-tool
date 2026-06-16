import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'

export async function makeTempDb(): Promise<{ db: Database; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), 'vh-db-'))
  const db = await createDatabase(join(dir, 'aftersales-tool.db'))
  return { db, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }) } }
}
