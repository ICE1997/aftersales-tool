# 基于 GitHub 的检查更新 / 自动更新 设计文档

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:桌面应用(售后酱)目前无更新机制。`electron-updater` 未安装;`package.json` 无 `publish` 配置;mac `identity: null`(未签名);仅有 `build-windows.yml`(`--publish never`)。

---

## 1. 概述

为应用增加**手动触发**的更新能力,更新源为 **GitHub Releases**:

- **触发方式**:仅手动 —「帮助」菜单(及 mac 应用菜单)新增「检查更新…」。无启动自动检查、无渲染层 UI,全部用原生 `dialog` 弹窗。
- **Windows**:完整自动更新(electron-updater 下载差分包 → 重启安装)。无需代码签名(用户首次安装时可能见 SmartScreen 提示)。
- **macOS**:仅「检查 + 跳转下载」。未签名的 mac 无法用 Squirrel.Mac 静默安装更新,因此发现新版本后弹窗并 `shell.openExternal` 打开 GitHub Release 页让用户手动下载新 dmg。
- **发布**:GitHub Actions 在推送 `v*` tag 时,在 Windows + macOS runner 上构建并 `electron-builder --publish always`,产物与 `latest.yml`/`latest-mac.yml` 更新清单一并发布到该 tag 的 Release。

---

## 2. 架构

### 2.1 核心控制器 `src/main/updater.ts`(依赖注入,可单测)

不在模块顶层硬绑 electron / electron-updater 的运行时值;依赖通过参数注入,使逻辑可在 vitest(node)单测。

```ts
export interface UpdateDeps {
  autoUpdater: {
    autoDownload: boolean
    on(event: string, cb: (...args: any[]) => void): void
    checkForUpdates(): Promise<unknown>
    downloadUpdate(): Promise<unknown>
    quitAndInstall(): void
  }
  dialog: {
    showMessageBox(opts: object): Promise<{ response: number }>
    showErrorBox(title: string, content: string): void
  }
  shell: { openExternal(url: string): Promise<void> }
  platform: NodeJS.Platform   // 'darwin' | 'win32' | ...
  isPackaged: boolean
  releasePageUrl: string
}

export interface UpdateController { checkForUpdates(): Promise<void> }

export function createUpdateController(deps: UpdateDeps): UpdateController
```

`checkForUpdates()` 行为:

1. `!isPackaged` → `dialog.showMessageBox({ message: '开发模式不支持检查更新' })` 后返回(electron-updater 未打包时会抛错)。
2. 设 `autoUpdater.autoDownload = false`;**幂等**注册事件监听(用模块内 `wired` 标记,避免重复 check 时重复注册);随后 `await autoUpdater.checkForUpdates()`。
3. 事件:
   - `update-available(info)`:
     - `platform === 'darwin'` → 弹窗「发现新版本 v{info.version},前往下载?」(确认/取消);确认 → `shell.openExternal(releasePageUrl)`。**不**调用 `downloadUpdate`。
     - 否则(win)→ 弹窗「发现新版本 v{info.version},是否下载?」;确认 → `autoUpdater.downloadUpdate()`。
   - `update-not-available` → 弹窗「已是最新版本」。
   - `download-progress(p)` → 仅 `console.log`(进度条 UI 属 YAGNI,不做)。
   - `update-downloaded(info)`(win)→ 弹窗「新版本已下载完成,立即重启安装?」;确认 → `autoUpdater.quitAndInstall()`。
   - `error(err)` → `dialog.showErrorBox('检查更新失败', String(err?.message ?? err))`。

> 弹窗按钮约定:`buttons: ['取消','确定']`,`defaultId: 1`,`cancelId: 0`;以 `response === 1` 判定确认。统一封装一个内部 `confirm(message): Promise<boolean>`。

### 2.2 菜单接线 `src/main/menu.ts`

- `menuTemplate(opts, onAbout, onCheckUpdate?)`:在「帮助」submenu 增加 `{ label: '检查更新…', click: onCheckUpdate }`(位于「关于售后酱」之上,加一个分隔符);mac 应用菜单(首个 submenu)在「关于售后酱」之后也加「检查更新…」+ 分隔符。
- `buildAppMenu(onCheckUpdate: () => void)`:把 `onCheckUpdate` 透传进 `menuTemplate`(`onAbout` 仍为 `() => app.showAboutPanel()`)。
- 现有 `menuTemplate` 全中文、DevTools 仅 dev 等行为不变。

### 2.3 主进程接线 `src/main/index.ts`

- `import { autoUpdater } from 'electron-updater'`、`import { shell } from 'electron'`。
- 在 `app.whenReady` 内,构造 controller:
  ```ts
  const updater = createUpdateController({
    autoUpdater, dialog, shell,
    platform: process.platform,
    isPackaged: app.isPackaged,
    releasePageUrl: 'https://github.com/ICE1997/aftersales-tool/releases/latest'
  })
  Menu.setApplicationMenu(buildAppMenu(() => { void updater.checkForUpdates() }))
  ```
- 不做启动自动检查。

### 2.4 打包 / 发布配置 `package.json`

