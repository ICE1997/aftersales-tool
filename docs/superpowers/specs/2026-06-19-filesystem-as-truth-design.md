# 材料管理改为「磁盘即真相」(去掉逻辑文件系统) — 设计

> 状态:待评审。日期 2026-06-19。

## 目标

材料(文件)与文件夹**直接以 `dataRoot/<安全售后单号>/` 下的真实目录为准**,用 OS 文件系统 API 操作,去掉 `materials` / `material_folders` 两张镜像表。这样**只有一套真相**,根治"物理↔逻辑双向同步"问题。

**已拍板**
- 扫描时机:**实时**——打开某单据时用 `fs.watch` 监听其目录,变更即自动刷新。
- 元数据:**以真实文件名为准**,去掉单独的"显示名"。

**不变**:`tickets` 表(售后单元数据、搜索、统计)完全不动。

## 数据模型

材料不再有数字主键,**身份(identity)= dataRoot 相对路径 `relPath`**。

```ts
// shared/types.ts(改写)
export type MaterialKind = 'image' | 'video' | 'other'
export interface Material {
  relPath: string      // "<safeNo>/凭证/a.jpg" — 唯一标识
  folder: string       // 所在逻辑文件夹 = <safeNo> 下的子目录,如 "凭证"(根为 "")
  name: string         // 文件名含扩展名,如 "a.jpg"
  kind: MaterialKind   // 按扩展名判定;非图/视频为 'other'(通用图标,双击用系统打开)
  sizeBytes: number
  modifiedAt: number   // mtime(ms),用于排序/缩略图缓存键
}
```

`folder` 取值是 `<safeNo>/` 之后、文件名之前的子路径(POSIX 分隔)。空字符串 = 根目录。

## 主进程组件

### 1. FileTree 服务(替代 MaterialRepo + FolderRepo + Scanner)
- `list(no)`:递归遍历 `dataRoot/<safeNo>/`,返回 `{ folders: string[], materials: Material[] }`。
  - `folders` = 所有子目录的相对路径(相对 `<safeNo>`),含空目录。
  - 跳过点文件/点目录(`.` 开头)。缩略图缓存在 `dataRoot/.thumbs/`(在任何 `<safeNo>` 之外,扫不到)。
- `createFolder(no, path)` → `mkdirSync(recursive)`。
- `renameFolder(no, path, newName)` → 同级 `renameSync`;目标已存在则抛错。
- `moveFolder(no, path, newParent)` → `renameSync` 改父级;禁止移入自身/子孙;目标重名抛错。
- `removeFolder(no, path)` → `rmSync(recursive)`。
- `addFile(no, srcPath, folder)` / `addBytes(...)` → 复制/写入到目录,文件名冲突自动去重(`a.jpg`→`a-1.jpg`)。
- `moveMaterial(relPath, newFolder)` → `renameSync`,目标重名去重。
- `removeMaterial(relPath)` → `unlinkSync` + 删对应缓存缩略图。
- 文件名/目录名校验沿用 `normalizeSegment`(禁止 `/`、`.`、`..`、空)。

### 2. 缩略图缓存(改写 Thumbnailer)
- 缓存目录 `dataRoot/.thumbs/`。键 = `hash(relPath + mtime + size)`,文件名 `<hash>.jpg`。
- `materials:thumb(relPath)`:命中缓存直接返回其媒体 URL;未命中则按 kind 用 sharp(图)/ffmpeg(视频)生成后返回。`other` 无缩略图(返回 null,前端显示通用图标)。
- 失效:键含 mtime+size,文件变了自然生成新缩略图;旧缩略图留存,由「刷新/清理」时 GC(本期可暂不 GC)。

### 3. 实时监听(主→渲染)
- `materials:watch(no)`:对 `dataRoot/<safeNo>` 起 `fs.watch({ recursive: true })`;**去抖 ~200ms** 后向该窗口发送 `materials:changed`。
- `materials:unwatch(no)`:关闭该监听。同一时刻只维持"当前打开单据"的一个监听。
- 渲染层 `TicketDetail` 挂载时 `watch`、卸载时 `unwatch`,收到 `materials:changed` 即重新 `list`。
- 注:`recursive` 在 macOS / Windows 支持(本项目目标平台)。应用自身写盘也会触发刷新,幂等可接受。

### 4. 导出
- `exporter.toFolder/toZip` 改为接收 `relPath[]` + 选中的空目录 `folders[]`(已支持空目录);按相对结构落盘/入包。

## 迁移

- Knex migration:`drop table materials; drop table material_folders;`(`tickets` 保留)。
- **零数据风险**:磁盘布局现已与表一致(空目录也已 `ensureFolderDir` 落盘),直接扫盘即得。
- 旧缩略图(原 `thumb_path`)成为孤儿,忽略或后续清理。

## 渲染层连带改动

- 选择集 `Set<number>` → `Set<string>`(以 `relPath` 为键);`onToggle/onOpen/move/remove/copyPath` 均改用 `relPath`。
- 文件夹勾选(导出空目录)逻辑沿用,键仍是 folder 路径。
- `MaterialGrid` 缩略图按 `relPath` 取;新增 `kind:'other'` 通用图标 + 双击 `shell.openPath`。
- 排序:默认按 `name`(或 `modifiedAt`)。
- 「校准」按钮 → 改为「刷新」(手动重扫,作为 watch 兜底)。

## 受影响测试

- 删除:`tests/db/folders.test.ts`、`materials` 相关 repo 测试、`scanner` 测试。
- 新增:FileTree 服务测试(用临时目录:list / create / rename / move / remove / 去重 / 拒绝非法名与重名)、缩略图缓存键测试、watch 去抖(可选)。
- 调整:`exporter` 测试(改 relPath 入参)、`ImportResult`/导入链路不变(导入仍写盘)。

## 风险与权衡

- **身份=relPath**:重命名文件会改变身份(重命名后选择丢失)——可接受。
- **性能**:每单据文件量小(售后材料通常个位数~数十),打开时扫盘 + 懒生成缩略图足够快。
- **fs.watch**:跨平台行为略有差异,已去抖;Linux 非目标平台。
- **大改动**:涉及 ipc 全量改写材料/文件夹部分、删两个 repo、Thumbnailer 重写、渲染层 Material 类型与选择键改动、较多测试重写。换来删除整套同步代码 + 消灭一类 bug。

## 不做(YAGNI)

- 缩略图 GC、EXIF 拍摄时间、文件内容搜索、`fs.watch` 之外的轮询、Linux recursive watch 兜底。
