# 「新建材料」(自定义名称 + 剪贴板/文件选择器) — 设计文档

**日期**:2026-06-15
**状态**:已确认,待编写实现计划
**关联**:在已完成的 vhelper(电商售后材料管理工具)基础上修改材料添加流程。

---

## 1. 概述

把现有的「导入材料」(一次多选、直接复制)改为「**新建材料**」:**一次新建一个**材料,**总是可命名**,来源支持**剪贴板**(图像或剪贴板中的文件)和**文件选择器**(单选)。

### 决策要点
- **名称语义**:自定义名称是 DB 中的**显示标题**,磁盘上的原始文件名不变(避免重名冲突、非法字符、丢扩展名)。
- **剪贴板来源**:图像(截图等)**和**剪贴板中复制的文件都支持;图像优先。
- **流程**:一次新建一个,带预览(方案 A),所见即所得。

---

## 2. 数据模型与迁移

### 2.1 schema 变更
`materials` 表新增一列:
```
name TEXT NOT NULL DEFAULT ''
```
`Material` 类型(`src/shared/types.ts`)新增字段 `name: string`。

### 2.2 迁移(已有库平滑升级)
已发布版本的用户 `vhelper.db` 没有 `name` 列。`src/main/db/database.ts` 的 `migrate()` 在 `CREATE TABLE IF NOT EXISTS` 之后增加一步**幂等的列确保**:
- 读 `PRAGMA table_info(materials)`;
- 若不存在 `name` 列,执行 `ALTER TABLE materials ADD COLUMN name TEXT NOT NULL DEFAULT ''`。

抽成助手 `ensureColumn(db, table, column, ddl)` 便于单测。新库与老库最终 schema 一致;老数据 `name` 为 `''`,展示时回退文件名。

### 2.3 展示规则
材料标题 = `name || basename(relPath)`(标题优先,空则用文件名)。用于材料网格卡片文字与预览弹窗标题。

---

## 3. 主进程

### 3.1 Importer 扩展(`src/main/services/importer.ts`)
抽出私有助手 `record(aftersaleNo, kind, destAbs, name)`:计算相对路径、生成缩略图、`MaterialRepo.add({ ..., name })`,返回新建的 `Material`。在此之上:
- `addFile(aftersaleNo, srcPath, name): Promise<Material>` — 分类(图/视频),不支持类型抛错;拷贝进 `<root>/<safeDir(no)>/images|videos/`(沿用 `uniqueDest` 去重);调用 `record`。
- `addImageBuffer(aftersaleNo, buffer, name): Promise<Material>` — 把图像 buffer 写成 `<root>/<safeDir(no)>/images/paste-<时间戳>.png`(时间戳由注入的 `now()` 提供,避免不可测),调用 `record`(kind=image)。
- 现有 `importFiles(aftersaleNo, files)` 改为循环调用 `addFile(no, f, '')`,捕获单个失败进 `skipped`,保留其既有测试与去重/批量语义。

> `MaterialRepo.add` 的入参类型已是 `Omit<Material,'id'>`,新增 `name` 后 `add` 自动覆盖;`ROW` 投影补 `name AS name`。

### 3.2 剪贴板助手(`src/main/services/clipboard-source.ts`)
隔离平台差异,导出:
- `peekClipboard(): ClipboardPeek`
  - 图像:`clipboard.readImage()`,非空 → `{ type:'image', name:'粘贴图片', thumbDataUrl: img.resize({width:240}).toDataURL() }`。
  - 否则文件:平台读取路径,非空 → `{ type:'file', name: basename(path,无扩展名), path }`。
  - 否则 → `{ type:'empty' }`。
- `readClipboardSource(): { kind:'image', buffer:Buffer } | { kind:'file', path:string } | null` — 创建时再读一次。图像 → `clipboard.readImage().toPNG()`;否则文件路径;都没有 → `null`。
- 平台路径读取:
  - macOS:`clipboard.read('public.file-url')` → file URL → 路径。
  - Windows:`clipboard.readBuffer('FileNameW')` → UTF-16LE、以 NUL 结尾 → 第一个路径。
- 纯函数抽离便于单测:`parseFileUrl(url): string`、`parseWindowsFileNameW(buffer): string`(只测解析,不依赖 Electron)。

