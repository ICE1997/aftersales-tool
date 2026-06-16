import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name)
}
function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
}

describe('createDatabase (schema baseline)', () => {
  it('fresh db has no customers table and tickets carries embedded customer fields', async () => {
    const db = await createDatabase(':memory:')
    expect(tableExists(db, 'customers')).toBe(false)
    expect(columns(db, 'tickets')).toContain('recipient_name')
    expect(columns(db, 'tickets')).not.toContain('nickname')
    expect(columns(db, 'tickets')).not.toContain('customer_id')
    db.close()
  })

  it('fresh db has tickets_fts virtual table', async () => {
    const db = await createDatabase(':memory:')
    expect(tableExists(db, 'tickets_fts')).toBe(true)
    db.close()
  })

  it('fresh db has materials and material_folders tables', async () => {
    const db = await createDatabase(':memory:')
    expect(tableExists(db, 'materials')).toBe(true)
    expect(tableExists(db, 'material_folders')).toBe(true)
    db.close()
  })
})
