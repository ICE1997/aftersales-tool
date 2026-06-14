import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs'
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
})
