import { knex as Knex } from 'knex'
import type { Knex as KnexType } from 'knex'
import BetterSqlite3 from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export const BASELINE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS tickets (
     aftersale_no TEXT PRIMARY KEY,
     order_no TEXT NOT NULL DEFAULT '',
     shipping_no TEXT NOT NULL DEFAULT '',
     return_no TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT '待商家处理',
     note TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     recipient_name TEXT NOT NULL DEFAULT '',
     phone TEXT NOT NULL DEFAULT '',
     province_code TEXT NOT NULL DEFAULT '',
     province TEXT NOT NULL DEFAULT '',
     city_code TEXT NOT NULL DEFAULT '',
     city TEXT NOT NULL DEFAULT '',
     district_code TEXT NOT NULL DEFAULT '',
     district TEXT NOT NULL DEFAULT '',
     address_detail TEXT NOT NULL DEFAULT '',
     extension TEXT NOT NULL DEFAULT '',
     aftersale_type TEXT NOT NULL DEFAULT '',
     aftersale_reason TEXT NOT NULL DEFAULT '',
     shipping_status TEXT NOT NULL DEFAULT '',
     amount TEXT NOT NULL DEFAULT '',
     refund_amount TEXT NOT NULL DEFAULT '',
     applied_at TEXT NOT NULL DEFAULT '',
     return_logistics TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE TABLE IF NOT EXISTS materials (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     aftersale_no TEXT NOT NULL REFERENCES tickets(aftersale_no) ON DELETE CASCADE,
     rel_path TEXT NOT NULL UNIQUE,
     kind TEXT NOT NULL,
     name TEXT NOT NULL DEFAULT '',
     captured_at INTEGER,
     imported_at INTEGER NOT NULL,
     size_bytes INTEGER NOT NULL,
     thumb_path TEXT,
     folder TEXT NOT NULL DEFAULT ''
   )`,
  `CREATE INDEX IF NOT EXISTS idx_materials_ticket ON materials(aftersale_no)`,
  `CREATE TABLE IF NOT EXISTS material_folders (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     aftersale_no TEXT NOT NULL REFERENCES tickets(aftersale_no) ON DELETE CASCADE,
     path TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     UNIQUE(aftersale_no, path)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_folders_ticket ON material_folders(aftersale_no)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(
     aftersale_no, order_no, shipping_no, return_no, note,
     recipient_name, phone, province, city, district, address_detail,
     content='tickets', content_rowid='rowid'
   )`,
  `UPDATE tickets SET status='待商家处理' WHERE status='pending'`,
  `UPDATE tickets SET status='平台处理中' WHERE status='processing'`,
  `UPDATE tickets SET status='退款成功' WHERE status='resolved'`
]

export interface CodeMigration { name: string; up: (knex: KnexType) => Promise<void> }

export const MIGRATIONS: CodeMigration[] = [
  { name: '0001_baseline', up: async (knex) => { for (const s of BASELINE_STATEMENTS) await knex.raw(s) } },
  {
    name: '0002_aftersale_numeric_fields',
    up: async (knex) => {
      // SQLite doesn't support directly altering column constraints; recreate the table
      await knex.raw(`
        CREATE TABLE tickets_new (
          aftersale_no TEXT PRIMARY KEY,
          order_no TEXT NOT NULL DEFAULT '',
          shipping_no TEXT NOT NULL DEFAULT '',
          return_no TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT '待商家处理',
          note TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          recipient_name TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          province_code TEXT NOT NULL DEFAULT '',
          province TEXT NOT NULL DEFAULT '',
          city_code TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT '',
          district_code TEXT NOT NULL DEFAULT '',
          district TEXT NOT NULL DEFAULT '',
          address_detail TEXT NOT NULL DEFAULT '',
          extension TEXT NOT NULL DEFAULT '',
          aftersale_type TEXT NOT NULL DEFAULT '',
          aftersale_reason TEXT NOT NULL DEFAULT '',
          shipping_status TEXT NOT NULL DEFAULT '',
          amount INTEGER,
          refund_amount INTEGER,
          applied_at INTEGER,
          return_logistics TEXT NOT NULL DEFAULT ''
        )
      `)
      await knex.raw(`
        INSERT INTO tickets_new SELECT * FROM tickets
      `)
      await knex.raw(`DROP TABLE tickets`)
      await knex.raw(`ALTER TABLE tickets_new RENAME TO tickets`)
    }
  }
]

class CodeMigrationSource implements KnexType.MigrationSource<CodeMigration> {
  constructor(private migrations: CodeMigration[]) {}
  async getMigrations() { return this.migrations.slice().sort((a, b) => a.name.localeCompare(b.name)) }
  getMigrationName(m: CodeMigration) { return m.name }
  async getMigration(m: CodeMigration) { return { up: m.up, down: async () => {} } }
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function stamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** Checkpoint WAL into the main file, copy to a timestamped .bak, keep newest 3. Returns the backup path (or null). */
export function backupBeforeMigrate(dbPath: string, backupDir: string, now: () => number = Date.now): string | null {
  if (dbPath === ':memory:' || !existsSync(dbPath)) return null
  const tmp = new BetterSqlite3(dbPath)
  try { tmp.pragma('wal_checkpoint(TRUNCATE)') } finally { tmp.close() }
  mkdirSync(backupDir, { recursive: true })
  const dest = join(backupDir, `aftersales-tool.${stamp(now())}.db.bak`)
  copyFileSync(dbPath, dest)
  const baks = readdirSync(backupDir).filter((f: string) => /^aftersales-tool\..*\.db\.bak$/.test(f)).sort()
  for (const old of baks.slice(0, Math.max(0, baks.length - 3))) {
    try { unlinkSync(join(backupDir, old)) } catch { /* ignore */ }
  }
  return dest
}

/** Run pending Knex migrations on dbPath, backing up first if any are pending. */
export async function runMigrations(
  dbPath: string,
  backupDir: string,
  now: () => number = Date.now,
  migrations: CodeMigration[] = MIGRATIONS
): Promise<void> {
  const knex = Knex({
    client: 'better-sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true,
    migrations: { migrationSource: new CodeMigrationSource(migrations) }
  })
  let backup: string | null = null
  try {
    const [, pending] = await knex.migrate.list()
    if (pending.length > 0) backup = backupBeforeMigrate(dbPath, backupDir, now)
    await knex.migrate.latest()
  } catch (err) {
    throw new Error(`数据库迁移失败:${(err as Error).message}` + (backup ? `\n已在迁移前备份到:${backup}` : ''))
  } finally {
    await knex.destroy()
  }
}
