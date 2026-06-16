# 新建材料:手动粘贴 + 预览图(取代主进程剪贴板读取) — 设计文档

**日期**:2026-06-15
**状态**:已确认,待编写实现计划
**关联**:在已完成的「新建材料」功能(自定义名称 + 剪贴板/文件选择器)基础上,改造剪贴板这一路的交互。

---

## 1. 概述

把「新建材料」对话框中"从剪贴板"的行为从**打开即由主进程自动读取剪贴板**,改为**用户手动按 Cmd/Ctrl+V 粘贴后才在渲染层显示预览**。粘贴**以图像为主,并尽量支持粘贴文件**。不再显示文件的完整路径(两个来源页一致)。

### 决策
- 采用**方案 A(渲染层原生粘贴)**:渲染层监听 `paste` 事件读取剪贴板内容,主进程不再读剪贴板。
- 之前为旧机制建的主进程剪贴板模块被取代并移除。

---

## 2. 架构与数据流

### 2.1 渲染层(粘贴在此发生)
- 当对话框 `open` 且当前为"剪贴板"页时,`useEffect` 注册 `window.addEventListener('paste', handler)`,在切页/关闭/卸载时移除。
- `handler(e: ClipboardEvent)`:
  1. 图像优先:遍历 `e.clipboardData.items`,取第一个 `type` 以 `image/` 开头的项 → `getAsFile()` 得到 `File`。
  2. 否则文件:取 `e.clipboardData.files[0]`(系统把复制的文件带入 paste 事件时)。
  3. 取到 `File` 后:`const bytes = new Uint8Array(await file.arrayBuffer())`。
  4. 图像:`previewUrl = URL.createObjectURL(file)` 即时预览;切换/替换/卸载时 `URL.revokeObjectURL`。
  5. 文件名:图像按 MIME 合成(`image/png`→`paste.png`、`image/jpeg`→`paste.jpg`、`image/gif`→`paste.gif`、`image/webp`→`paste.webp`,其它图像回退 `paste.png`);文件用 `file.name`。
  6. 预填名称:图像 → `粘贴图片`;文件 → 文件名去扩展名。
  7. 取不到可用内容 → 设置行内错误「未检测到可粘贴的图片或文件」。
- 待创建态(pending):`{ fileName: string; name: string; bytes: Uint8Array; previewUrl?: string; isImage: boolean }`。

### 2.2 IPC 载荷
`src/shared/types.ts`:
- 移除 `ClipboardPeek`。
- `CreateMaterialPayload` 改为:
```ts
export type CreateMaterialPayload =
  | { source: 'file'; path: string; name: string }
  | { source: 'paste'; fileName: string; name: string; bytes: Uint8Array }
```
- `PickedFile` 保留。

`src/main/ipc.ts`:
- 移除 `clipboard:peek` handler 及 `import { peekClipboard, readClipboardSource }`。
- `materials:create`:
```ts
ipcMain.handle('materials:create', async (_e, no, payload: CreateMaterialPayload) => {
  if (payload.source === 'file') return importer.addFile(no, payload.path, payload.name)
  return importer.addBytes(no, payload.fileName, Buffer.from(payload.bytes), payload.name)
})
```
- `materials:pickFile` 保留不变。

`src/preload/index.ts`:
- 移除 `peekClipboard`;移除类型 import 中的 `ClipboardPeek`。
- `createMaterial(no, payload)`、`pickFile()` 保留(`createMaterial` 签名不变,载荷类型已更新)。`Uint8Array` 可经 structured clone 通过 `ipcRenderer.invoke` 传递。

### 2.3 Importer
- 新增:
```ts
async addBytes(aftersaleNo: string, fileName: string, buffer: Buffer, name: string): Promise<Material> {
  const kind = this.kindOf(fileName)
  if (!kind) throw new Error('unsupported file type')
  if (!buffer || buffer.length === 0) throw new Error('empty file')
  const dest = this.uniqueDest(this.destDirFor(aftersaleNo, kind), fileName)
  writeFileSync(dest, buffer)
  return this.record(aftersaleNo, kind, dest, name)
}
```
- **移除 `addImageBuffer`**(由 `addBytes` 覆盖)。`addFile`、`importFiles`、`record`、`kindOf`、`uniqueDest`、`destDirFor` 不变。

