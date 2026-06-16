import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { Thumbnailer } from '../../src/main/services/thumbnails'

let root: string
let thumb: Thumbnailer

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-thumb-'))
  thumb = new Thumbnailer(root)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('Thumbnailer', () => {
  it('generates an image thumbnail and returns a rel path under .thumbnails', async () => {
    const src = join(root, 'a.png')
    await sharp({ create: { width: 50, height: 50, channels: 3, background: '#f00' } }).png().toFile(src)
    const rel = await thumb.forImage(src)
    expect(rel).not.toBeNull()
    expect(rel!.startsWith('.thumbnails/')).toBe(true)
    expect(existsSync(join(root, rel!))).toBe(true)
  })

  it('returns null when the image is unreadable', async () => {
    const bad = join(root, 'bad.png')
    writeFileSync(bad, 'not an image')
    const rel = await thumb.forImage(bad)
    expect(rel).toBeNull()
  })

  it('produces distinct thumb paths for same-basename images in different folders (collision regression)', async () => {
    // Two source paths with equal length that share the same basename.
    // Under the old srcName.length scheme both would produce the same thumb name.
    const dir1 = join(root, 'AS-1')
    const dir2 = join(root, 'AS-2')
    mkdirSync(dir1)
    mkdirSync(dir2)

    const src1 = join(dir1, 'photo.png')
    const src2 = join(dir2, 'photo.png')

    // Verify equal path lengths so this would collide under the old scheme
    expect(src1.length).toBe(src2.length)

    const pngBuf = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#0f0' } }).png().toBuffer()
    writeFileSync(src1, pngBuf)
    writeFileSync(src2, pngBuf)

    const rel1 = await thumb.forImage(src1)
    const rel2 = await thumb.forImage(src2)

    expect(rel1).not.toBeNull()
    expect(rel2).not.toBeNull()
    expect(rel1).not.toBe(rel2)
    expect(existsSync(join(root, rel1!))).toBe(true)
    expect(existsSync(join(root, rel2!))).toBe(true)
  })
})
