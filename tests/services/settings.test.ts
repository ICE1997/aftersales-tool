import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Settings } from '../../src/main/services/settings'

let configDir: string

beforeEach(() => { configDir = mkdtempSync(join(tmpdir(), 'vh-cfg-')) })
afterEach(() => { rmSync(configDir, { recursive: true, force: true }) })

describe('Settings', () => {
  it('falls back to a default data root when unset', () => {
    const s = new Settings(configDir, '/default/root')
    expect(s.getDataRoot()).toBe('/default/root')
  })

  it('persists data root across instances', () => {
    const root = mkdtempSync(join(tmpdir(), 'vh-data-'))
    new Settings(configDir, '/default/root').setDataRoot(root)
    expect(new Settings(configDir, '/default/root').getDataRoot()).toBe(root)
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects a non-existent data root', () => {
    const s = new Settings(configDir, '/default/root')
    expect(() => s.setDataRoot('/nope/does/not/exist')).toThrow()
  })

  it('creates config file on write', () => {
    const root = mkdtempSync(join(tmpdir(), 'vh-data-'))
    new Settings(configDir, '/default/root').setDataRoot(root)
    expect(existsSync(join(configDir, 'config.json'))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
})
