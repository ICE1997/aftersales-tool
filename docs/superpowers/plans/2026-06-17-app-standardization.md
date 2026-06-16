# 应用标准化(中文菜单/关于/标题)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给桌面应用一套全中文的原生外壳:自定义中文应用菜单、中文「关于」面板、窗口标题与应用名「售后酱」。

**Architecture:** 纯函数 `menuTemplate({isMac,isDev}, onAbout)` 生成菜单模板(可单测),`buildAppMenu()` 用 `Menu.buildFromTemplate` 实例化;`index.ts` 接线 `app.setName`/`setAboutPanelOptions`/`setApplicationMenu`/窗口 `title`;`index.html` 标题改纯名。

**Tech Stack:** Electron(main)、Vitest。

**ABI 提示:** 跑 vitest 前若报 `NODE_MODULE_VERSION`,先 `npm run rebuild:node`。

---

## File Structure
- **Create:** `src/main/menu.ts`(`menuTemplate` + `buildAppMenu`)、`tests/main/menu.test.ts`。
- **Modify:** `src/main/index.ts`(接线)、`src/renderer/index.html`(`<title>`)。

---

## Task 1: 中文菜单模板 + 构建器

**Files:** Create `src/main/menu.ts`, `tests/main/menu.test.ts`

- [ ] **Step 1: 写失败测试** — `tests/main/menu.test.ts`
```ts
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
    const t = menuTemplate({ isMac: false, isDev: false })
    expect(t[0].label).toBe('编辑')
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
})
```
Run: `npm run rebuild:node && npx vitest run tests/main/menu.test.ts` → FAIL (module missing).
> If vitest errors while importing `../../src/main/menu` because of its `import { app, Menu } from 'electron'` (electron resolves to a path string in node), add this to the TOP of the test file: `import { vi } from 'vitest'` and `vi.mock('electron', () => ({ app: {}, Menu: {} }))`. Only add it if the import actually errors — `menuTemplate` doesn't use those values.

- [ ] **Step 2: 实现** — `src/main/menu.ts`
```ts
import { app, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

/** Pure: build the Chinese application-menu template. No Electron runtime values used here
 * (electron is imported for `buildAppMenu` below), so this is unit-testable. */
export function menuTemplate(
  opts: { isMac: boolean; isDev: boolean },
  onAbout: () => void = () => {}
): MenuItemConstructorOptions[] {
  const { isMac, isDev } = opts
  const t: MenuItemConstructorOptions[] = []

  if (isMac) {
    t.push({
      label: '售后酱',
      submenu: [
        { label: '关于售后酱', role: 'about' },
        { type: 'separator' },
        { label: '服务', role: 'services' },
        { type: 'separator' },
        { label: '隐藏售后酱', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出售后酱', role: 'quit' }
      ]
    })
  }

  t.push({
    label: '编辑',
    submenu: [
      { label: '撤销', role: 'undo' },
      { label: '重做', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', role: 'cut' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' }
    ]
  })

  const view: MenuItemConstructorOptions[] = [
    { label: '重新加载', role: 'reload' },
    { label: '强制重新加载', role: 'forceReload' },
    { type: 'separator' },
    { label: '实际大小', role: 'resetZoom' },
    { label: '放大', role: 'zoomIn' },
    { label: '缩小', role: 'zoomOut' },
    { type: 'separator' },
    { label: '进入全屏', role: 'togglefullscreen' }
  ]
  if (isDev) view.push({ type: 'separator' }, { label: '开发者工具', role: 'toggleDevTools' })
  t.push({ label: '视图', submenu: view })

  t.push({
    label: '窗口',
    submenu: isMac
      ? [
          { label: '最小化', role: 'minimize' },
          { label: '缩放', role: 'zoom' },
          { type: 'separator' },
          { label: '关闭', role: 'close' }
        ]
      : [
          { label: '最小化', role: 'minimize' },
          { label: '关闭', role: 'close' }
        ]
  })

  t.push({
    label: '帮助',
    submenu: [{ label: '关于售后酱', click: onAbout }]
  })

  return t
}

export function buildAppMenu(): Menu {
  return Menu.buildFromTemplate(
    menuTemplate({ isMac: process.platform === 'darwin', isDev: !app.isPackaged }, () => app.showAboutPanel())
  )
}
```

