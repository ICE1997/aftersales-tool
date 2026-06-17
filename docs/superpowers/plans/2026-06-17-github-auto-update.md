# 基于 GitHub 的检查更新 / 自动更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手动触发的 GitHub 更新:Windows 完整自动更新(下载+重启安装),macOS 仅检查并跳转 Release 页(未签名),通过 GitHub Actions 打 tag 自动发布。

**Architecture:** 依赖注入的核心控制器 `src/main/updater.ts`(可单测,不绑 electron 运行时值);`menu.ts` 加「检查更新…」;`index.ts` 用真实 `autoUpdater`/`dialog`/`shell` 构造控制器并接线菜单;`package.json` 加 `electron-updater` + `publish`;新增 `release.yml`。

**Tech Stack:** Electron(main)、electron-updater、electron-builder、GitHub Actions、Vitest。

**ABI 提示:** 跑 vitest 前若报 `NODE_MODULE_VERSION`,先 `npm run rebuild:node`。

---

## File Structure
- **Create:** `src/main/updater.ts`、`tests/main/updater.test.ts`、`.github/workflows/release.yml`。
- **Modify:** `src/main/menu.ts`(+`onCheckUpdate`)、`tests/main/menu.test.ts`(断言「检查更新…」)、`src/main/index.ts`(接线)、`package.json`(deps + publish)。

---

## Task 1: 更新控制器 `updater.ts` + 单测

**Files:** Create `src/main/updater.ts`, `tests/main/updater.test.ts`

> 注意:`updater.ts` **不** import electron 或 electron-updater(全部依赖注入、用结构化类型),因此本任务在尚未安装 electron-updater 时也能编译/测试通过。

- [ ] **Step 1: 写失败测试** — `tests/main/updater.test.ts`
```ts
import { describe, it, expect } from 'vitest'
import { createUpdateController } from '../../src/main/updater'

const flush = () => new Promise((r) => setTimeout(r, 0))

class FakeAuto {
  autoDownload = true
  listeners: Record<string, ((...a: any[]) => void)[]> = {}
  checks = 0; downloads = 0; installs = 0
  on(e: string, cb: (...a: any[]) => void) { (this.listeners[e] ||= []).push(cb) }
  emit(e: string, ...a: any[]) { (this.listeners[e] || []).forEach((f) => f(...a)) }
  async checkForUpdates() { this.checks++ }
  async downloadUpdate() { this.downloads++ }
  quitAndInstall() { this.installs++ }
}
function makeDialog(response = 1) {
  const messages: string[] = []
  const errors: [string, string][] = []
  return {
    messages, errors,
    showMessageBox: async (o: any) => { messages.push(String(o.message)); return { response } },
    showErrorBox: (t: string, c: string) => { errors.push([t, c]) },
  }
}
function makeShell() {
  const opened: string[] = []
  return { opened, openExternal: async (u: string) => { opened.push(u); return undefined } }
}
const URL = 'https://github.com/ICE1997/aftersales-tool/releases/latest'
const base = (over: any = {}) => ({
  autoUpdater: new FakeAuto(), dialog: makeDialog(), shell: makeShell(),
  platform: 'win32' as NodeJS.Platform, isPackaged: true, releasePageUrl: URL, ...over,
})

describe('createUpdateController', () => {
  it('dev (not packaged): warns and never calls autoUpdater', async () => {
    const d = base({ isPackaged: false })
    await createUpdateController(d).checkForUpdates()
    expect(d.dialog.messages).toContain('开发模式不支持检查更新')
    expect(d.autoUpdater.checks).toBe(0)
  })
  it('packaged: sets autoDownload=false and checks once', async () => {
    const d = base()
    await createUpdateController(d).checkForUpdates()
    expect(d.autoUpdater.autoDownload).toBe(false)
    expect(d.autoUpdater.checks).toBe(1)
  })
  it('mac update-available + confirm → opens release page, no download', async () => {
    const d = base({ platform: 'darwin', dialog: makeDialog(1) })
    const c = createUpdateController(d)
    await c.checkForUpdates()
    d.autoUpdater.emit('update-available', { version: '9.9.9' })
    await flush()
    expect(d.shell.opened).toEqual([URL])
    expect(d.autoUpdater.downloads).toBe(0)
  })
  it('mac update-available + cancel → does not open', async () => {
    const d = base({ platform: 'darwin', dialog: makeDialog(0) })
    const c = createUpdateController(d)
    await c.checkForUpdates()
    d.autoUpdater.emit('update-available', { version: '9.9.9' })
    await flush()
    expect(d.shell.opened).toEqual([])
  })
  it('win update-available + confirm → downloads; downloaded + confirm → quitAndInstall', async () => {
    const d = base({ platform: 'win32', dialog: makeDialog(1) })
    const c = createUpdateController(d)
    await c.checkForUpdates()
    d.autoUpdater.emit('update-available', { version: '1.2.3' })
    await flush()
    expect(d.autoUpdater.downloads).toBe(1)
    d.autoUpdater.emit('update-downloaded', { version: '1.2.3' })
    await flush()
    expect(d.autoUpdater.installs).toBe(1)
  })
  it('update-not-available → 已是最新版本', async () => {
    const d = base()
    const c = createUpdateController(d)
    await c.checkForUpdates()
    d.autoUpdater.emit('update-not-available', {})
    await flush()
    expect(d.dialog.messages).toContain('已是最新版本')
  })
  it('error → showErrorBox with message', async () => {
    const d = base()
    const c = createUpdateController(d)
    await c.checkForUpdates()
    d.autoUpdater.emit('error', new Error('boom'))
    await flush()
    expect(d.dialog.errors.some(([, c]) => c.includes('boom'))).toBe(true)
  })
  it('repeated checks register listeners once', async () => {
    const d = base()
    const c = createUpdateController(d)
    await c.checkForUpdates()
    await c.checkForUpdates()
    d.autoUpdater.emit('update-not-available', {})
    await flush()
    expect(d.dialog.messages.filter((m) => m === '已是最新版本')).toHaveLength(1)
  })
})
```
Run: `npm run rebuild:node && npx vitest run tests/main/updater.test.ts` → FAIL (module missing).

