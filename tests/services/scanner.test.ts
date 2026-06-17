import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Knex } from 'knex'
import { makeTempDb } from '../db/helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { Scanner } from '../../src/main/services/scanner'

let root: string
let db: Knex
let materials: MaterialRepo
let scanner: Scanner
let cleanupDb: () => Promise<void>

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'vh-scan-'))
  ;({ db, cleanup: cleanupDb } = await makeTempDb())
  await new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  materials = new MaterialRepo(db)
  scanner = new Scanner(root, materials)
})
afterEach(async () => { rmSync(root, { recursive: true, force: true }); await cleanupDb() })

describe('Scanner', () => {
  it('drops material rows whose files no longer exist', async () => {
    mkdirSync(join(root, 'AS-1/images'), { recursive: true })
    writeFileSync(join(root, 'AS-1/images/a.jpg'), 'x')
    const id = await materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    await materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/gone.jpg', kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })

    const removed = await scanner.calibrateTicket('AS-1')
    expect(removed).toBe(1)
    const left = await materials.listByTicket('AS-1')
    expect(left.length).toBe(1)
    expect(left[0].id).toBe(id)
  })

  it('removes nothing when all files exist', async () => {
    mkdirSync(join(root, 'AS-1/images'), { recursive: true })
    writeFileSync(join(root, 'AS-1/images/a.jpg'), 'x')
    await materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    expect(await scanner.calibrateTicket('AS-1')).toBe(0)
    expect((await materials.listByTicket('AS-1')).length).toBe(1)
  })
})