- `dependencies` 新增 `electron-updater`(运行时依赖;electron-vite 默认 externalize 主进程依赖,会随包打入 node_modules)。
- `build.publish`:
  ```json
  "publish": { "provider": "github", "owner": "ICE1997", "repo": "aftersales-tool" }
  ```
  electron-builder 据此生成 `app-update.yml`(打入应用),`autoUpdater` 运行时据其找到 GitHub Release 源。

### 2.5 发布工作流 `.github/workflows/release.yml`(新增)

- 触发:`on: push: tags: ['v*']`。
- `permissions: { contents: write }`(GITHUB_TOKEN 可写 Release)。
- matrix:`windows-latest` + `macos-latest`;steps:checkout → setup-node@v5(node 20)→ `npm ci`(`.npmrc` 已 `legacy-peer-deps=true`)→ `npx electron-builder --publish always`。
- env:`GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`;mac job 额外 `CSC_IDENTITY_AUTO_DISCOVERY: false`(关闭签名发现,产出未签名 dmg + `latest-mac.yml`)。
- 两个 OS 各自把安装包 + 对应 `latest*.yml` 发布到同一 tag 的 Release(electron-builder 自动合并到该 Release)。
- 保留现有 `build-windows.yml`(PR/分支体检,`--publish never`)。

> **发布流程(写入文档/spec,不自动化)**:改 `package.json` 的 `version` → 提交 → 打**同名** tag `vX.Y.Z`(须与 version 一致,否则 electron-builder 报错)→ `git push --tags` → CI 自动构建并发布 Release。

---

## 3. 数据流

```
用户点「检查更新…」(菜单)
  → index.ts: updater.checkForUpdates()
  → updater.ts: autoUpdater.checkForUpdates() 读取 GitHub Release 的 latest(-mac).yml
  → 事件:
      update-available  → mac: 弹窗→openExternal(release 页)
                          win: 弹窗→downloadUpdate → update-downloaded → 弹窗→quitAndInstall
      update-not-available → 弹窗「已是最新」
      error → 错误弹窗
```

---

## 4. 错误处理 / 边界

- **dev(未打包)**:早返回 + 提示,绝不调用 `autoUpdater`(否则抛 "not packaged")。
- **网络/源错误**:`error` 事件 → 错误弹窗,不崩溃。
- **重复点击**:事件监听只注册一次(`wired` 标记);`checkForUpdates` 可重复调用。
- **mac 未签名**:不调用 `downloadUpdate`/`quitAndInstall`,只跳转浏览器,规避 Squirrel.Mac 签名校验失败。
- **token**:公开仓库下载更新无需 token;CI 发布用内置 `GITHUB_TOKEN`。

---

## 5. 测试策略

`tests/main/updater.test.ts`(node 项目):用注入的假依赖驱动控制器。

- 假 `autoUpdater`:一个简单 EventEmitter 包装(记录 `autoDownload`、`downloadUpdate`/`quitAndInstall`/`checkForUpdates` 调用次数),测试中手动 `emit` 事件。
- 假 `dialog`:`showMessageBox` 返回可配置的 `{response}`,记录每次 message;`showErrorBox` 记录。
- 假 `shell`:记录 `openExternal(url)`。

用例:

- `isPackaged=false` → 弹「开发模式不支持检查更新」,且 `checkForUpdates`/`downloadUpdate` 均未被调用。
- `isPackaged=true` → `autoDownload` 被设为 false,`autoUpdater.checkForUpdates()` 被调用一次。
- `platform='darwin'` + emit `update-available({version:'9.9.9'})` + 用户确认 → `shell.openExternal(releasePageUrl)` 被调用,`downloadUpdate` **未**调用。
- `platform='darwin'` + update-available + 用户取消 → 不 openExternal。
- `platform='win32'` + update-available + 确认 → `downloadUpdate()` 调用一次;随后 emit `update-downloaded` + 确认 → `quitAndInstall()` 调用一次。
- emit `update-not-available` → 弹「已是最新版本」。
- emit `error(new Error('x'))` → `showErrorBox` 被调用且含 'x'。
- 重复调用两次 `checkForUpdates` → 事件监听只注册一次(emit 一次 update-not-available 只弹一次窗)。

`tests/main/menu.test.ts`(扩充现有):

- 「帮助」submenu 含 `label==='检查更新…'`。
- 传入 `onCheckUpdate` 时该项 `click` 为该函数。
- 所有 label 仍为中文(沿用现有断言)。

> electron-updater / electron 的真实更新流程、CI 发布、跨平台安装不做自动化测试(需真实 Release 与签名环境),靠发布后手验。

手验:打包版点「检查更新…」;无新版本→「已是最新」;有新版本→ win 走下载+重启安装,mac 打开 Release 页;dev 下点→「开发模式不支持」。

---

## 6. 明确不做(YAGNI)

- 不做启动自动检查、不做定时轮询(仅手动)。
- 不做渲染层更新 UI / 进度条(仅原生弹窗 + 日志)。
- 不做 mac 代码签名 / 公证(本期未签名,mac 仅跳转下载)。
- 不做增量回滚、灰度、多通道(beta/stable)。
- 不自动 bump 版本号(发布流程文档化,手动改 version + 打 tag)。
- 不引入自建更新服务器(仅 GitHub Releases)。
