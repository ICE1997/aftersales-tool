import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Knex } from 'knex'
import { makeTempDb } from './helpers'

let db: Knex
let cleanup: () => Promise<void>
beforeEach(async () => { ;({ db, cleanup } = await makeTempDb()) })
afterEach(async () => { await cleanup() })

describe('createDatabase', () => {
  it('creates core tables (incl. knex_migrations) and the FTS table', async () => {
    const names = await db('sqlite_master').where('type', 'table').pluck('name')
    expect(names).toEqual(expect.arrayContaining(['tickets', 'tickets_fts', 'knex_migrations']))
    expect(names).not.toContain('materials')
    expect(names).not.toContain('material_folders')
  })
  it('enables foreign keys on the returned connection', async () => {
    const rows = (await db.raw('PRAGMA foreign_keys')) as { foreign_keys: number }[]
    expect(rows[0].foreign_keys).toBe(1)
  })
  it('tickets has embedded customer + Spec C aftersale columns (no customer_id)', async () => {
    const cols = ((await db.raw('PRAGMA table_info(tickets)')) as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['recipient_name', 'phone', 'province', 'extension', 'aftersale_type', 'shipping_status', 'return_logistics']))
    expect(cols).not.toContain('customer_id')
  })
  it('records the baseline migration', async () => {
    const done = await db('knex_migrations').pluck('name')
    expect(done).toContain('0001_baseline')
  })
  it('tickets_fts indexes the expanded text columns', async () => {
    const cols = ((await db.raw('PRAGMA table_info(tickets_fts)')) as { name: string }[]).map((c) => c.name)
    expect(cols).toEqual(expect.arrayContaining(['extension', 'aftersale_type', 'aftersale_reason', 'shipping_status', 'return_logistics']))
  })
})