- [ ] **Step 2: 实现** — `src/main/updater.ts`
```ts
// No electron / electron-updater imports — all deps are injected (structural types),
// so this is unit-testable in plain node and compiles before electron-updater is installed.

interface MessageBoxOpts {
  type?: string; title?: string; message?: string; detail?: string
  buttons?: string[]; defaultId?: number; cancelId?: number
}

export interface UpdaterAutoUpdater {
  autoDownload: boolean
  on(event: string, listener: (...args: any[]) => void): void
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}
export interface UpdaterDialog {
  showMessageBox(opts: MessageBoxOpts): Promise<{ response: number }>
  showErrorBox(title: string, content: string): void
}
export interface UpdateDeps {
  autoUpdater: UpdaterAutoUpdater
  dialog: UpdaterDialog
  shell: { openExternal(url: string): Promise<unknown> }
  platform: NodeJS.Platform
  isPackaged: boolean
  releasePageUrl: string
}
export interface UpdateController { checkForUpdates(): Promise<void> }

export function createUpdateController(deps: UpdateDeps): UpdateController {
  const { autoUpdater, dialog, shell, platform, isPackaged, releasePageUrl } = deps
  let wired = false

  const confirm = async (message: string): Promise<boolean> => {
    const { response } = await dialog.showMessageBox({
      type: 'info', message, buttons: ['取消', '确定'], defaultId: 1, cancelId: 0,
    })
    return response === 1
  }

  const wire = () => {
    if (wired) return
    wired = true
    autoUpdater.on('update-available', (info: { version?: string }) => {
      const v = info?.version ?? ''
      if (platform === 'darwin') {
        void confirm(`发现新版本 v${v},前往下载?`).then((ok) => { if (ok) void shell.openExternal(releasePageUrl) })
      } else {
        void confirm(`发现新版本 v${v},是否下载?`).then((ok) => { if (ok) void autoUpdater.downloadUpdate() })
      }
    })
    autoUpdater.on('update-not-available', () => {
      void dialog.showMessageBox({ type: 'info', message: '已是最新版本', buttons: ['好的'] })
    })
    autoUpdater.on('download-progress', (p: unknown) => { console.log('[updater] download-progress', p) })
    autoUpdater.on('update-downloaded', () => {
      void confirm('新版本已下载完成,立即重启安装?').then((ok) => { if (ok) autoUpdater.quitAndInstall() })
    })
    autoUpdater.on('error', (err: unknown) => {
      dialog.showErrorBox('检查更新失败', String((err as Error)?.message ?? err))
    })
  }

  return {
    async checkForUpdates() {
      if (!isPackaged) {
        await dialog.showMessageBox({ type: 'info', message: '开发模式不支持检查更新', buttons: ['好的'] })
        return
      }
      autoUpdater.autoDownload = false
      wire()
      await autoUpdater.checkForUpdates()
    },
  }
}
```

