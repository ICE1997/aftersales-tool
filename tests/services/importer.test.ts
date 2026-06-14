import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { Importer } from '../../src/main/services/importer'

let root: string
let db: Database
let importer: Importer

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-imp-'))
  db = createDatabase(':memory:')
  new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  const thumbStub = { forImage: async () => 'thumb.jpg', forVideo: async () => 'thumb.jpg' } as any
  importer = new Importer(root, new MaterialRepo(db), thumbStub, () => 42)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function makeFile(name: string, content = 'x'): string {
  const p = join(root, name)
  writeFileSync(p, content)
  return p
}

describe('Importer', () => {
  it('copies images/videos into ticket folder and records materials', async () => {
    const img = makeFile('photo.jpg')
    const vid = makeFile('clip.mp4')
    const res = await importer.importFiles('AS-1', [img, vid])
    expect(res.imported.length).toBe(2)
    expect(existsSync(join(root, 'AS-1/images/photo.jpg'))).toBe(true)
    expect(existsSync(join(root, 'AS-1/videos/clip.mp4'))).toBe(true)
    expect(res.imported.map(m => m.kind).sort()).toEqual(['image', 'video'])
  })

  it('skips unsupported file types with a reason', async () => {
    const txt = makeFile('note.txt')
    const res = await importer.importFiles('AS-1', [txt])
    expect(res.imported.length).toBe(0)
    expect(res.skipped[0].reason).toMatch(/unsupported/i)
  })

  it('avoids name collisions by appending a suffix', async () => {
    // First import: photo.jpg → AS-1/images/photo.jpg
    const first = makeFile('photo.jpg', 'one')
    await importer.importFiles('AS-1', [first])
    expect(existsSync(join(root, 'AS-1/images/photo.jpg'))).toBe(true)

    // Second import: a different file that also has basename photo.jpg
    // Write new content to the same source path (simulates a different file with same name)
    writeFileSync(join(root, 'photo.jpg'), 'two')
    const res = await importer.importFiles('AS-1', [join(root, 'photo.jpg')])
    expect(res.imported[0].relPath).toBe('AS-1/images/photo-1.jpg')
    expect(existsSync(join(root, 'AS-1/images/photo-1.jpg'))).toBe(true)
  })

  it('continues batch when one file is missing', async () => {
    const ok = makeFile('ok.jpg')
    const res = await importer.importFiles('AS-1', [join(root, 'ghost.jpg'), ok])
    expect(res.imported.length).toBe(1)
    expect(res.skipped.length).toBe(1)
  })
})
