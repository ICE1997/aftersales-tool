import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Knex } from 'knex'
import { makeTempDb } from './helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { FolderRepo } from '../../src/main/db/folders'

let db: Knex
let folders: FolderRepo
let materials: MaterialRepo
let cleanup: () => Promise<void>

beforeEach(async () => {
  ;({ db, cleanup } = await makeTempDb())
  await new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  folders = new FolderRepo(db, () => 1)
  materials = new MaterialRepo(db)
})
afterEach(async () => { await cleanup() })

describe('FolderRepo', () => {
  it('create inserts the path and all ancestors', async () => {
    await folders.create('AS-1', '凭证/聊天/2024')
    expect(await folders.list('AS-1')).toEqual(['凭证', '凭证/聊天', '凭证/聊天/2024'])
  })

  it('rename rewrites the folder subtree and material folders', async () => {
    await folders.create('AS-1', '凭证/聊天')
    const mid = await materials.add({ aftersaleNo: 'AS-1', name: 'x', relPath: 'AS-1/images/x.jpg', kind: 'image', folder: '凭证/聊天', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    await folders.rename('AS-1', '凭证', '证据')
    expect(await folders.list('AS-1')).toEqual(['证据', '证据/聊天'])
    expect((await materials.getByIds([mid]))[0].folder).toBe('证据/聊天')
  })

  it('rename rejects a name that collides with an existing sibling', async () => {
    await folders.create('AS-1', '凭证')
    await folders.create('AS-1', '物流')
    await expect(folders.rename('AS-1', '物流', '凭证')).rejects.toThrow()
  })

  it('create rejects path segments containing / . .. or empty', async () => {
    await expect(folders.create('AS-1', '..')).rejects.toThrow()
    await expect(folders.create('AS-1', '凭证/..')).rejects.toThrow()
    await expect(folders.create('AS-1', '凭证//聊天')).rejects.toThrow()
  })

  it('remove deletes the subtree and returns affected materials', async () => {
    await folders.create('AS-1', '凭证/聊天')
    await folders.create('AS-1', '物流')
    const inSub = await materials.add({ aftersaleNo: 'AS-1', name: 'a', relPath: 'AS-1/images/a.jpg', kind: 'image', folder: '凭证/聊天', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: 'AS-1/thumb/a.jpg' })
    const outside = await materials.add({ aftersaleNo: 'AS-1', name: 'b', relPath: 'AS-1/images/b.jpg', kind: 'image', folder: '物流', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    const affected = await folders.remove('AS-1', '凭证')
    expect(affected).toEqual([{ relPath: 'AS-1/images/a.jpg', thumbPath: 'AS-1/thumb/a.jpg' }])
    expect(await folders.list('AS-1')).toEqual(['物流'])
    expect(await materials.getByIds([inSub])).toEqual([])
    expect((await materials.getByIds([outside]))[0].folder).toBe('物流')
  })
})
