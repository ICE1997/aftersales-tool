# 售后酱（aftersales-tool）

一款**本地、离线、跨平台**（Windows / macOS）的电商售后材料管理桌面应用。把每个售后单的图片、视频等凭证按**售后单号**归集，支持全文搜索、过滤排序、多级文件夹整理、导出与统计。所有数据存放在本地用户目录，**不联网、不上云、无服务器**。

> 应用内界面、菜单、关于面板均为中文；窗口标题与应用名为「售后酱」。

---

## 功能特性

- **售后单管理**：新建 / 编辑 / 删除售后单;字段含 售后单号、订单号、发货/退货快递单号、售后状态、售后类型、售后原因、发货状态、交易金额、退款金额、申请时间、退货物流状态。
- **客户与收件人信息**:收件人姓名、手机号、分机号、省/市/区 + 详细地址;支持**从粘贴文本自动识别**姓名、手机号(含虚拟号分机号)、地址(新建与编辑时均可)。
- **材料管理**:导入图片/视频(选择文件或粘贴),自动生成缩略图;支持**多级文件夹**(新建空文件夹、重命名、移动、删除连同内容)。
- **搜索 / 过滤 / 排序**:
  - 全文搜索(FTS5)覆盖**全部文本字段**(单号、收件人、手机号、地址、售后类型、售后原因、发货状态、退货物流状态等);
  - 过滤工具条:按售后状态 / 售后类型 / 发货状态(多选)、申请时间(日期区间);
  - 点击「申请时间」「售后状态」表头升/降序排序(默认申请时间倒序)。
- **Excel 导入**:从 `.xlsx` 批量导入售后单(按售后编号去重)。
- **导出**:勾选材料导出到文件夹,或打包为 ZIP(保留多级文件夹层级)。
- **统计**:按省/市/区的地区分布图表与汇总(ECharts)。
- **检查更新**:菜单「帮助 → 检查更新…」。Windows 完整自动更新(下载并重启安装);macOS 检查到新版本后打开 GitHub Release 页供手动下载(未签名)。
- **可移植数据**:整个数据目录可直接复制迁移/备份;可在「设置」中更改数据根目录。

---

## 技术栈

- **Electron** + **electron-vite** — 桌面外壳与构建
- **React** + **TypeScript** + **Tailwind CSS** — 渲染层 UI
- **better-sqlite3**(FTS5) — 本地 SQLite + 全文索引;数据访问经 **Knex** query builder,**Knex 迁移**管理 schema 演进
- **sharp** — 图片缩略图;**ffmpeg-static** — 视频缩略图
- **archiver** — ZIP 导出;**xlsx** — Excel 解析;**ECharts** — 统计图表
- **electron-updater** — 基于 GitHub Releases 的更新
- **Vitest** — 单元与集成测试

---

## 项目结构

```
src/
  main/       Electron 主进程(IPC、数据库、迁移、文件操作、菜单、更新)
    db/       数据库连接、迁移、各仓库(tickets/materials/folders/stats)
    services/ 导入、导出、缩略图、扫描、设置、Excel 解析
  preload/    contextBridge(向渲染层暴露 window.api)
  renderer/   React 应用(views/、components/、api.ts)
  shared/     跨进程共享的 TypeScript 类型
tests/        Vitest 测试(db / services / main / renderer)
docs/         设计文档与实现计划(docs/superpowers/)
.github/      release.yml(打 tag 自动构建发布)
```

---

## 开发与构建

### 关于原生模块 ABI

`better-sqlite3` / `sharp` 是原生模块,其 ABI 取决于运行时的 Node 版本。**系统 Node(Vitest 用)与 Electron 内置 Node 的 ABI 不同**,需在两者间切换;看到 `NODE_MODULE_VERSION` 报错即表示 ABI 不匹配,运行对应的 `rebuild:*` 脚本即可。

> 提示:`knex` 解析的是其**嵌套**的 `node_modules/knex/node_modules/better-sqlite3`。若该副本出现 ABI 报错,删除它(`rm -rf node_modules/knex/node_modules/better-sqlite3`)让其回退到顶层副本。

### 安装依赖

```bash
npm ci        # 或 npm install(仓库已配置 .npmrc: legacy-peer-deps=true)
```

### 运行测试

```bash
npm run rebuild:node   # 切到系统 Node ABI
npm test               # = npx vitest run
```

### 启动开发模式

```bash
npm run rebuild:electron   # 切到 Electron ABI
npm run dev                # Electron + Vite HMR
```

> 改动主进程的依赖/导入后,务必**实际启动应用**验证(`npm run dev`);构建与单测都不会经过 Electron 的 ESM 加载器,无法捕获 CJS 命名导入之类的启动期崩溃。

### 构建与打包

```bash
npm run build              # 仅 TS 类型检查 + Vite 打包(输出 out/),不出安装包
npm run rebuild:electron
npm run dist               # 打包安装包(macOS .dmg / Windows NSIS .exe),产物在 dist/
```

---

## 数据存储

默认根目录 `~/Documents/aftersales-tool-data`:

```
aftersales-tool-data/
  aftersales-tool.db      SQLite(含 FTS5 全文索引 + knex_migrations)
  backups/                迁移前自动备份(保留最近 3 份)
  <售后单号>/
    images/               图片原文件
    videos/               视频原文件
  .thumbnails/            缩略图缓存
```

整个文件夹可移植:直接复制即可迁移或备份。在「设置」中更改数据根目录时,程序会把现有库与媒体复制到新位置(也可指向已有的库目录),并重启生效。数据库 schema 升级由 Knex 迁移自动完成,且迁移前会自动备份。

---

## 发布(自动更新)

通过 GitHub Actions 在打 tag 时自动构建并发布到 GitHub Release:

```bash
# 1) 修改 package.json 的 version(并同步 package-lock.json)
# 2) 提交后打同名 tag(须与 version 一致)
git tag vX.Y.Z
git push origin main --tags
```

`.github/workflows/release.yml` 会在 Windows + macOS 上构建(串行,避免重复草稿),把安装包与更新清单(`latest.yml` / `latest-mac.yml`)发布到该 tag 的 **草稿 Release**;确认无误后在 GitHub 上手动发布。

> macOS 当前为未签名构建,仅支持「检查更新 → 打开下载页」;若需 macOS 静默自动更新,需 Apple 开发者证书 + 公证。
