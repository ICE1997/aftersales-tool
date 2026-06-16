import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { makeTempDb } from './helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { FolderRepo } from '../../src/main/db/folders'

let db: Database
let folders: FolderRepo
let materials: MaterialRepo
let cleanup: () => void

beforeEach(async () => {
  ;({ db, cleanup } = await makeTempDb())
  new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  folders = new FolderRepo(db, () => 1)
  materials = new MaterialRepo(db)
})
afterEach(() => cleanup())

describe('FolderRepo', () => {
  it('create inserts the path and all ancestors', () => {
    folders.create('AS-1', '凭证/聊天/2024')
    expect(folders.list('AS-1')).toEqual(['凭证', '凭证/聊天', '凭证/聊天/2024'])
  })

  it('rename rewrites the folder subtree and material folders', () => {
    folders.create('AS-1', '凭证/聊天')
    const mid = materials.add({ aftersaleNo: 'AS-1', name: 'x', relPath: 'AS-1/images/x.jpg', kind: 'image', folder: '凭证/聊天', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    folders.rename('AS-1', '凭证', '证据')
    expect(folders.list('AS-1')).toEqual(['证据', '证据/聊天'])
    expect(materials.getByIds([mid])[0].folder).toBe('证据/聊天')
  })

  it('rename rejects a name that collides with an existing sibling', () => {
    folders.create('AS-1', '凭证')
    folders.create('AS-1', '物流')
    expect(() => folders.rename('AS-1', '物流', '凭证')).toThrow()
  })

  it('create rejects path segments containing / . .. or empty', () => {
    expect(() => folders.create('AS-1', '..')).toThrow()
    expect(() => folders.create('AS-1', '凭证/..')).toThrow()
    expect(() => folders.create('AS-1', '凭证//聊天')).toThrow()
  })

  it('remove deletes the subtree and returns affected materials', () => {
    folders.create('AS-1', '凭证/聊天')
    folders.create('AS-1', '物流')
    const inSub = materials.add({ aftersaleNo: 'AS-1', name: 'a', relPath: 'AS-1/images/a.jpg', kind: 'image', folder: '凭证/聊天', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: 'AS-1/thumb/a.jpg' })
    const outside = materials.add({ aftersaleNo: 'AS-1', name: 'b', relPath: 'AS-1/images/b.jpg', kind: 'image', folder: '物流', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    const affected = folders.remove('AS-1', '凭证')
    expect(affected).toEqual([{ relPath: 'AS-1/images/a.jpg', thumbPath: 'AS-1/thumb/a.jpg' }])
    expect(folders.list('AS-1')).toEqual(['物流'])
    expect(materials.getByIds([inSub])).toEqual([])
    expect(materials.getByIds([outside])[0].folder).toBe('物流')
  })
})