- [ ] **Step 3: 跑测试** — `npx vitest run tests/main/updater.test.ts` → 8/8 PASS。

- [ ] **Step 4: Commit**
```bash
git add src/main/updater.ts tests/main/updater.test.ts
git commit -m "feat(updater): GitHub update controller (win auto-install, mac open-release)"
```

---

## Task 2: 菜单加「检查更新…」

**Files:** Modify `src/main/menu.ts`, `tests/main/menu.test.ts`

- [ ] **Step 1: 写失败测试** — 在 `tests/main/menu.test.ts` 的 `describe('menuTemplate', ...)` 内追加(`describe` 结束的 `})` 之前):
```ts
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
```
Run: `npx vitest run tests/main/menu.test.ts` → 新用例 FAIL。

- [ ] **Step 2: 实现** — `src/main/menu.ts`
1. 签名加第三参 `onCheckUpdate`:
```ts
export function menuTemplate(
  opts: { isMac: boolean; isDev: boolean },
  onAbout: () => void = () => {},
  onCheckUpdate: () => void = () => {}
): MenuItemConstructorOptions[] {
```
2. mac 应用菜单:在「关于售后酱」之后插入「检查更新…」+ 分隔符。把现有 mac 块的 submenu 头部改为:
```ts
      submenu: [
        { label: '关于售后酱', role: 'about' },
        { type: 'separator' },
        { label: '检查更新…', click: onCheckUpdate },
        { type: 'separator' },
        { label: '服务', role: 'services' },
```
(其余 mac submenu 项不变。)
3. 「帮助」submenu 改为含「检查更新…」(在「关于售后酱」之上 + 分隔符):
```ts
  t.push({
    label: '帮助',
    submenu: [
      { label: '检查更新…', click: onCheckUpdate },
      { type: 'separator' },
      { label: '关于售后酱', click: onAbout }
    ]
  })
```
4. `buildAppMenu` 接收并透传 `onCheckUpdate`:
```ts
export function buildAppMenu(onCheckUpdate: () => void): Menu {
  return Menu.buildFromTemplate(
    menuTemplate(
      { isMac: process.platform === 'darwin', isDev: !app.isPackaged },
      () => app.showAboutPanel(),
      onCheckUpdate
    )
  )
}
```

- [ ] **Step 3: 跑测试** — `npx vitest run tests/main/menu.test.ts` → 全 PASS(含原「全中文」断言:`…` 非 ASCII 字母,通过)。

- [ ] **Step 4: Commit**
```bash
git add src/main/menu.ts tests/main/menu.test.ts
git commit -m "feat(menu): add 检查更新… to help + mac app menu"
```

---

## Task 3: 安装 electron-updater + publish 配置 + 接线 index.ts

**Files:** Modify `package.json`, `src/main/index.ts`

- [ ] **Step 1: 安装依赖**
```bash
npm install electron-updater
```
确认 `package.json` 的 `dependencies` 出现 `electron-updater`。

- [ ] **Step 2: 加 publish 配置** — `package.json` 的 `build` 对象内,新增一个键(与 `appId` 等平级):
```json
    "publish": { "provider": "github", "owner": "ICE1997", "repo": "aftersales-tool" },
```
(放在 `"appId": "com.shouhoujiang.app",` 之后即可。)

- [ ] **Step 3: 接线** — `src/main/index.ts`
1. 顶部 import:把 `shell` 加入 electron 导入,并引入 updater:
```ts
import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { createUpdateController } from './updater'
```
2. 在 `app.whenReady().then(async () => { ... })` 内,`registerIpc` 成功后、`createWindow()` 之前,把现有的:
```ts
  Menu.setApplicationMenu(buildAppMenu())
  createWindow()
```
替换为:
```ts
  const updater = createUpdateController({
    autoUpdater,
    dialog,
    shell,
    platform: process.platform,
    isPackaged: app.isPackaged,
    releasePageUrl: 'https://github.com/ICE1997/aftersales-tool/releases/latest'
  })
  Menu.setApplicationMenu(buildAppMenu(() => { void updater.checkForUpdates() }))
  createWindow()
```
(`app.setAboutPanelOptions({...})` 一行保持不变,仍在其上方。)

