import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'better-sqlite3'
import { makeTempDb } from '../db/helpers'
import { TicketRepo } from '../../src/main/db/tickets'
import { MaterialRepo } from '../../src/main/db/materials'
import { Scanner } from '../../src/main/services/scanner'

let root: string
let db: Database
let materials: MaterialRepo
let scanner: Scanner
let cleanupDb: () => void

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'vh-scan-'))
  ;({ db, cleanup: cleanupDb } = await makeTempDb())
  new TicketRepo(db, () => 1).create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
  materials = new MaterialRepo(db)
  scanner = new Scanner(root, materials)
})
afterEach(() => { rmSync(root, { recursive: true, force: true }); cleanupDb() })

describe('Scanner', () => {
  it('drops material rows whose files no longer exist', () => {
    mkdirSync(join(root, 'AS-1/images'), { recursive: true })
    writeFileSync(join(root, 'AS-1/images/a.jpg'), 'x')
    const id = materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/gone.jpg', kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })

    const removed = scanner.calibrateTicket('AS-1')
    expect(removed).toBe(1)
    const left = materials.listByTicket('AS-1')
    expect(left.length).toBe(1)
    expect(left[0].id).toBe(id)
  })

  it('removes nothing when all files exist', () => {
    mkdirSync(join(root, 'AS-1/images'), { recursive: true })
    writeFileSync(join(root, 'AS-1/images/a.jpg'), 'x')
    materials.add({ aftersaleNo: 'AS-1', relPath: 'AS-1/images/a.jpg', kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null })
    expect(scanner.calibrateTicket('AS-1')).toBe(0)
    expect(materials.listByTicket('AS-1').length).toBe(1)
  })
})