### 3.3 IPC(`src/main/ipc.ts`)
移除 `import:pick`,新增:
- `clipboard:peek` → `peekClipboard()`。
- `materials:pickFile` → `dialog.showOpenDialog({ properties:['openFile'] })`(单选);取消返回 `null`,否则 `{ path, name: basename(无扩展名) }`。
- `materials:create(aftersaleNo, payload)`:
  - `payload = { source:'file', path, name }` → `importer.addFile(aftersaleNo, path, name)`。
  - `payload = { source:'clipboard', name }` → `readClipboardSource()`:`image` → `addImageBuffer`;`file` → `addFile`;`null` → 抛错 `剪贴板没有可用的图片或文件`。
  - 返回新建 `Material`;任何失败抛错(渲染层捕获展示)。

### 3.4 Preload(`src/preload/index.ts`)
把 `importPick` 替换为:
```ts
peekClipboard: () => ipcRenderer.invoke('clipboard:peek'),
pickFile: () => ipcRenderer.invoke('materials:pickFile'),
createMaterial: (no, payload) => ipcRenderer.invoke('materials:create', no, payload),
```
并补充对应 TS 类型(`ClipboardPeek`、`PickedFile`、`CreateMaterialPayload` 放入 `src/shared/types.ts` 以便跨进程复用)。

---

## 4. 界面与交互

### 4.1 入口
`TicketDetail` 工具栏「导入材料」按钮改为「**新建材料**」(`+` 图标),点击打开 `NewMaterialDialog`,不再直接调用旧的多选导入。

### 4.2 NewMaterialDialog(`src/renderer/components/NewMaterialDialog.tsx`)
Props:`{ open, aftersaleNo, onCreated, onCancel }`。内部状态:来源 tab、预览信息、名称、错误。
1. **来源切换**:分段「从剪贴板」「选择文件」。
2. **从剪贴板**:选中即 `api.peekClipboard()`:
   - `image` → 显示 `thumbDataUrl` 缩略图 + 名称预填「粘贴图片」;
   - `file` → 显示文件名 + 名称预填(去扩展名);
   - `empty` → 提示「剪贴板没有可用的图片或文件」、禁用「创建」、提供「刷新」重读按钮。
3. **选择文件**:点「选择文件」→ `api.pickFile()`;返回则显示文件名 + 预填名称;取消则无操作。
4. **名称输入**:始终可编辑,带预填值。
5. **底部**:「取消」/「创建」。仅在存在有效来源时启用「创建」。

### 4.3 创建
点「创建」→ `api.createMaterial(aftersaleNo, payload)`:
- payload:剪贴板来源 `{source:'clipboard', name}`;文件来源 `{source:'file', path, name}`。
- 成功:关闭对话框、刷新材料网格、`TicketDetail` 用现有 amber 提示条显示「已新建材料:<名称>」。
- 失败:对话框内红色行内错误提示,不关闭。

### 4.4 展示
- `MaterialGrid` 卡片底部文字改为 `m.name || basename(m.relPath)`。
- `PreviewModal` 标题/文件名展示同样优先 `m.name`。

---

## 5. 错误处理

- 剪贴板为空/格式不支持 → `peek` 返回 `empty` → 对话框提示并禁用创建。
- peek 与 create 之间剪贴板变化 → create 再读为空则抛错 → 行内提示重试。
- 不支持的文件类型(非图/视频)→ `addFile` 抛错 → 行内提示「不支持的文件类型」。
- 文件选择取消 → 无操作。
- 拷贝/磁盘错误 → 抛错 → 行内提示。

---

## 6. 测试策略

- **DB 迁移(重点)**:手工建一个无 `name` 列的"旧 schema"临时库,跑 `ensureColumn`/`migrate`,断言 `name` 列被加上、默认 `''`;`createDatabase` 新库含 `name` 列。
- **MaterialRepo**:`add` 写入并读回 `name`(round-trip);`listByTicket` 返回 `name`。
- **Importer**:`addFile(...,name)` 落盘+入库且标题为 `name`;`addImageBuffer(buffer,name)` 用真实 PNG buffer 写出 `paste-*.png`、生成缩略图、标题正确;`importFiles` 旧行为不回归。
- **剪贴板纯函数**:`parseFileUrl`、`parseWindowsFileNameW` 单测(不依赖 Electron)。
- **渲染层**:`NewMaterialDialog` 轻量组件测试——名称可编辑、有有效来源时「创建」可用、点击以正确 payload 调 `onCreated`/`createMaterial`(`window.api` mock)。
- 平台相关剪贴板实际读取、原生文件框、真实交互 → dev 手验。

---

## 7. 明确不做(YAGNI)

- 不做多文件批量新建(定为"一次一个")。
- 不做剪贴板多文件(取图像或第一个文件)。
- 不按自定义名称重命名磁盘文件(名称仅作 DB 标题)。
- 不改动既有缩略图/导出/打包/校准等逻辑。