- [ ] **Step 4: 验证**
Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "src/main/(index|updater|menu)\.ts" | grep -vE "Cannot find (name|module).*(node:|Buffer|process|console|__dirname|require)"` → 无真实错误。
Run: `npm run build` → success。
Run: `npm run rebuild:node && npx vitest run` → 0 failures(汇报数量)。

- [ ] **Step 5: Commit**
```bash
git add package.json package-lock.json src/main/index.ts
git commit -m "feat(updater): install electron-updater, github publish config, wire menu"
```

---

## Task 4: 发布工作流 `release.yml`

**Files:** Create `.github/workflows/release.yml`

- [ ] **Step 1: 创建** — `.github/workflows/release.yml`
```yaml
name: Release (tag)

# 推送 vX.Y.Z tag 时，在 Windows + macOS 上构建并发布到该 tag 的 GitHub Release。
# 发布流程：改 package.json version → 提交 → 打同名 tag vX.Y.Z（须与 version 一致）
#           → git push --tags → 本 workflow 自动构建并发布。
on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    strategy:
      fail-fast: false
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      # electron-vite build（含 TS 检查）+ electron-builder（按宿主 OS 选 nsis / dmg）
      # --publish always：把安装包与 latest(-mac).yml 更新清单发布到该 tag 的 Release。
      - name: Build & publish
        run: npm run dist -- --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # 关闭 mac 代码签名发现（未签名构建；与 package.json identity:null 一致）。
          CSC_IDENTITY_AUTO_DISCOVERY: false
```

- [ ] **Step 2: 校验 YAML** — 文件可被解析(无 tab 缩进、键拼写正确)。`grep -n "publish always" .github/workflows/release.yml` 确认存在。

- [ ] **Step 3: Commit**
```bash
git add .github/workflows/release.yml
git commit -m "ci: release workflow — tag-triggered build & publish (win+mac)"
```

---

## 手验清单
- **dev**:`npm run rebuild:electron && npm run dev` → 菜单「帮助 → 检查更新…」弹「开发模式不支持检查更新」。菜单仍全中文。
- **打包(本地 dmg)**:`npm run dist` 出未签名 dmg;安装后点「检查更新…」:无新版本→「已是最新版本」(需 Release 中有 `latest-mac.yml`)。
- **发布链路**:改 version→打 tag→push→CI 在 Release 产出 `.exe`+`latest.yml`、`.dmg`+`latest-mac.yml`。
- **win 自动更新**:旧版本点「检查更新…」→「发现新版本」→ 下载 →「立即重启安装」→ 重启后为新版本。
- 验证后 `npm run rebuild:node` 还原 ABI。

---

## Self-Review(已核对 spec)
- **§2.1 updater.ts(注入式控制器 / dev 早返回 / autoDownload=false / 平台分支 / 幂等监听 / 各事件)**:Task 1。✓
- **§2.2 menu.ts(onCheckUpdate;帮助 + mac 应用菜单加「检查更新…」)**:Task 2。✓
- **§2.3 index.ts(autoUpdater/shell 接线、releasePageUrl、不做启动自动检查)**:Task 3 Step 3。✓
- **§2.4 package.json(electron-updater dep + github publish)**:Task 3 Step 1-2。✓
- **§2.5 release.yml(tag 触发、win+mac matrix、--publish always、GH_TOKEN、mac 关签名;保留 build-windows.yml)**:Task 4。✓
- **§5 测试(控制器 8 用例 + 菜单 2 用例)**:Task 1 / Task 2。✓
- **类型一致**:`createUpdateController`/`UpdateDeps`/`UpdateController`/`menuTemplate(opts,onAbout,onCheckUpdate)`/`buildAppMenu(onCheckUpdate)` 全程一致;index.ts 调用匹配。✓
- **占位符扫描**:无 TBD;每步完整代码/配置。✓
- **YAGNI**:无启动自动检查、无渲染 UI/进度条、无 mac 签名、无多通道、不自动 bump 版本。✓
- **顺序依赖**:Task 1 不依赖 electron-updater 安装(注入式),可先做并独立测试;index.ts 的真实 import 在 Task 3 安装后才出现。✓
