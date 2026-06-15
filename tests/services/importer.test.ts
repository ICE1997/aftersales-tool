import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import sharp from 'sharp'
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

  it('addFile copies a single file and stores the custom name', async () => {
    const img = makeFile('photo.jpg')
    const m = await importer.addFile('AS-1', img, '破损正面')
    expect(m.name).toBe('破损正面')
    expect(m.kind).toBe('image')
    expect(existsSync(join(root, 'AS-1/images/photo.jpg'))).toBe(true)
  })

  it('addFile throws on unsupported type', async () => {
    const txt = makeFile('note.txt')
    await expect(importer.addFile('AS-1', txt, 'x')).rejects.toThrow(/unsupported/i)
  })

  it('addBytes writes an image with the given filename and stores the name', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#0a0' } }).png().toBuffer()
    const m = await importer.addBytes('AS-1', 'paste.png', png, '剪贴板图')
    expect(m.name).toBe('剪贴板图')
    expect(m.kind).toBe('image')
    expect(m.relPath).toBe('AS-1/images/paste.png')
    expect(existsSync(join(root, m.relPath))).toBe(true)
  })

  it('addBytes classifies a video by extension', async () => {
    const m = await importer.addBytes('AS-1', 'clip.mp4', Buffer.from('x'), '视频')
    expect(m.kind).toBe('video')
    expect(m.relPath).toBe('AS-1/videos/clip.mp4')
  })

  it('addBytes throws on unsupported type', async () => {
    await expect(importer.addBytes('AS-1', 'note.txt', Buffer.from('x'), 'x')).rejects.toThrow(/unsupported/i)
  })

  it('addBytes rejects an empty buffer', async () => {
    await expect(importer.addBytes('AS-1', 'paste.png', Buffer.alloc(0), 'x')).rejects.toThrow(/empty/i)
  })

  it('sanitizes illegal chars in aftersaleNo when building the destination folder', async () => {
    // Ticket key may contain '/' or ':' — these are illegal in directory names on most OSes
    const illegalNo = 'AS/2026:06'
    new TicketRepo(db, () => 1).create({ aftersaleNo: illegalNo, orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const localImporter = new Importer(root, new MaterialRepo(db), { forImage: async () => 'thumb.jpg', forVideo: async () => 'thumb.jpg' } as any, () => 42)
    const img = makeFile('photo2.jpg')
    const res = await localImporter.importFiles(illegalNo, [img])
    expect(res.imported.length).toBe(1)
    // The folder should use sanitized dir name (slashes and colons → underscores), not the raw aftersaleNo
    const sanitizedFolder = 'AS_2026_06'
    expect(existsSync(join(root, sanitizedFolder, 'images', 'photo2.jpg'))).toBe(true)
    // The DB record uses the original key
    expect(res.imported[0].aftersaleNo).toBe(illegalNo)
    // relPath uses the sanitized folder
    expect(res.imported[0].relPath).toContain(sanitizedFolder)
  })


})
