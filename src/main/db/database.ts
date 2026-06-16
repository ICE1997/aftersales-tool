import BetterSqlite3 from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { runMigrations } from './migrations'

export async function createDatabase(path: string): Promise<DB> {
  await runMigrations(path, join(dirname(path), 'backups'))
  const db = new BetterSqlite3(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
