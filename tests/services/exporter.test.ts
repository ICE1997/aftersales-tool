import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Material } from '../../src/shared/types'
import { Exporter } from '../../src/main/services/exporter'

let root: string
let out: string
let exporter: Exporter

function material(relPath: string): Material {
  const abs = join(root, relPath)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, 'data-' + relPath)
  return { id: 1, aftersaleNo: 'AS-1', relPath, kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 5, thumbPath: null }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-exp-'))
  out = mkdtempSync(join(tmpdir(), 'vh-out-'))
  exporter = new Exporter(root)
})
afterEach(() => { rmSync(root, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }) })

describe('Exporter', () => {
  it('copies materials to a target folder', async () => {
    const m = material('AS-1/images/a.jpg')
    await exporter.toFolder([m], out)
    expect(existsSync(join(out, 'a.jpg'))).toBe(true)
  })

  it('dedups same-basename files when exporting to a folder', async () => {
    const m1 = material('AS-1/images/a.jpg')
    const m2 = material('AS-2/images/a.jpg')
    await exporter.toFolder([m1, m2], out)
    expect(existsSync(join(out, 'a.jpg'))).toBe(true)
    expect(existsSync(join(out, 'a-1.jpg'))).toBe(true)
  })

  it('produces a non-empty zip archive', async () => {
    const m = material('AS-1/images/a.jpg')
    const zipPath = join(out, 'pack.zip')
    await exporter.toZip([m], zipPath)
    expect(existsSync(zipPath)).toBe(true)
    expect(statSync(zipPath).size).toBeGreaterThan(0)
  })
})
