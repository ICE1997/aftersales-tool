# aftersales-tool

A local, cross-platform desktop tool for organizing after-sales (售后) evidence. Photos and videos are grouped by 售后单号 and are searchable by order number, shipping number, or return number. Selected media can be copied to a folder or packed into a ZIP archive. All data is stored under a user-configurable local directory — no cloud, no server.

## 技术栈

- **Electron** + **electron-vite** — desktop shell and build pipeline
- **React** + **TypeScript** + **Tailwind CSS** — renderer UI
- **better-sqlite3** (FTS5) — local SQLite database with full-text search
- **sharp** — image thumbnail generation
- **ffmpeg-static** — video thumbnail extraction
- **archiver** — ZIP export
- **Vitest** — unit and integration tests

## 项目结构

```
src/
  main/       Electron main process (IPC handlers, DB, file ops)
  preload/    Context-bridge (exposes window.api to renderer)
  renderer/   React app (App.tsx, components/, api.ts)
  shared/     Shared TypeScript types
tests/        Vitest test suite
```

## 开发与构建

### 关于 Native Module ABI

`better-sqlite3` 和 `sharp` 是原生模块，其 ABI（Application Binary Interface）版本取决于 Node.js 运行时。系统 Node（Vitest 使用）和 Electron 内置 Node 的 ABI **不同**，必须在两者之间切换：

- 如果看到 `NODE_MODULE_VERSION` 错误，说明当前 ABI 不匹配，请运行对应的 `rebuild:*` 脚本。

### 运行测试

```bash
npm run rebuild:node   # 切换到系统 Node ABI
npm test               # 等同于 npx vitest run
```

### 启动开发模式

```bash
npm run rebuild:electron   # 切换到 Electron ABI
npm run dev                # 启动 Electron + Vite HMR
```

### 构建分发包

```bash
npm run rebuild:electron   # 切换到 Electron ABI
npm run dist               # 构建并打包（macOS 输出 .dmg，Windows 输出 .nsis）
                           # 产物在 dist/ 目录；默认关闭代码签名
```

> **注意**：`npm run build` 只做 TypeScript 类型检查 + Vite 打包（输出到 `out/`），不打包安装包。

## 数据存储

数据存放于用户可配置的根目录（默认 `~/Documents/aftersales-tool-data`），结构如下：

```
aftersales-tool-data/
  aftersales-tool.db      SQLite 数据库（含 FTS5 全文索引）
  <售后单号>/
    images/               图片原文件
    videos/               视频原文件
  .thumbnails/            缩略图缓存
```

整个文件夹是可移植的：直接复制即可迁移或备份。在「设置」中更改数据根目录时，程序会将现有数据库和媒体文件复制到新位置（也可以指向一个已有的库目录）。
