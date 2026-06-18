import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileTree } from '../../src/main/services/file-tree'

let root: string
let ft: FileTree
const NO = 'AS-1'
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'vh-ft-')); ft = new FileTree(root) })
afterEach(() => rmSync(root, { recursive: true, force: true }))

it('lists folders (incl empty) and files with derived metadata', () => {
  ft.createFolder(NO, '凭证/聊天')
  ft.addBytes(NO, 'a.png', Buffer.from('x'), '凭证')
  const { folders, materials } = ft.list(NO)
  expect(folders.sort()).toEqual(['凭证', '凭证/聊天'])
  expect(materials).toHaveLength(1)
  expect(materials[0].folder).toBe('凭证')
  expect(materials[0].kind).toBe('image')
  expect(materials[0].name).toBe('a.png')
})

it('skips dot-files/dirs when scanning', () => {
  mkdirSync(join(root, 'AS-1', '.git'), { recursive: true })
  writeFileSync(join(root, 'AS-1', '.DS_Store'), 'x')
  const { folders, materials } = ft.list(NO)
  expect(folders).toEqual([]); expect(materials).toEqual([])
})

it('dedupes a filename collision on addBytes', () => {
  const m1 = ft.addBytes(NO, 'a.png', Buffer.from('1'), '')
  const m2 = ft.addBytes(NO, 'a.png', Buffer.from('2'), '')
  expect(m1.name).toBe('a.png'); expect(m2.name).toBe('a-1.png')
})

it('moveMaterial moves the file and returns the new relPath', () => {
  ft.createFolder(NO, '凭证')
  const m = ft.addBytes(NO, 'a.png', Buffer.from('x'), '')
  const moved = ft.moveMaterial(NO, m.relPath, '凭证')
  expect(moved.folder).toBe('凭证')
  expect(existsSync(join(root, moved.relPath))).toBe(true)
  expect(existsSync(join(root, m.relPath))).toBe(false)
})

it('renameFolder / moveFolder cascade on disk; move rejects self/descendant/clash', () => {
  // Setup: create 凭证/聊天 and 物流, add a file under 凭证/聊天
  ft.createFolder(NO, '凭证/聊天')
  ft.createFolder(NO, '物流')
  ft.addBytes(NO, 'a.png', Buffer.from('x'), '凭证/聊天')

  // Move 凭证/聊天 → under 物流; should produce 物流/聊天
  ft.moveFolder(NO, '凭证/聊天', '物流')
  expect(ft.list(NO).folders.sort()).toEqual(['凭证', '物流', '物流/聊天'])

  // Reject moving a folder into its own descendant (self/descendant check)
  expect(() => ft.moveFolder(NO, '物流', '物流/聊天')).toThrow()

  // Reject clash: create 物流2/聊天, then try to move it into 物流 where 物流/聊天 already exists
  ft.createFolder(NO, '物流2/聊天')
  expect(() => ft.moveFolder(NO, '物流2/聊天', '物流')).toThrow()
})

it('removeFolder deletes the subtree; removeMaterial deletes the file', () => {
  ft.createFolder(NO, '凭证'); const m = ft.addBytes(NO, 'a.png', Buffer.from('x'), '凭证')
  ft.removeMaterial(m.relPath); expect(existsSync(join(root, m.relPath))).toBe(false)
  ft.removeFolder(NO, '凭证'); expect(ft.list(NO).folders).toEqual([])
})
