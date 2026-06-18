import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Exporter } from '../../src/main/services/exporter'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-exp-'))
  mkdirSync(join(root, 'data', 'AS-1', '凭证', '聊天'), { recursive: true })
  mkdirSync(join(root, 'data', 'AS-1'), { recursive: true })
  writeFileSync(join(root, 'data', 'AS-1', '凭证', '聊天', 'a.jpg'), 'a')
  writeFileSync(join(root, 'data', 'AS-1', 'b.jpg'), 'b')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('Exporter.toFolder preserves the folder hierarchy', () => {
  it('writes files into per-folder subdirectories', async () => {
    const ex = new Exporter(join(root, 'data'))
    const out = join(root, 'out')
    await ex.toFolder(['AS-1/凭证/聊天/a.jpg', 'AS-1/b.jpg'], out)
    expect(existsSync(join(out, '凭证', '聊天', 'a.jpg'))).toBe(true)
    expect(existsSync(join(out, 'b.jpg'))).toBe(true)
  })

  it('dedupes same-name files within the same destination folder', async () => {
    const ex = new Exporter(join(root, 'data'))
    const out = join(root, 'out')
    mkdirSync(join(root, 'data', 'AS-1', 'dup'), { recursive: true })
    writeFileSync(join(root, 'data', 'AS-1', 'dup', 'a.jpg'), 'x')
    mkdirSync(join(root, 'data', 'AS-2', 'dup'), { recursive: true })
    writeFileSync(join(root, 'data', 'AS-2', 'dup', 'a.jpg'), 'y')
    await ex.toFolder(['AS-1/dup/a.jpg', 'AS-2/dup/a.jpg'], out)
    const files = readdirSync(join(out, 'dup')).sort()
    expect(files).toEqual(['a-1.jpg', 'a.jpg'])
  })
})
