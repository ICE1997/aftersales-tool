import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Exporter } from '../../src/main/services/exporter'

let root: string
let out: string
let exporter: Exporter

function makeFile(root: string, relPath: string): void {
  const abs = join(root, relPath)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, 'data-' + relPath)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vh-exp-'))
  out = mkdtempSync(join(tmpdir(), 'vh-out-'))
  exporter = new Exporter(root)
})
afterEach(() => { rmSync(root, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }) })

describe('Exporter', () => {
  it('copies materials to a target folder', async () => {
    makeFile(root, 'AS-1/images/a.jpg')
    await exporter.toFolder(['AS-1/images/a.jpg'], out)
    expect(existsSync(join(out, 'images', 'a.jpg'))).toBe(true)
  })

  it('dedups same-basename files when exporting to a folder', async () => {
    makeFile(root, 'AS-1/images/a.jpg')
    makeFile(root, 'AS-2/images/a.jpg')
    await exporter.toFolder(['AS-1/images/a.jpg', 'AS-2/images/a.jpg'], out)
    expect(existsSync(join(out, 'images', 'a.jpg'))).toBe(true)
    expect(existsSync(join(out, 'images', 'a-1.jpg'))).toBe(true)
  })

  it('zip contains the expected entry with correct content', async () => {
    makeFile(root, 'AS-1/images/a.jpg')
    const zipPath = join(out, 'pack.zip')
    await exporter.toZip(['AS-1/images/a.jpg'], zipPath)
    expect(existsSync(zipPath)).toBe(true)
    const listing = execSync(`unzip -l "${zipPath}"`).toString()
    expect(listing).toContain('a.jpg')
    const content = execSync(`unzip -p "${zipPath}" images/a.jpg`).toString()
    expect(content).toBe('data-AS-1/images/a.jpg')
  })

  it('dedups same-basename entries when zipping', async () => {
    makeFile(root, 'AS-1/images/a.jpg')
    makeFile(root, 'AS-2/images/a.jpg')
    const zipPath = join(out, 'pack.zip')
    await exporter.toZip(['AS-1/images/a.jpg', 'AS-2/images/a.jpg'], zipPath)
    const listing = execSync(`unzip -l "${zipPath}"`).toString()
    expect(listing).toContain('a.jpg')
    expect(listing).toContain('a-1.jpg')
  })

  it('creates selected (empty) folders when exporting to a folder', async () => {
    await exporter.toFolder([], out, ['空目录', '凭证/聊天'])
    expect(existsSync(join(out, '空目录'))).toBe(true)
    expect(existsSync(join(out, '凭证', '聊天'))).toBe(true)
  })

  it('includes selected empty folders as directory entries in the zip', async () => {
    const zipPath = join(out, 'pack.zip')
    await exporter.toZip([], zipPath, ['evidence']) // ASCII: `unzip -l` mangles non-ASCII names in its listing
    const listing = execSync(`unzip -l "${zipPath}"`).toString()
    expect(listing).toContain('evidence/')
  })

  it('rejects when a material file is missing', async () => {
    await expect(exporter.toZip(['AS-1/images/ghost.jpg'], join(out, 'p.zip'))).rejects.toBeTruthy()
  })
})