- [ ] **Step 3: 跑测试** — `npm run rebuild:node && npx vitest run tests/main/menu.test.ts` → 6/6 PASS. Then `npx vitest run` → 0 failures.

- [ ] **Step 4: Commit**
```bash
git add src/main/menu.ts tests/main/menu.test.ts
git commit -m "feat(app): Chinese application-menu template + builder"
```

---

## Task 2: 接线 index.ts + 窗口标题

**Files:** Modify `src/main/index.ts`, `src/renderer/index.html`

- [ ] **Step 1: `src/main/index.ts`**
1. Imports — add `Menu` and the menu builder:
```ts
import { app, BrowserWindow, dialog, Menu } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { registerMediaScheme } from './media-protocol'
import { buildAppMenu } from './menu'
```
2. Right after the `registerMediaScheme()` call (module top, before `createWindow`), add:
```ts
app.setName('售后酱')
```
3. In `createWindow`, add `title: '售后酱'` to the `BrowserWindow` options (keep the rest):
```ts
  const win = new BrowserWindow({
    title: '售后酱',
    width: 1320,
    height: 820,
    minWidth: 1040,
    minHeight: 640,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
```
4. In `app.whenReady().then(async () => { ... })`, after the `registerIpc()` try/catch succeeds and BEFORE `createWindow()`, add the about-panel + menu setup:
```ts
  app.setAboutPanelOptions({
    applicationName: '售后酱',
    applicationVersion: app.getVersion(),
    copyright: '© 2026 售后酱'
  })
  Menu.setApplicationMenu(buildAppMenu())
  createWindow()
```
(So the `whenReady` body is: try { await registerIpc() } catch { … return }; setAboutPanelOptions; setApplicationMenu; createWindow.)

- [ ] **Step 2: `src/renderer/index.html`**
Change `<title>售后酱 · 售后材料管理</title>` → `<title>售后酱</title>`.

- [ ] **Step 3: 验证**
Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "src/main/(index|menu)\.ts" | grep -vE "Cannot find (name|module).*(node:|Buffer|process|console|__dirname|require)"` → no real errors.
Run: `npm run build` → success.
Run: `npm run rebuild:node && npx vitest run` → 0 failures (report counts).

- [ ] **Step 4: Commit**
```bash
git add src/main/index.ts src/renderer/index.html
git commit -m "feat(app): wire Chinese menu/about-panel; window title 售后酱"
```

---

## 手验清单(dev)
`npm run rebuild:electron && npm run dev`:
- 菜单栏全中文:售后酱(mac)/ 编辑 / 视图 / 窗口 / 帮助;无英文项。
- ⌘C/⌘V/⌘A(Win: Ctrl)在输入框与「新建材料」粘贴处生效。
- 帮助 →「关于售后酱」(mac 也可从应用菜单)弹出中文关于面板:售后酱 / 版本 0.1.0 / © 2026 售后酱。
- 标题栏显示「售后酱」;Dock/任务栏名为「售后酱」。
- 验证后 `npm run rebuild:node` 还原 ABI。

---

## Self-Review(已核对 spec)
- **§2.1 menu.ts(menuTemplate 纯函数 + buildAppMenu)**:Task 1。✓
- **§2.2 index.ts 接线(setName/setAboutPanelOptions/setApplicationMenu/title)**:Task 2 Step 1。✓
- **§2.3 index.html title**:Task 2 Step 2。✓
- **§3 菜单结构(各项 role + 中文 label;DevTools 仅 dev;帮助→关于)**:Task 1 Step 2 与测试。✓
- **§4 测试(menuTemplate 平台差异/DevTools/关于/全中文)**:Task 1 Step 1;手验 Task 2。✓
- **类型一致**:`menuTemplate(opts, onAbout)`、`buildAppMenu()`、`MenuItemConstructorOptions` 全程一致;index.ts 调 `buildAppMenu()`。✓
- **占位符扫描**:无 TBD;每步完整代码;vitest 的 electron-import 兜底已注明。✓
- **YAGNI**:无「检查更新」、无多语言、不改 React 界面。✓
