import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureFolderDir, ensureRootDir, renameFolderDir } from '../../src/main/services/material-fs'
import { materialDir } from '../../src/main/services/paths'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'vh-mfs-')) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('material-fs', () => {
  it('ensureFolderDir creates the folder dir incl. ancestors + root; idempotent', () => {
    ensureFolderDir(root, 'AS1', 'a/b')
    expect(existsSync(materialDir(root, 'AS1', 'a/b'))).toBe(true)
    expect(existsSync(materialDir(root, 'AS1', 'a'))).toBe(true)
    expect(existsSync(materialDir(root, 'AS1', ''))).toBe(true)
    ensureFolderDir(root, 'AS1', 'a/b') // no throw on existing
    expect(existsSync(materialDir(root, 'AS1', 'a/b'))).toBe(true)
  })

  it('ensureRootDir creates the ticket root; idempotent', () => {
    ensureRootDir(root, 'AS2')
    expect(existsSync(materialDir(root, 'AS2', ''))).toBe(true)
    ensureRootDir(root, 'AS2')
    expect(existsSync(materialDir(root, 'AS2', ''))).toBe(true)
  })

  it('renameFolderDir moves files + empty subdirs; old gone, new present', () => {
    ensureFolderDir(root, 'AS3', 'old')
    ensureFolderDir(root, 'AS3', 'old/empty')
    writeFileSync(join(materialDir(root, 'AS3', 'old'), 'f.jpg'), 'x')
    renameFolderDir(root, 'AS3', 'old', 'new')
    expect(existsSync(materialDir(root, 'AS3', 'old'))).toBe(false)
    expect(existsSync(materialDir(root, 'AS3', 'new'))).toBe(true)
    expect(existsSync(join(materialDir(root, 'AS3', 'new'), 'f.jpg'))).toBe(true)
    expect(existsSync(materialDir(root, 'AS3', 'new/empty'))).toBe(true)
  })

  it('renameFolderDir falls back to ensure when the old dir is absent', () => {
    renameFolderDir(root, 'AS4', 'old', 'new')
    expect(existsSync(materialDir(root, 'AS4', 'new'))).toBe(true)
  })

  it('renameFolderDir is a no-op when oldPath === newPath', () => {
    ensureFolderDir(root, 'AS5', 'x')
    renameFolderDir(root, 'AS5', 'x', 'x')
    expect(existsSync(materialDir(root, 'AS5', 'x'))).toBe(true)
  })
})
