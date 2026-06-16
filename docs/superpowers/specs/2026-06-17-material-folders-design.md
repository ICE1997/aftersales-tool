# 材料多级目录 设计文档(Spec B)

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:原始需求 #4「新建材料需要支持目录(多级)」。Spec A(收件人提取/列表/详情)已完成。材料当前为售后单内的扁平列表。

---

## 1. 概述

让每个售后单的材料支持**多级文件夹**组织。采用**逻辑文件夹**:新增 `material_folders` 表(每售后单的目录路径)+ `materials.folder` 路径列;物理文件仍存于 `<售后单>/images|videos/`,目录树是纯元数据。文件夹的新建(多级)/重命名/删除(连同内容)/材料移动都是数据库操作(重命名=子树路径前缀重写,不动磁盘文件)。导出到文件夹/zip **按目录层级还原**。

口径:目录隶属于单个售后单;根目录隐式(`folder=''`);允许空文件夹独立存在。

---

## 2. 数据模型

### 2.1 表结构(`src/main/db/database.ts`)
新增表:
```sql
CREATE TABLE IF NOT EXISTS material_folders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  aftersale_no TEXT NOT NULL REFERENCES tickets(aftersale_no) ON DELETE CASCADE,
  path         TEXT NOT NULL,          -- 完整路径,如 '凭证/聊天记录';根目录不存行
  created_at   INTEGER NOT NULL,
  UNIQUE(aftersale_no, path)
);
CREATE INDEX IF NOT EXISTS idx_folders_ticket ON material_folders(aftersale_no);
```
给 `materials` 追加列(经 `ensureColumn`):`folder TEXT NOT NULL DEFAULT ''`(所在目录路径,`''`=根)。FTS 不涉及。

### 2.2 共享类型(`src/shared/types.ts`)
- `Material` 加 `folder: string`。
- `NewMaterial`(在 `materials.ts`)随之带 `folder`(默认 `''`)。
- `CreateMaterialPayload` 两个分支都加 `folder: string`(创建时指定目标目录)。

### 2.3 路径约定
- 路径用 `/` 分隔;无前导/尾随 `/`;各段非空、不含 `/`、去首尾空白。
- 根目录用 `''` 表示,不在 `material_folders` 存行。

---

## 3. 纯函数:`src/shared/folder-path.ts`

离线、可单测,供主进程仓库与渲染层共用:
- `normalizeSegment(name: string): string` — 去首尾空白;若为空或含 `/` 抛错(调用方校验)。
- `joinPath(parent: string, name: string): string` — `parent===''? name : parent+'/'+name`。
- `parentPath(path: string): string` — 去掉最后一段;顶层目录的父为 `''`。
- `folderName(path: string): string` — 最后一段。
- `childrenFolders(allPaths: string[], parent: string): string[]` — `allPaths` 中直接位于 `parent` 下一级的路径(去重、排序)。
- `isUnderOrEqual(path: string, prefix: string): boolean` — `path===prefix || path.startsWith(prefix+'/')`。
- `rewritePrefix(path: string, oldPrefix: string, newPrefix: string): string` — 若 `isUnderOrEqual(path, oldPrefix)`,把前缀 `oldPrefix` 换成 `newPrefix`,否则原样返回(重命名子树用)。

---

## 4. 后端仓库 + IPC

### 4.1 `FolderRepo`(`src/main/db/folders.ts`)
- `create(aftersaleNo, path)`:对 `path` 及其所有祖先前缀逐个 `INSERT OR IGNORE`(确保多级路径的每一层都有行)。
- `list(aftersaleNo): string[]`:该售后单全部目录路径(排序)。
- `rename(aftersaleNo, path, newName)`:`newPath = joinPath(parentPath(path), normalizeSegment(newName))`;若 `newPath` 已存在或与 `path` 同则拒绝(抛错)。事务内:对 `path` 及所有后代(`path` 或 `path/%`)用 `rewritePrefix` 改写 `material_folders.path`;同样改写其中 `materials.folder`(`folder===path` 或 `folder LIKE path/%`)。
- `remove(aftersaleNo, path): { relPath: string; thumbPath: string | null }[]`:事务内收集子树内材料(`folder===path` 或 `folder LIKE path/%`)的 relPath/thumbPath 作为返回;删除这些材料行;删除自身+后代目录行。返回的文件清单交由 IPC 删盘。

