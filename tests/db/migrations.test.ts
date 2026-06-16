import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { runMigrations, backupBeforeMigrate, MIGRATIONS, type CodeMigration } from '../../src/main/db/migrations'

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
})
