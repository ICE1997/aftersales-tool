import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Knex } from 'knex'
import { makeTempDb } from '../db/helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { Importer } from '../../src/main/services/importer'

let root: string
let db: Knex
let importer: Importer
let materials: MaterialRepo
let cleanupDb: () => Promise<void>

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'vh-mv-'))
  ;({ db, cleanup: cleanupDb } = await makeTempDb())
  await new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  materials = new MaterialRepo(db)
  const thumbStub = { forImage: async () => 'thumb.jpg', forVideo: async () => 'thumb.jpg' } as any
  importer = new Importer(root, materials, thumbStub, () => 42)
})
afterEach(async () => { rmSync(root, { recursive: true, force: true }); await cleanupDb() })

function makeFile(name: string, content = 'x'): string {
  const p = join(root, name)
  writeFileSync(p, content)
  return p
}

describe('Importer.moveToFolder', () => {
  it('moves the file on disk and updates rel_path + folder', async () => {
    const m = await importer.addFile('AS-1', makeFile('a.jpg'), '凭证图')
    expect(existsSync(join(root, 'AS-1/凭证图.jpg'))).toBe(true)

    await importer.moveToFolder(m.id, '凭证/聊天')

    const moved = (await materials.getByIds([m.id]))[0]
    expect(moved.folder).toBe('凭证/聊天')
    expect(moved.relPath).toBe('AS-1/凭证/聊天/凭证图.jpg')
    expect(existsSync(join(root, 'AS-1/凭证/聊天/凭证图.jpg'))).toBe(true)
    expect(existsSync(join(root, 'AS-1/凭证图.jpg'))).toBe(false)
  })

  it('rejects moving into a folder that already has the same name', async () => {
    const m = await importer.addFile('AS-1', makeFile('a.jpg'), '同名')
    await importer.addFile('AS-1', makeFile('b.jpg'), '同名', '凭证')
    await expect(importer.moveToFolder(m.id, '凭证')).rejects.toThrow('该文件夹下已存在同名材料')
  })

  it('is a no-op when the folder is unchanged', async () => {
    const m = await importer.addFile('AS-1', makeFile('a.jpg'), '图', '凭证')
    await importer.moveToFolder(m.id, '凭证')
    expect(existsSync(join(root, 'AS-1/凭证/图.jpg'))).toBe(true)
  })
})
