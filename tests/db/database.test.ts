import { describe, it, expect } from 'vitest'
import { createDatabase } from '../../src/main/db/database'

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
