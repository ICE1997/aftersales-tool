# 物理目录同步逻辑文件夹 设计文档

**日期**:2026-06-18
**状态**:已确认,待编写实现计划
**关联**:材料按 `dataRoot/<safeSeg(售后单号)>/[folder 段]/…` 落盘(`materialDir` 助手)。当前物理目录是**惰性创建**的——只有材料被导入/移动到某位置时该目录才被 `mkdir`。因此空逻辑文件夹、以及无材料的新售后单,磁盘上没有对应目录;重命名空文件夹也不会动磁盘,且重命名后旧空目录会残留。本 spec 让**物理目录始终镜像逻辑文件夹**,为后续「打开材料目录」打基础。

---

## 1. 概述

把"物理目录镜像逻辑文件夹"做成确定行为:

| 逻辑操作 | 同步后的物理行为 |
|---|---|
| 新建文件夹 | `mkdir -p` 出该文件夹目录(连带祖先 + 根目录) |
| 重命名文件夹 | **整目录改名**:`rename(oldDir → newDir)`,文件与空子目录一起搬,不留旧目录 |
| 删除文件夹 | `rmdir` 递归(已实现,不变) |
| 移动材料 | 文件落盘(已实现,不变) |
| 打开售后单 | 确保根目录存在(`ensureRootDir`) |

**决策**:
- **A=不做历史全量补建**:不对本次改动之前已存在、但磁盘缺目录的逻辑文件夹做一次性扫描补建。只保证从现在起的操作同步 + 打开时建根目录。
- **B=根目录 materialize**:打开任意售后单(列材料)时确保其根目录存在,覆盖新单与旧单。

---

## 2. 架构

### 2.1 新模块 `src/main/services/material-fs.ts`(可单测,纯 fs)

集中所有"物理目录镜像"操作,IPC handler 只调它。依赖 `materialDir`(来自 `./paths`)、`node:fs`、`node:path`。

```ts
/** mkdir -p 出某逻辑文件夹的物理目录(连带祖先 + 根)。 */
export function ensureFolderDir(dataRoot: string, aftersaleNo: string, path: string): void

/** mkdir -p 出某售后单的根目录 dataRoot/<safeSeg(no)>。 */
export function ensureRootDir(dataRoot: string, aftersaleNo: string): void

/** 整目录改名:oldPath → newPath。若 oldDir 不存在则只确保 newDir 存在。 */
export function renameFolderDir(dataRoot: string, aftersaleNo: string, oldPath: string, newPath: string): void
```

- `ensureFolderDir` / `ensureRootDir`:`mkdirSync(materialDir(...), { recursive: true })`(幂等)。
- `renameFolderDir`:
  - `oldDir = materialDir(no, oldPath)`、`newDir = materialDir(no, newPath)`;
  - 若 `oldDir === newDir` → 直接返回;
  - 若 `existsSync(oldDir)`:`mkdirSync(dirname(newDir), { recursive: true })` 后 `renameSync(oldDir, newDir)`(try/catch 容错:跨盘/权限失败时吞掉,DB 已更新,极端情况退化为物理未搬——本地单盘下 `renameSync` 原子,不会发生);
  - 否则(旧目录不存在,如空文件夹从未落过盘且未被 ensure 过)→ `ensureFolderDir(no, newPath)`,保证新目录存在。

> 整目录改名后,文件物理路径天然等于其新 `rel_path`(`safeSeg(no)/newFolderSegs/name.ext`),与 `FolderRepo.rename` 写入 DB 的 `rel_path` 一致。

### 2.2 IPC 接线(`src/main/ipc.ts`)

- **`folders:create`**:`await folderRepo.create(no, path)` 后调 `ensureFolderDir(dataRoot, no, path)`。
- **`folders:rename`**:先 `await folderRepo.rename(no, path, newName)`(更新 DB;若同名冲突会 throw,handler 不继续;若 `newPath===path` 它返回 `[]`);再用同一组纯函数算出 `newPath = joinPath(parentPath(path), normalizeSegment(newName))`(来自 `shared/folder-path`,与 FolderRepo 内部完全一致的确定计算),调 `renameFolderDir(dataRoot, no, path, newPath)`。**移除原逐文件 move 循环**(整目录改名已覆盖文件与空子目录)。`FolderRepo.rename` 仍负责更新 DB 的 `folder`/`rel_path`,其返回值 handler 不再使用(不改其签名)。
- **`materials:list`**:返回前调 `ensureRootDir(dataRoot, no)`,再 `return materials.listByTicket(no)`。
- **`folders:remove`**、**`materials:move`**:不变。

> 在 handler 内复算 `newPath` 用的是与 FolderRepo 相同的纯函数(`parentPath`/`joinPath`/`normalizeSegment`),结果必然一致,无漂移风险;且 `renameFolderDir` 对 `oldPath===newPath` 早返回,对 rename 实际未发生的情形天然无副作用。

---

## 3. 数据流

```
新建文件夹: folders:create → folderRepo.create(写表) → ensureFolderDir(mkdir -p)
重命名:    folders:rename → folderRepo.rename(改 folder/rel_path) → renameFolderDir(整目录改名)
打开售后单: materials:list → ensureRootDir(mkdir -p 根) → 返回材料列表
```

---

## 4. 错误处理 / 边界

- `mkdirSync` recursive 幂等;已存在不报错。
- `renameFolderDir`:`oldDir===newDir` 早返回;`oldDir` 不存在 → 退为 `ensureFolderDir(newPath)`;`renameSync` 失败 try/catch 吞掉(本地单盘原子,正常不发生)。
- **同步删除残留**:删除文件夹仍 `rmdir` 递归;空目录也能被删。
- **A=不补建**:历史空文件夹在被重命名/或其售后单被打开(根目录)前,磁盘可能仍无对应子目录——可接受;后续「打开目录」特性会按需 `mkdir`。
- **导出/校准不受影响**:导出按所选材料,空目录无关;校准只清失效材料索引,不处理空目录。

---

## 5. 测试策略

`tests/services/material-fs.test.ts`(node,用 `mkdtempSync` 临时目录):
- `ensureFolderDir`:建多级目录后各级存在;重复调用幂等。
- `ensureRootDir`:建出 `dataRoot/<safeSeg(no)>`;幂等。
- `renameFolderDir`:
  - 旧目录(含文件 + 一个空子目录)→ 改名后:`newDir` 存在、其中文件与空子目录都在、`oldDir` 不存在。
  - `oldDir` 不存在时 → 调用后 `newDir` 存在(退化 ensure)。
  - `oldPath===newPath` → 无副作用。
- `FolderRepo` 既有 db 测试不变(rename 仍更新 folder/rel_path)。

手验(dev):新建空文件夹 → 磁盘出现该目录;重命名(含空文件夹)→ 磁盘目录跟着改名、旧目录消失、里面文件还在;打开一个无材料的售后单 → 磁盘出现其根目录;删除文件夹 → 磁盘目录消失。

---

## 6. 明确不做(YAGNI)

- 不做历史逻辑文件夹的一次性全量补建/校准(A=2)。
- 不改 IPC 通道名、渲染层、导出、校准逻辑。
- 不在本 spec 实现「打开材料目录」按钮(后续独立 spec,届时目录已恒在)。
- 不处理用户在文件管理器里手动改动磁盘目录导致的漂移(超范围)。
