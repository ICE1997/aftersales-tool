# 应用标准化(中文菜单 / 关于 / 窗口标题)设计文档

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:桌面应用当前用 Electron 默认英文菜单、无自定义关于面板、窗口标题来自 HTML `<title>`。本 spec 标准化原生外壳为**纯中文**:应用菜单栏、关于面板、窗口标题、应用名。不改应用内 React 界面(已是中文)。

---

## 1. 概述

为应用添加一套**全中文**的原生外壳:
- 自定义中文应用菜单(售后酱[mac] / 编辑 / 视图 / 窗口 / 帮助),用标准 role 保证行为(尤其编辑菜单的 复制/粘贴/全选,使输入框与剪贴板粘贴的快捷键生效),但 label 显式写中文(不依赖系统语言)。
- 中文「关于」面板(名称 + 版本 + 版权)。
- 窗口标题固定为「售后酱」。
- 应用名设为「售后酱」(影响 Dock/任务栏/mac 应用菜单名,修正 dev 下默认的 "Electron")。
- 开发者工具仅开发期出现。

---

## 2. 架构

### 2.1 新模块 `src/main/menu.ts`
- **纯函数** `menuTemplate(opts: { isMac: boolean; isDev: boolean }): Electron.MenuItemConstructorOptions[]`
  - 只返回普通对象数组(`label`/`role`/`submenu`/`type:'separator'`/`click`),**不在模块加载时 import electron 运行时值**(类型用 `import type`),从而可在 vitest(node)单测。
  - `click` 处理(帮助→关于)以函数引用形式注入(见 2.2),或在 `buildAppMenu` 里包装,保持 `menuTemplate` 纯。为可测,`menuTemplate` 接受一个可选 `onAbout?: () => void`,默认空函数;断言时检查该项存在即可。
- `buildAppMenu(): Electron.Menu` = `Menu.buildFromTemplate(menuTemplate({ isMac: process.platform==='darwin', isDev: !app.isPackaged }, () => app.showAboutPanel()))`。

### 2.2 `src/main/index.ts` 接线
- 顶部(早于 `app.whenReady`):`app.setName('售后酱')`。
- `app.whenReady().then(...)` 内,`registerIpc` 成功后:
  - `app.setAboutPanelOptions({ applicationName: '售后酱', applicationVersion: app.getVersion(), copyright: '© 2026 售后酱' })`
  - `Menu.setApplicationMenu(buildAppMenu())`
  - 然后 `createWindow()`。
- `createWindow`:`new BrowserWindow({ title: '售后酱', ... })`(其余 width/height 等不变)。
- 导入:`import { app, BrowserWindow, dialog, Menu } from 'electron'`;`import { buildAppMenu } from './menu'`。

### 2.3 `src/renderer/index.html`
`<title>售后酱 · 售后材料管理</title>` → `<title>售后酱</title>`(页面标题会覆盖窗口标题;只改原生标题栏,应用内头部副标题不受影响)。

---

## 3. 菜单结构(全部中文 label + 标准 role)

各项 `label` 显式中文,`role` 决定行为/快捷键:

- **售后酱**(仅当 `isMac`,作为首个 submenu,label=`售后酱`):
  关于售后酱(`role:'about'`)· 分隔 · 服务(`role:'services'`)· 分隔 · 隐藏售后酱(`role:'hide'`)· 隐藏其他(`role:'hideOthers'`)· 显示全部(`role:'unhide'`)· 分隔 · 退出售后酱(`role:'quit'`)。
- **编辑**(label=`编辑`):撤销(`undo`)· 重做(`redo`)· 分隔 · 剪切(`cut`)· 复制(`copy`)· 粘贴(`paste`)· 全选(`selectAll`)。
- **视图**(label=`视图`):重新加载(`reload`)· 强制重新加载(`forceReload`)· 分隔 · 实际大小(`resetZoom`)· 放大(`zoomIn`)· 缩小(`zoomOut`)· 分隔 · 进入全屏(`togglefullscreen`)· 【仅 `isDev`】分隔 · 开发者工具(`toggleDevTools`)。
- **窗口**(label=`窗口`):最小化(`minimize`)· 【mac】缩放(`zoom`)· 分隔 · 关闭(`close`)。
- **帮助**(label=`帮助`):关于售后酱(`click` → `app.showAboutPanel()`)。

> mac 的 `role:'about'` 与 `app.showAboutPanel()` 都打开 `setAboutPanelOptions` 配置的面板。帮助→关于 主要服务 Windows/Linux(无应用菜单),mac 上保留无害。

---

## 4. 测试策略

- **`menuTemplate` 纯函数单测**(`tests/main/menu.test.ts`,node):
  - `isMac:true` → 首项 `label==='售后酱'`,其 submenu 含 `role:'quit'` 与 `role:'about'`;`isMac:false` → 无应用菜单项,首项 `label==='编辑'`。
  - 「编辑」submenu 含 role 为 copy/paste/selectAll 的项。
  - `isDev:true` → 「视图」submenu 含 `role:'toggleDevTools'`;`isDev:false` → 不含。
  - 「帮助」submenu 含一项 `label==='关于售后酱'`。
  - 递归收集所有 `label`,断言均为中文(无 ASCII 字母),容忍分隔符无 label。
- **手验(dev)**:菜单栏全中文;⌘C/⌘V/⌘A 在输入框与「新建材料」粘贴处生效;帮助→关于 弹出中文面板(售后酱 / 版本 0.1.0 / © 2026 售后酱);标题栏显示「售后酱」;Dock/任务栏名为「售后酱」。

---

## 5. 明确不做(YAGNI)

- 不加「检查更新」菜单项(属自动更新独立 spec)。
- 不做多语言/语言切换(只中文)。
- 不改应用内 React 界面(已中文)。
- 不做自定义无边框/自绘标题栏。
