import { describe, it, expect } from 'vitest'
import { createDatabase } from '../../src/main/db/database'

describe('createDatabase', () => {
  it('creates tickets, materials and FTS tables', async () => {
    const db = await createDatabase(':memory:')
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table')")
      .all()
      .map((r: any) => r.name)
    expect(names).toContain('tickets')
    expect(names).toContain('materials')
    expect(names).toContain('tickets_fts')
    db.close()
  })

  it('enables foreign keys', async () => {
    const db = await createDatabase(':memory:')
    const row = db.prepare('PRAGMA foreign_keys').get() as any
    expect(row.foreign_keys).toBe(1)
    db.close()
  })
})

describe('materials.name column', () => {
  it('exists on a freshly created database', async () => {
    const db = await createDatabase(':memory:')
    const cols = (db.prepare('PRAGMA table_info(materials)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('name')
    db.close()
  })
})

describe('material folders schema', () => {
  it('fresh db has material_folders table and materials.folder column', async () => {
    const db = await createDatabase(':memory:')
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name)
    expect(names).toContain('material_folders')
    const cols = (db.prepare('PRAGMA table_info(materials)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).toContain('folder')
    db.close()
  })
})

describe('embedded customer columns', () => {
  it('a fresh db has no customers table and tickets carries customer columns', async () => {
    const db = await createDatabase(':memory:')
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name)
    expect(names).not.toContain('customers')
    const cols = (db.prepare('PRAGMA table_info(tickets)').all() as { name: string }[]).map((c) => c.name)
    expect(cols).not.toContain('nickname')
    expect(cols).toContain('recipient_name')
    expect(cols).not.toContain('customer_id')
    db.close()
  })
})
