import { vi } from 'vitest'
vi.mock('electron', () => ({ app: {}, Menu: {} }))

import { describe, it, expect } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { menuTemplate } from '../../src/main/menu'

function labels(items: MenuItemConstructorOptions[]): string[] {
  const out: string[] = []
  for (const it of items) {
    if (typeof it.label === 'string') out.push(it.label)
    if (Array.isArray(it.submenu)) out.push(...labels(it.submenu as MenuItemConstructorOptions[]))
  }
  return out
}
function roles(items: MenuItemConstructorOptions[]): string[] {
  const out: string[] = []
  for (const it of items) {
    if (it.role) out.push(String(it.role))
    if (Array.isArray(it.submenu)) out.push(...roles(it.submenu as MenuItemConstructorOptions[]))
  }
  return out
}

describe('menuTemplate', () => {
  it('mac: first menu is the app name; has about + quit', () => {
    const t = menuTemplate({ isMac: true, isDev: false })
    expect(t[0].label).toBe('售后酱')
    const r = roles([t[0]])
    expect(r).toContain('about')
    expect(r).toContain('quit')
  })
  it('non-mac: no app menu; first menu is 编辑', () => {
    expect(menuTemplate({ isMac: false, isDev: false })[0].label).toBe('编辑')
  })
  it('edit menu has copy/paste/selectAll roles', () => {
    expect(roles(menuTemplate({ isMac: false, isDev: false }))).toEqual(expect.arrayContaining(['copy', 'paste', 'selectAll']))
  })
  it('DevTools only when isDev', () => {
    expect(roles(menuTemplate({ isMac: true, isDev: true }))).toContain('toggleDevTools')
    expect(roles(menuTemplate({ isMac: true, isDev: false }))).not.toContain('toggleDevTools')
  })
  it('help menu contains 关于售后酱', () => {
    expect(labels(menuTemplate({ isMac: false, isDev: false }))).toContain('关于售后酱')
  })
  it('all labels are Chinese (no ASCII letters)', () => {
    for (const l of labels(menuTemplate({ isMac: true, isDev: true }))) expect(l).not.toMatch(/[A-Za-z]/)
  })
  it('help menu contains 检查更新…', () => {
    expect(labels(menuTemplate({ isMac: false, isDev: false }))).toContain('检查更新…')
  })
  it('检查更新… click is the provided onCheckUpdate', () => {
    const fn = () => {}
    const t = menuTemplate({ isMac: false, isDev: false }, () => {}, fn)
    const help = t.find((m) => m.label === '帮助')!
    const item = (help.submenu as any[]).find((i) => i.label === '检查更新…')
    expect(item.click).toBe(fn)
  })
})
