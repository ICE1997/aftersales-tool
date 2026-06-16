import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { makeTempDb } from './helpers'

let db: Database
let cleanup: () => void
beforeEach(async () => { ;({ db, cleanup } = await makeTempDb()) })
afterEach(() => cleanup())

describe('createDatabase', () => {
  it('creates core tables (incl. knex_migrations) and the FTS table', () => {
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name)
    expect(names).toEqual(expect.arrayContaining(['tickets', 'materials', 'material_folders', 'tickets_fts', 'knex_migrations']))
  })
  it('enables foreign keys on the returned connection', () => {
    expect((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(1)
  })
  it('tickets has embedded customer + Spec C aftersale columns (no customer_id)', () => {
    const cols = (db.prepare('PRAGMA table_info(tickets)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['recipient_name', 'phone', 'province', 'extension', 'aftersale_type', 'shipping_status', 'return_logistics']))
    expect(cols).not.toContain('customer_id')
  })
  it('materials has name + folder columns', () => {
    const cols = (db.prepare('PRAGMA table_info(materials)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['name', 'folder']))
  })
  it('records the baseline migration', () => {
    const done = (db.prepare('SELECT name FROM knex_migrations').all() as { name: string }[]).map((r) => r.name)
    expect(done).toContain('0001_baseline')
  })
})
