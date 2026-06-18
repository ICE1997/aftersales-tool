import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Knex } from 'knex'
import { makeTempDb } from './helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { FolderRepo } from '../../src/main/db/folders'

let db: Knex
let folders: FolderRepo
let cleanup: () => Promise<void>

// Minimal material-row helpers (the old MaterialRepo was removed when the filesystem
// became the source of truth; FolderRepo still cascades over the legacy `materials` table).
interface MatRow { aftersaleNo: string; name: string; relPath: string; folder: string; thumbPath?: string | null }
const materials = {
  async add(m: MatRow): Promise<number> {
    const [id] = await db('materials').insert({
      aftersale_no: m.aftersaleNo, name: m.name, rel_path: m.relPath, kind: 'image',
      captured_at: null, imported_at: 1, size_bytes: 1, thumb_path: m.thumbPath ?? null, folder: m.folder
    })
    return Number(id)
  },
  async getByIds(ids: number[]): Promise<{ relPath: string; folder: string }[]> {
    if (ids.length === 0) return []
    return (await db('materials').select({ relPath: 'rel_path' }, 'folder').whereIn('id', ids)) as { relPath: string; folder: string }[]
  }
}

beforeEach(async () => {
  ;({ db, cleanup } = await makeTempDb())
  await new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  folders = new FolderRepo(db, () => 1)
})
afterEach(async () => { await cleanup() })

describe('FolderRepo', () => {
  it('create inserts the path and all ancestors', async () => {
    await folders.create('AS-1', '凭证/聊天/2024')
    expect(await folders.list('AS-1')).toEqual(['凭证', '凭证/聊天', '凭证/聊天/2024'])
  })

  it('rename rewrites the folder subtree and material folders', async () => {
    await folders.create('AS-1', '凭证/聊天')
    const mid = await materials.add({ aftersaleNo: 'AS-1', name: 'x', relPath: 'AS-1/images/x.jpg', folder: '凭证/聊天', thumbPath: null })
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

  it('rename rewrites material rel_path and returns the disk moves', async () => {
    await folders.create('AS-1', '凭证/聊天')
    const mid = await materials.add({ aftersaleNo: 'AS-1', name: 'x', relPath: 'AS-1/凭证/聊天/x.jpg', folder: '凭证/聊天', thumbPath: null })
    const moves = await folders.rename('AS-1', '凭证', '证据')
    expect((await materials.getByIds([mid]))[0].folder).toBe('证据/聊天')
    expect((await materials.getByIds([mid]))[0].relPath).toBe('AS-1/证据/聊天/x.jpg')
    expect(moves).toEqual([{ oldRelPath: 'AS-1/凭证/聊天/x.jpg', newRelPath: 'AS-1/证据/聊天/x.jpg' }])
  })

  it('rename falls back to current basename for legacy materials with empty name', async () => {
    await folders.create('AS-1', '凭证')
    const mid = await materials.add({ aftersaleNo: 'AS-1', name: '', relPath: 'AS-1/images/legacy.jpg', folder: '凭证', thumbPath: null })
    const moves = await folders.rename('AS-1', '凭证', '证据')
    expect((await materials.getByIds([mid]))[0].relPath).toBe('AS-1/证据/legacy.jpg')
    expect(moves).toEqual([{ oldRelPath: 'AS-1/images/legacy.jpg', newRelPath: 'AS-1/证据/legacy.jpg' }])
  })

  it('rename rejects when two materials would collide at the same rel_path', async () => {
    await folders.create('AS-1', '凭证')
    // legacy material: empty name, basename is legacy.jpg
    await materials.add({ aftersaleNo: 'AS-1', name: '', relPath: 'AS-1/images/legacy.jpg', folder: '凭证', thumbPath: null })
    // named material: name='legacy', ext=.jpg — after rename both would map to AS-1/证据/legacy.jpg
    await materials.add({ aftersaleNo: 'AS-1', name: 'legacy', relPath: 'AS-1/凭证/legacy.jpg', folder: '凭证', thumbPath: null })
    await expect(folders.rename('AS-1', '凭证', '证据')).rejects.toThrow(/重名/)
  })

  it('move reparents a folder subtree (and its materials) under a new parent', async () => {
    await folders.create('AS-1', '凭证/聊天')
    await folders.create('AS-1', '物流')
    const mid = await materials.add({ aftersaleNo: 'AS-1', name: 'x', relPath: 'AS-1/凭证/聊天/x.jpg', folder: '凭证/聊天', thumbPath: null })
    const moves = await folders.move('AS-1', '凭证/聊天', '物流')
    expect((await folders.list('AS-1')).sort()).toEqual(['凭证', '物流', '物流/聊天'])
    expect((await materials.getByIds([mid]))[0].folder).toBe('物流/聊天')
    expect((await materials.getByIds([mid]))[0].relPath).toBe('AS-1/物流/聊天/x.jpg')
    expect(moves).toEqual([{ oldRelPath: 'AS-1/凭证/聊天/x.jpg', newRelPath: 'AS-1/物流/聊天/x.jpg' }])
  })

  it('move to root keeps the leaf name', async () => {
    await folders.create('AS-1', '凭证/聊天')
    await folders.move('AS-1', '凭证/聊天', '')
    expect((await folders.list('AS-1')).sort()).toEqual(['凭证', '聊天'])
  })

  it('move rejects dropping a folder into itself or a descendant', async () => {
    await folders.create('AS-1', '凭证/聊天')
    await expect(folders.move('AS-1', '凭证', '凭证')).rejects.toThrow()
    await expect(folders.move('AS-1', '凭证', '凭证/聊天')).rejects.toThrow()
  })

  it('move rejects a name clash in the target parent', async () => {
    await folders.create('AS-1', '凭证/聊天')
    await folders.create('AS-1', '物流/聊天')
    await expect(folders.move('AS-1', '凭证/聊天', '物流')).rejects.toThrow()
  })

  it('remove deletes the subtree and returns affected materials', async () => {
    await folders.create('AS-1', '凭证/聊天')
    await folders.create('AS-1', '物流')
    const inSub = await materials.add({ aftersaleNo: 'AS-1', name: 'a', relPath: 'AS-1/images/a.jpg', folder: '凭证/聊天', thumbPath: 'AS-1/thumb/a.jpg' })
    const outside = await materials.add({ aftersaleNo: 'AS-1', name: 'b', relPath: 'AS-1/images/b.jpg', folder: '物流', thumbPath: null })
    const affected = await folders.remove('AS-1', '凭证')
    expect(affected).toEqual([{ relPath: 'AS-1/images/a.jpg', thumbPath: 'AS-1/thumb/a.jpg' }])
    expect(await folders.list('AS-1')).toEqual(['物流'])
    expect(await materials.getByIds([inSub])).toEqual([])
    expect((await materials.getByIds([outside]))[0].folder).toBe('物流')
  })
})
