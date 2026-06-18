import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Knex } from 'knex'
import sharp from 'sharp'
import { makeTempDb } from '../db/helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { Importer } from '../../src/main/services/importer'

let root: string
let db: Knex
let importer: Importer
let cleanupDb: () => Promise<void>

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'vh-imp-'))
  ;({ db, cleanup: cleanupDb } = await makeTempDb())
  await new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  const thumbStub = { forImage: async () => 'thumb.jpg', forVideo: async () => 'thumb.jpg' } as any
  importer = new Importer(root, new MaterialRepo(db), thumbStub, () => 42)
})
afterEach(async () => { rmSync(root, { recursive: true, force: true }); await cleanupDb() })

function makeFile(name: string, content = 'x'): string {
  const p = join(root, name)
  writeFileSync(p, content)
  return p
}

describe('Importer.addFile', () => {
  it('names the file after the material name and stores it in the ticket root dir', async () => {
    const img = makeFile('IMG_0001.jpg')
    const m = await importer.addFile('AS-1', img, '破损正面')
    expect(m.name).toBe('破损正面')
    expect(m.kind).toBe('image')
    expect(m.relPath).toBe('AS-1/破损正面.jpg')
    expect(existsSync(join(root, 'AS-1/破损正面.jpg'))).toBe(true)
  })

  it('places images and videos together in the folder directory (no images/videos split)', async () => {
    const img = makeFile('a.jpg')
    const vid = makeFile('b.mp4')
    const mi = await importer.addFile('AS-1', img, '图', '凭证')
    const mv = await importer.addFile('AS-1', vid, '视频', '凭证')
    expect(mi.relPath).toBe('AS-1/凭证/图.jpg')
    expect(mv.relPath).toBe('AS-1/凭证/视频.mp4')
    expect(existsSync(join(root, 'AS-1/凭证/图.jpg'))).toBe(true)
    expect(existsSync(join(root, 'AS-1/凭证/视频.mp4'))).toBe(true)
  })

  it('rejects a duplicate name within the same folder', async () => {
    await importer.addFile('AS-1', makeFile('a.jpg'), '凭证图', '凭证')
    await expect(importer.addFile('AS-1', makeFile('b.jpg'), '凭证图', '凭证')).rejects.toThrow('该文件夹下已存在同名材料')
  })

  it('allows the same name in different folders', async () => {
    const m1 = await importer.addFile('AS-1', makeFile('a.jpg'), '同名', '凭证')
    const m2 = await importer.addFile('AS-1', makeFile('b.jpg'), '同名', '物流')
    expect(m1.relPath).toBe('AS-1/凭证/同名.jpg')
    expect(m2.relPath).toBe('AS-1/物流/同名.jpg')
  })

  it('rejects an empty name', async () => {
    await expect(importer.addFile('AS-1', makeFile('a.jpg'), '   ')).rejects.toThrow('请输入材料名称')
  })

  it('rejects a name with illegal characters', async () => {
    await expect(importer.addFile('AS-1', makeFile('a.jpg'), 'a/b')).rejects.toThrow('材料名称不能包含')
  })

  it('throws on unsupported type before validating the name', async () => {
    await expect(importer.addFile('AS-1', makeFile('note.txt'), 'x')).rejects.toThrow(/unsupported/i)
  })

  it('sanitizes illegal chars in aftersaleNo when building the destination dir', async () => {
    const illegalNo = 'AS/2026:06'
    await new TicketRepo(db, () => 1).create({ aftersaleNo: illegalNo, orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const m = await importer.addFile(illegalNo, makeFile('p.jpg'), '图')
    expect(m.aftersaleNo).toBe(illegalNo)
    expect(m.relPath).toBe('AS_2026_06/图.jpg')
    expect(existsSync(join(root, 'AS_2026_06/图.jpg'))).toBe(true)
  })
})

describe('Importer.addBytes', () => {
  it('writes pasted bytes named after the material name', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#0a0' } }).png().toBuffer()
    const m = await importer.addBytes('AS-1', 'paste.png', png, '剪贴板图', '凭证')
    expect(m.name).toBe('剪贴板图')
    expect(m.relPath).toBe('AS-1/凭证/剪贴板图.png')
    expect(existsSync(join(root, m.relPath))).toBe(true)
  })

  it('classifies a video by extension and keeps it in one dir', async () => {
    const m = await importer.addBytes('AS-1', 'clip.mp4', Buffer.from('x'), '视频')
    expect(m.kind).toBe('video')
    expect(m.relPath).toBe('AS-1/视频.mp4')
  })

  it('throws on unsupported type', async () => {
    await expect(importer.addBytes('AS-1', 'note.txt', Buffer.from('x'), 'x')).rejects.toThrow(/unsupported/i)
  })

  it('rejects an empty buffer', async () => {
    await expect(importer.addBytes('AS-1', 'paste.png', Buffer.alloc(0), 'x')).rejects.toThrow(/empty/i)
  })

  it('rejects a duplicate name within the same folder', async () => {
    await importer.addBytes('AS-1', 'a.png', Buffer.from('x'), '同名', '凭证')
    await expect(importer.addBytes('AS-1', 'b.png', Buffer.from('y'), '同名', '凭证')).rejects.toThrow('该文件夹下已存在同名材料')
  })
})