> `LIKE` 的 `path/%` 用参数化 + `ESCAPE` 转义 `% _ \`(沿用 customers/旧代码的转义习惯),避免路径中的通配符误伤。

### 4.2 `MaterialRepo`(`src/main/db/materials.ts`)
- `add` 的 `NewMaterial` 含 `folder`;INSERT 写入 `folder`。
- 新增 `setFolder(id: number, folder: string): void`(移动材料)。
- `ROW` 增加 `folder`;`listByTicket` 返回含 `folder`。

### 4.3 `Importer`(`src/main/services/importer.ts`)
`addFile`/`addBytes` 增加 `folder` 入参,透传到 `record` → `materials.add`。**物理目标目录不变**(仍按 kind 落在 images/videos)。`importFiles` 批量入口默认 `folder=''`。

### 4.4 `Exporter`(`src/main/services/exporter.ts`,保留层级)
- `toFolder(materials, targetDir)`:每个材料目标相对路径 = `m.folder` 子目录 + `basename(m.relPath)`;`mkdirSync` 建子目录;**同一目录内**同名去重(`uniqueBasename` 改为按目标子目录判重)。
- `toZip(materials, zipPath)`:`archive.file(abs, { name: posixJoin(m.folder, uniqueName) })`,同目录内去重(`used` 改为按 `folder` 维度的集合,或用完整相对路径判重)。

### 4.5 IPC / preload
- `folders:list (no) -> string[]`
- `folders:create (no, path) -> void`
- `folders:rename (no, path, newName) -> void`
- `folders:remove (no, path) -> void`:调用 `FolderRepo.remove` 拿到受影响材料文件清单,再 `unlinkSync` 每个 relPath 与 thumbPath(try/catch 忽略缺失;参照「删除售后单」的清理),返回。
- `materials:move (id, folder) -> void` → `MaterialRepo.setFolder`。
- `materials:create (no, payload)`:`payload` 含 `folder`,透传给 `importer.addFile/addBytes`。
- preload `api` 对应方法;`Api = typeof api` 自动生效。

---

## 5. 界面与交互

### 5.1 `MaterialGrid`(文件夹化)
新增 props:`folders: string[]`、`currentFolder: string`、`onEnterFolder(path)`、`onCreateFolder(name)`、`onRenameFolder(path,newName)`、`onDeleteFolder(path)`、`onMoveSelected(folder)`(沿用现有 `materials/selectedIds/onToggle/onOpen`)。布局:
- 顶部**面包屑**:`根 / 凭证 / 聊天记录`,点任一级跳到该级;末级不可点。右侧「新建文件夹」按钮(输入名→ `onCreateFolder`)。
- **文件夹瓦片**(在文件之前):文件夹图标 + 名;点进入(`onEnterFolder`);每瓦片 `⋯` 菜单 → 重命名(行内输入)/删除(二次确认「将删除该文件夹及其全部内容」)。
- **文件瓦片**:仅显示 `m.folder === currentFolder` 的材料,选择/打开同现状。
- 选中材料时,工具区出现「移动到…」→ 目录选择器(本售后单所有目录 + 根)→ `onMoveSelected`。

### 5.2 `TicketDetail`(接线)
- 上提 `currentFolder` 状态(默认 `''`);`reload` 时并取 `api.listFolders(no)`;目录/移动操作后刷新列表与材料。
- `新建材料` 按钮:把 `currentFolder` 作为目标传入 `NewMaterialDialog`。
- 材料工具栏的导出/打包仍按选中材料(Exporter 已按层级)。

### 5.3 `NewMaterialDialog`
新增 `targetFolder` prop;顶部显示「将添加到:<面包屑或 根目录>」;`createMaterial` 负载带 `folder: targetFolder`。

---

## 6. 测试策略

- **纯函数 `folder-path`(TDD,重点)**:parentPath/folderName/joinPath/childrenFolders(直接子级、去重排序)/isUnderOrEqual/rewritePrefix/normalizeSegment(空、含 `/` 抛错)边界。
- **`FolderRepo`**:create 建全部祖先;list;rename → 子树 `material_folders.path` 与 `materials.folder` 同步改写、目标重名拒绝;remove → 递归删目录、返回子树材料的 relPath/thumbPath、材料行删除。
- **`MaterialRepo`**:add 带 folder;setFolder;listByTicket 含 folder。
- **`Exporter`**:toFolder/toZip 按 `m.folder` 还原层级;同目录同名去重;跨目录分别归类。
- **手验(dev)**:建多级目录;新建材料进当前目录;移动材料;重命名目录(其内材料路径跟随);删除目录(连同内容,文件被清理);导出 zip 检查层级;返回根目录。

---

## 7. 明确不做(YAGNI)

- 不做物理磁盘镜像目录(仅逻辑 + 导出按层级)。
- 不做跨售后单移动材料/目录。
- 不做拖拽排序/拖拽移动(用「移动到…」选择器即可)。
- 不做目录级权限、收藏、颜色等。
- 单个材料删除的物理文件清理沿用现状(本 spec 仅在「删除文件夹」与「删除售后单」时清理磁盘文件)。
