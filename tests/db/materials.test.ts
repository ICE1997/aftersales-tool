import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Knex } from 'knex'
import { makeTempDb } from './helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'

let db: Knex
let materials: MaterialRepo
let cleanup: () => Promise<void>

beforeEach(async () => {
  ;({ db, cleanup } = await makeTempDb())
  await new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  materials = new MaterialRepo(db)
})
afterEach(async () => { await cleanup() })

describe('MaterialRepo', () => {
  it('adds and lists materials for a ticket', async () => {
    await materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 5, sizeBytes: 100, thumbPath: null })
    const list = await materials.listByTicket('AS-1')
    expect(list.length).toBe(1)
    expect(list[0].relPath).toBe('AS-1/images/a.jpg')
    expect(list[0].id).toBeGreaterThan(0)
  })

  it('rejects duplicate relPath', async () => {
    const m = { aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image' as const, capturedAt: null, importedAt: 5, sizeBytes: 100, thumbPath: null }
    await materials.add(m)
    await expect(materials.add(m)).rejects.toThrow()
  })

  it('updates thumbPath', async () => {
    const id = await materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/videos/v.mp4', kind: 'video', capturedAt: null, importedAt: 5, sizeBytes: 200, thumbPath: null })
    await materials.setThumb(id, '.thumbnails/v.jpg')
    expect((await materials.listByTicket('AS-1'))[0].thumbPath).toBe('.thumbnails/v.jpg')
  })

  it('deletes a material', async () => {
    const id = await materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 5, sizeBytes: 100, thumbPath: null })
    await materials.remove(id)
    expect((await materials.listByTicket('AS-1')).length).toBe(0)
  })

  it('stores and returns a custom name', async () => {
    const id = await materials.add({ aftersaleNo: 'AS-1', name: '聊天截图', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 5, sizeBytes: 100, thumbPath: null })
    expect((await materials.getByIds([id]))[0].name).toBe('聊天截图')
    expect((await materials.listByTicket('AS-1'))[0].name).toBe('聊天截图')
  })

  it('defaults name to empty string when omitted', async () => {
    const id = await materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/b.jpg', kind: 'image', capturedAt: null, importedAt: 5, sizeBytes: 100, thumbPath: null })
    expect((await materials.getByIds([id]))[0].name).toBe('')
  })

  it('stores folder (default empty) and moves a material', async () => {
    const id = await materials.add({ aftersaleNo: 'AS-1', name: 'a', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    expect((await materials.getByIds([id]))[0].folder).toBe('')
    const id2 = await materials.add({ aftersaleNo: 'AS-1', name: 'b', relPath: 'AS-1/images/b.jpg', kind: 'image', folder: '凭证', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    expect((await materials.getByIds([id2]))[0].folder).toBe('凭证')
    await materials.setFolder(id, '凭证/聊天')
    expect((await materials.getByIds([id]))[0].folder).toBe('凭证/聊天')
  })
})
