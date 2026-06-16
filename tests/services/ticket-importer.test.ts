import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { parseXlsx } from '../../src/main/services/ticket-importer'

let dir: string | null = null
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = null } })

function writeBook(rows: string[][]): string {
  dir = mkdtempSync(join(tmpdir(), 'imp-'))
  const file = join(dir, 'book.xlsx')
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, file)
  return file
}

describe('parseXlsx', () => {
  it('reads the first sheet into a string matrix with the header row first', () => {
    const file = writeBook([['售后编号', '订单编号'], ['AS1', 'O1'], ['AS2', 'O2']])
    const m = parseXlsx(file)
    expect(m[0]).toEqual(['售后编号', '订单编号'])
    expect(m[1]).toEqual(['AS1', 'O1'])
    expect(m[2][0]).toBe('AS2')
  })
})
