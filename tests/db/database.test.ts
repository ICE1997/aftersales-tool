import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { createDatabase, ensureColumn } from '../../src/main/db/database'

describe('createDatabase', () => {
  it('creates tickets, materials and FTS tables', () => {
    const db = createDatabase(':memory:')
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table')")
      .all()
      .map((r: any) => r.name)
    expect(names).toContain('tickets')
    expect(names).toContain('materials')
    expect(names).toContain('tickets_fts')
  })

  it('enables foreign keys', () => {
    const db = createDatabase(':memory:')
    const row = db.prepare('PRAGMA foreign_keys').get() as any
    expect(row.foreign_keys).toBe(1)
  })
})

describe('ensureColumn', () => {
  it('adds a missing column with its default', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, a TEXT)')
    ensureColumn(db, 't', 'name', "name TEXT NOT NULL DEFAULT ''")
    const cols = (db.prepare('PRAGMA table_info(t)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('name')
    db.prepare('INSERT INTO t (a) VALUES (?)').run('x')
    expect((db.prepare('SELECT name FROM t').get() as { name: string }).name).toBe('')
  })

  it('is idempotent (no throw if column already exists)', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
    expect(() => ensureColumn(db, 't', 'name', "name TEXT NOT NULL DEFAULT ''")).not.toThrow()
  })
})

describe('materials.name column', () => {
  it('exists on a freshly created database', () => {
    const db = createDatabase(':memory:')
    const cols = (db.prepare('PRAGMA table_info(materials)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('name')
  })
})

describe('embedded customer columns', () => {
  it('a fresh db has no customers table and tickets carries customer columns', () => {
    const db = createDatabase(':memory:')
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name)
    expect(names).not.toContain('customers')
    const cols = (db.prepare('PRAGMA table_info(tickets)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).not.toContain('nickname')
    expect(cols).toContain('recipient_name')
    expect(cols).not.toContain('customer_id')
  })
})
