import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { Thumbnailer } from '../../src/main/services/thumbnails'

let root: string
let t: Thumbnailer

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-th-'))
  mkdirSync(join(root, 'AS-1'), { recursive: true })
  t = new Thumbnailer(root)
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('thumbFor', () => {
  it('returns null for non-media without generating', async () => {
    expect(await t.thumbFor('AS-1/doc.pdf', 'other', 1, 1)).toBeNull()
  })

  it('caches by relPath+mtime+size — second call does not regenerate', async () => {
    // Create a real source image
    await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toFile(join(root, 'AS-1', 'x.png'))

    const mtime = Date.now()
    const size = 100

    // First call: generates the thumbnail
    const rel = await t.thumbFor('AS-1/x.png', 'image', mtime, size)
    expect(rel).not.toBeNull()
    expect(existsSync(join(root, rel!))).toBe(true)

    // Delete the source so regeneration would fail
    unlinkSync(join(root, 'AS-1', 'x.png'))

    // Second call with same args: must return same cached rel without re-reading the source
    const rel2 = await t.thumbFor('AS-1/x.png', 'image', mtime, size)
    expect(rel2).toBe(rel)
  })
})
