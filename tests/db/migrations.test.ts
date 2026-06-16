import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { runMigrations, backupBeforeMigrate, MIGRATIONS, type CodeMigration } from '../../src/main/db/migrations'
import { parseDateTimeToMs } from '../../src/shared/aftersale-format'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'vh-mig-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function tables(dbPath: string): string[] {
  const db = new BetterSqlite3(dbPath)
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  db.close()
  return rows.map((r) => r.name)
}

describe('runMigrations', () => {
  it('applies the baseline on a fresh db and records it', async () => {
    const dbPath = join(dir, 'a.db')
    await runMigrations(dbPath, join(dir, 'backups'))
    expect(tables(dbPath)).toEqual(expect.arrayContaining(['tickets', 'materials', 'material_folders', 'tickets_fts', 'knex_migrations']))
    const db = new BetterSqlite3(dbPath)
    const done = (db.prepare('SELECT name FROM knex_migrations').all() as { name: string }[]).map((r) => r.name)
    db.close()
    expect(done).toContain('0001_baseline')
  })

  it('applies a newly added migration once', async () => {
    const dbPath = join(dir, 'b.db')
    await runMigrations(dbPath, join(dir, 'backups'))
    const extra: CodeMigration[] = [...MIGRATIONS, { name: '0002_add_table', up: async (knex) => { await knex.raw('CREATE TABLE t2 (x INTEGER)') } }]
    await runMigrations(dbPath, join(dir, 'backups'), Date.now, extra)
    expect(tables(dbPath)).toContain('t2')
  })

  it('rolls back and throws when a migration fails', async () => {
    const dbPath = join(dir, 'c.db')
    await runMigrations(dbPath, join(dir, 'backups'))
    const bad: CodeMigration[] = [...MIGRATIONS, { name: '0002_bad', up: async (knex) => { await knex.raw('CREATE TABLE t3 (x INTEGER)'); await knex.raw('THIS IS NOT SQL') } }]
    await expect(runMigrations(dbPath, join(dir, 'backups'), Date.now, bad)).rejects.toThrow()
    expect(tables(dbPath)).not.toContain('t3')
  })

  it('backupBeforeMigrate keeps only the newest 3', async () => {
    const dbPath = join(dir, 'd.db')
    new BetterSqlite3(dbPath).close()
    const backups = join(dir, 'backups')
    let t = 1_000_000_000_000
    for (let i = 0; i < 5; i++) backupBeforeMigrate(dbPath, backups, () => (t += 1000))
    expect(readdirSync(backups).filter((f) => f.endsWith('.db.bak')).length).toBe(3)
  })

  it('backupBeforeMigrate skips memory / missing db', () => {
    expect(backupBeforeMigrate(':memory:', join(dir, 'backups'))).toBeNull()
    expect(backupBeforeMigrate(join(dir, 'nope.db'), join(dir, 'backups'))).toBeNull()
    expect(existsSync(join(dir, 'backups'))).toBe(false)
  })

  it('baseline tickets has the Spec C columns and the 待商家处理 status default', async () => {
    const dbPath = join(dir, 'cols.db')
    await runMigrations(dbPath, join(dir, 'backups'))
    const db = new BetterSqlite3(dbPath)
    const cols = (db.prepare('PRAGMA table_info(tickets)').all() as { name: string; dflt_value: string | null }[])
    const names = cols.map((c) => c.name)
    const status = cols.find((c) => c.name === 'status')!
    db.close()
    expect(names).toEqual(expect.arrayContaining(['aftersale_type', 'aftersale_reason', 'shipping_status', 'amount', 'refund_amount', 'applied_at', 'return_logistics', 'extension']))
    expect(status.dflt_value).toContain('待商家处理')
  })

  it('migration 0002 converts text amounts to cents and applied_at to epoch ms', async () => {
    const dbPath = join(dir, 'conv.db')
    // apply baseline only (text columns), then seed a row with text values
    await runMigrations(dbPath, join(dir, 'backups'), Date.now, [MIGRATIONS[0]])
    const seed = new BetterSqlite3(dbPath)
    seed.prepare(
      `INSERT INTO tickets (aftersale_no, created_at, updated_at, amount, refund_amount, applied_at)
       VALUES (?, 0, 0, ?, ?, ?)`
    ).run('C1', '24.99', '', '2026-05-28 14:27:38')
    seed.close()
    // now apply the full migration set (includes 0002)
    await runMigrations(dbPath, join(dir, 'backups'), Date.now, MIGRATIONS)
    const db = new BetterSqlite3(dbPath)
    const row = db.prepare('SELECT amount, refund_amount, applied_at FROM tickets WHERE aftersale_no=?').get('C1') as { amount: number | null; refund_amount: number | null; applied_at: number | null }
    const info = db.prepare('PRAGMA table_info(tickets)').all() as { name: string; type: string }[]
    db.close()
    expect(row.amount).toBe(2499)
    expect(row.refund_amount).toBeNull()           // empty text -> null
    expect(row.applied_at).toBe(parseDateTimeToMs('2026-05-28 14:27:38'))
    const typeOf = (n: string) => info.find((c) => c.name === n)!.type
    expect(typeOf('amount')).toBe('INTEGER')
    expect(typeOf('applied_at')).toBe('INTEGER')
  })

  it('migration 0002 runs cleanly on an empty fresh db', async () => {
    const dbPath = join(dir, 'fresh.db')
    await runMigrations(dbPath, join(dir, 'backups'), Date.now, MIGRATIONS)
    const db = new BetterSqlite3(dbPath)
    const info = db.prepare('PRAGMA table_info(tickets)').all() as { name: string; type: string }[]
    db.close()
    expect(info.find((c) => c.name === 'amount')!.type).toBe('INTEGER')
  })

  it('migration 0002 preserves FTS rowids so search still works on pre-existing rows', async () => {
    const dbPath = join(dir, 'fts.db')
    // Apply baseline only, seed a row with a searchable order_no
    await runMigrations(dbPath, join(dir, 'backups'), Date.now, [MIGRATIONS[0]])
    const seed = new BetterSqlite3(dbPath)
    const FTS_COLS = 'aftersale_no, order_no, shipping_no, return_no, note, recipient_name, phone, province, city, district, address_detail'
    seed.prepare(
      `INSERT INTO tickets (aftersale_no, order_no, created_at, updated_at, amount, refund_amount, applied_at)
       VALUES (?, ?, 0, 0, ?, ?, ?)`
    ).run('FTS-1', 'ORD-FTS-9999', '10.00', '', '2026-01-01 00:00:00')
    // Insert into FTS using the same pattern as TicketRepo.ftsInsert
    seed.prepare(`INSERT INTO tickets_fts (rowid, ${FTS_COLS}) SELECT rowid, ${FTS_COLS} FROM tickets WHERE aftersale_no = ?`).run('FTS-1')
    seed.close()
    // Now apply the full MIGRATIONS (adds 0002 via ALTER TABLE — rowids preserved)
    await runMigrations(dbPath, join(dir, 'backups'), Date.now, MIGRATIONS)
    const db = new BetterSqlite3(dbPath)
    // Use the same search pattern as TicketRepo.search
    const match = '"ORD-FTS-9999"*'
    const hits = db.prepare(
      `SELECT tickets.aftersale_no FROM tickets_fts f JOIN tickets ON tickets.rowid = f.rowid WHERE tickets_fts MATCH ?`
    ).all(match) as { aftersale_no: string }[]
    db.close()
    expect(hits.map((r) => r.aftersale_no)).toContain('FTS-1')
  })
})
