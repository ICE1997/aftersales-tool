import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Material } from '../../src/shared/types'
import { Exporter } from '../../src/main/services/exporter'

let root: string
function mat(relPath: string, folder: string): Material {
  return { id: 0, aftersaleNo: 'AS-1', name: '', relPath, kind: 'image', capturedAt: null, importedAt: 1, sizeBytes: 1, thumbPath: null, folder }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-exp-'))
  mkdirSync(join(root, 'data', 'AS-1', 'images'), { recursive: true })
  writeFileSync(join(root, 'data', 'AS-1', 'images', 'a.jpg'), 'a')
  writeFileSync(join(root, 'data', 'AS-1', 'images', 'b.jpg'), 'b')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('Exporter.toFolder preserves the folder hierarchy', () => {
  it('writes files into per-folder subdirectories', async () => {
    const ex = new Exporter(join(root, 'data'))
    const out = join(root, 'out')
    await ex.toFolder([mat('AS-1/images/a.jpg', '凭证/聊天'), mat('AS-1/images/b.jpg', '')], out)
    expect(existsSync(join(out, '凭证', '聊天', 'a.jpg'))).toBe(true)
    expect(existsSync(join(out, 'b.jpg'))).toBe(true)
  })

  it('dedupes same-name files within the same destination folder', async () => {
    const ex = new Exporter(join(root, 'data'))
    const out = join(root, 'out')
    await ex.toFolder([mat('AS-1/images/a.jpg', 'dup'), mat('AS-1/images/a.jpg', 'dup')], out)
    const files = readdirSync(join(out, 'dup')).sort()
    expect(files).toEqual(['a-1.jpg', 'a.jpg'])
  })
})
