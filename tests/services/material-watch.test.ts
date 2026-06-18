import { it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MaterialWatcher } from '../../src/main/services/material-watch'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'vh-w-')); mkdirSync(join(root, 'AS-1'), { recursive: true }) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

it('debounces filesystem changes into a single onChange(no)', async () => {
  const onChange = vi.fn()
  const w = new MaterialWatcher(root, onChange, 50)
  w.watch('AS-1')
  writeFileSync(join(root, 'AS-1', 'a.txt'), '1')
  writeFileSync(join(root, 'AS-1', 'b.txt'), '2')
  await new Promise((r) => setTimeout(r, 150))
  w.unwatch()
  expect(onChange).toHaveBeenCalledWith('AS-1')
  expect(onChange.mock.calls.length).toBeLessThanOrEqual(2)
})