### 2.4 移除被取代的代码
- 删除文件:`src/main/services/clipboard-source.ts`、`src/main/services/clipboard-parse.ts`、`tests/services/clipboard-parse.test.ts`。
- 同步移除对它们的引用(见 2.2)。

---

## 3. 界面与交互(NewMaterialDialog)

来源切换保留两页:「从剪贴板」「选择文件」。

### 3.1 从剪贴板(粘贴区)
- 未粘贴:虚线粘贴区,提示「按 Cmd/Ctrl+V 粘贴图片或文件」。
- 粘贴图像后:显示缩略图预览(`previewUrl`),名称预填「粘贴图片」。
- 粘贴文件后:显示文件名(**不显示完整路径**)+ 文件图标,名称预填文件名(去扩展名)。
- 再次 Cmd/Ctrl+V 替换当前内容(释放旧 `previewUrl`)。
- 无可用内容:行内提示「未检测到可粘贴的图片或文件」。

### 3.2 选择文件
- 「选择文件…」→ 系统单选框 → 仅显示**文件名(basename)**,不显示完整路径。

### 3.3 名称 / 操作
- 名称输入始终可编辑、带预填(粘贴或选择后)。用户编辑后再次粘贴/选择不应静默覆盖已手动编辑的名称(沿用现有 `nameEdited` 守卫)。
- 「创建」在有有效来源时启用,创建中禁用(`busy` 守卫)。
- 创建:`createMaterial(aftersaleNo, payload)`;成功 → `onCreated(material)`(对话框关闭、网格刷新、详情页提示「已新建材料:<名称>」);失败 → 行内红色错误,保持打开。
- 「取消 / 关闭」→ `onCancel`。

### 3.4 展示
- 网格/预览仍用 `name || 文件名`(不变)。

---

## 4. 错误处理
- 粘贴无可用内容(无图像且 `files` 为空)→ 行内提示,「创建」禁用。
- 不支持类型(非图/视频)→ `addBytes`/`addFile` 抛错 → 行内「不支持的文件类型」(以底层 message 呈现)。
- 空字节 → `addBytes` 抛错 → 行内提示。
- 落盘/磁盘错误 → 抛错 → 行内提示。
- 文件选择取消 → 无操作。

---

## 5. 测试策略
- **Importer.addBytes**(TDD,重点):真实 PNG buffer + `paste.png` → 落盘为图、标题正确、缩略图生成、relPath 形如 `AS-1/images/paste.png`;`clip.mp4` → 视频(`videos/`);`note.txt` → 抛 `unsupported`;空 buffer → 抛错。
- **删除** `tests/services/clipboard-parse.test.ts`。
- **NewMaterialDialog**(jsdom 对真实粘贴支持有限,轻量测):
  - 剪贴板页渲染「按 Cmd/Ctrl+V 粘贴…」提示且「创建」初始禁用;
  - 文件页:点「选择文件…」→ `pickFile` mock 返回 → 显示文件名 → 点「创建」→ 以 `{source:'file',path,name}` 调 `createMaterial` 且 `onCreated` 被调用。
  - 真实 Cmd+V 粘贴→预览→创建 由 dev 手验(可用 `executeJavaScript` 合成带 `File` 的 `paste` 事件验证整链:粘贴图像 → 预览 → 创建 → 列表含该材料且缩略图加载)。
- 其余既有用例(materials/importer 其余、exporter、db 等)保持绿。

---

## 6. 明确不做(YAGNI)
- 不做拖拽(drag-drop)新增。
- 不做粘贴多文件(取图像或第一个文件)。
- 不为粘贴大文件做分片/流式 IPC(大文件走"选择文件")。
- 不改动既有缩略图/导出/打包/校准/迁移/名称展示等逻辑。
