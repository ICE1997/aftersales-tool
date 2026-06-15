# 新建材料:手动粘贴 + 预览图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「新建材料」对话框的剪贴板这一路从"打开即由主进程读取"改为"用户手动 Cmd/Ctrl+V 粘贴后在渲染层预览",图像为主、尽量支持粘贴文件,并移除被取代的主进程剪贴板模块。

**Architecture:** 渲染层监听 `paste` 事件读取图像/文件字节并即时预览;`materials:create` 新增 `paste` 载荷(字节)走 `Importer.addBytes` 落盘;`addBytes` 取代 `addImageBuffer`;删除 `clipboard-source`/`clipboard-parse` 及 `clipboard:peek`/`peekClipboard`。

**Tech Stack:** Electron, better-sqlite3, sharp, React + TS, Vitest。

---

## File Structure

```
src/shared/types.ts                          # - ClipboardPeek; CreateMaterialPayload 改为 file|paste
src/main/services/importer.ts                # + addBytes; - addImageBuffer
src/main/ipc.ts                              # materials:create 用 addBytes; - clipboard:peek; - clipboard-source import
src/preload/index.ts                         # - peekClipboard; - ClipboardPeek import
src/renderer/components/NewMaterialDialog.tsx# 剪贴板页改为粘贴;文件页显示 basename
(delete) src/main/services/clipboard-source.ts
(delete) src/main/services/clipboard-parse.ts
(delete) tests/services/clipboard-parse.test.ts

tests/services/importer.test.ts              # addImageBuffer 用例 → addBytes 用例
tests/renderer/NewMaterialDialog.test.tsx    # 重写:粘贴提示 + 文件页创建
```

> 测试在 system Node ABI 下跑(`npm run rebuild:node` 后 `npx vitest run`);`npm run dev` 前 `npm run rebuild:electron`。

---

## Task 1: 后端 — addBytes 取代 addImageBuffer,载荷/IPC/preload 更新,移除旧剪贴板模块

**Files:**
- Modify: `src/main/services/importer.ts`, `tests/services/importer.test.ts`
- Modify: `src/shared/types.ts`, `src/main/ipc.ts`, `src/preload/index.ts`
- Delete: `src/main/services/clipboard-source.ts`, `src/main/services/clipboard-parse.ts`, `tests/services/clipboard-parse.test.ts`

- [ ] **Step 1: 在 importer 测试里用 addBytes 用例替换 addImageBuffer 用例**

在 `tests/services/importer.test.ts` 中,DELETE 这两个既有用例:
```ts
  it('addImageBuffer writes a png and stores the name', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#0a0' } }).png().toBuffer()
    const m = await importer.addImageBuffer('AS-1', png, '剪贴板图')
    expect(m.name).toBe('剪贴板图')
    expect(m.kind).toBe('image')
    expect(m.relPath).toMatch(/^AS-1\/images\/paste-\d+\.png$/)
    expect(existsSync(join(root, m.relPath))).toBe(true)
  })
```
和
```ts
  it('addImageBuffer rejects an empty buffer', async () => {
    await expect(importer.addImageBuffer('AS-1', Buffer.alloc(0), 'x')).rejects.toThrow(/empty/i)
  })
```
然后在同一个 `describe('Importer', ...)` 块内 ADD:
```ts
  it('addBytes writes an image with the given filename and stores the name', async () => {
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#0a0' } }).png().toBuffer()
    const m = await importer.addBytes('AS-1', 'paste.png', png, '剪贴板图')
    expect(m.name).toBe('剪贴板图')
    expect(m.kind).toBe('image')
    expect(m.relPath).toBe('AS-1/images/paste.png')
    expect(existsSync(join(root, m.relPath))).toBe(true)
  })

  it('addBytes classifies a video by extension', async () => {
    const m = await importer.addBytes('AS-1', 'clip.mp4', Buffer.from('x'), '视频')
    expect(m.kind).toBe('video')
    expect(m.relPath).toBe('AS-1/videos/clip.mp4')
  })

  it('addBytes throws on unsupported type', async () => {
    await expect(importer.addBytes('AS-1', 'note.txt', Buffer.from('x'), 'x')).rejects.toThrow(/unsupported/i)
  })

  it('addBytes rejects an empty buffer', async () => {
    await expect(importer.addBytes('AS-1', 'paste.png', Buffer.alloc(0), 'x')).rejects.toThrow(/empty/i)
  })
```
(`sharp`, `existsSync`, `join` 已在该测试文件顶部导入;`importer` 在 `beforeEach` 已用 thumb stub + 真实 MaterialRepo 构造。)

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/services/importer.test.ts`
Expected: FAIL — `addBytes` 未定义。

- [ ] **Step 3: 在 importer.ts 用 addBytes 取代 addImageBuffer**

在 `src/main/services/importer.ts` 中,DELETE 这个方法:
```ts
  /** Save an image buffer (e.g. from the clipboard) as a png and record it. */
  async addImageBuffer(aftersaleNo: string, buffer: Buffer, name: string): Promise<Material> {
    if (!buffer || buffer.length === 0) throw new Error('empty image buffer')
    const dest = this.uniqueDest(this.destDirFor(aftersaleNo, 'image'), `paste-${this.now()}.png`)
    writeFileSync(dest, buffer)
    return this.record(aftersaleNo, 'image', dest, name)
  }
```
ADD(放在 `addFile` 之后):
```ts
  /** Write file bytes (e.g. a pasted image/file) into the ticket folder and record it. */
  async addBytes(aftersaleNo: string, fileName: string, buffer: Buffer, name: string): Promise<Material> {
    const kind = this.kindOf(fileName)
    if (!kind) throw new Error('unsupported file type')
    if (!buffer || buffer.length === 0) throw new Error('empty file')
    const dest = this.uniqueDest(this.destDirFor(aftersaleNo, kind), fileName)
    writeFileSync(dest, buffer)
    return this.record(aftersaleNo, kind, dest, name)
  }
```
(`writeFileSync` 已在 importer.ts 顶部导入;`kindOf`/`uniqueDest`/`destDirFor`/`record` 均已存在。)

- [ ] **Step 4: 运行 importer 测试,确认通过**

Run: `npx vitest run tests/services/importer.test.ts`
Expected: PASS(含旧的 addFile/importFiles 用例 + 4 个 addBytes 用例)。

- [ ] **Step 5: 更新共享类型**

在 `src/shared/types.ts`:DELETE `ClipboardPeek` 接口:
```ts
export interface ClipboardPeek {
  type: 'image' | 'file' | 'empty'
  name?: string
  thumbDataUrl?: string
  path?: string
}
```
并把 `CreateMaterialPayload` 改为:
```ts
export type CreateMaterialPayload =
  | { source: 'file'; path: string; name: string }
  | { source: 'paste'; fileName: string; name: string; bytes: Uint8Array }
```
(`PickedFile`、`Material` 等保持不变。)

- [ ] **Step 6: 更新 ipc.ts**

在 `src/main/ipc.ts`:
1. DELETE import:
```ts
import { peekClipboard, readClipboardSource } from './services/clipboard-source'
```
2. DELETE 这个 handler:
```ts
  ipcMain.handle('clipboard:peek', () => peekClipboard())
```
3. 把 `materials:create` handler 整体替换为:
```ts
  ipcMain.handle('materials:create', async (_e, no: string, payload: import('../shared/types').CreateMaterialPayload) => {
    if (payload.source === 'file') return importer.addFile(no, payload.path, payload.name)
    return importer.addBytes(no, payload.fileName, Buffer.from(payload.bytes), payload.name)
  })
```
(`materials:pickFile` 保持不变。)

- [ ] **Step 7: 更新 preload**

在 `src/preload/index.ts`:
1. 从类型 import 移除 `ClipboardPeek`(其余 `Material`/`PickedFile`/`CreateMaterialPayload`/`Ticket`/`NewTicket` 保留)。
2. DELETE 这一行:
```ts
  peekClipboard: (): Promise<ClipboardPeek> => ipcRenderer.invoke('clipboard:peek'),
```
(`pickFile`、`createMaterial` 保留;`createMaterial` 签名不变。)

- [ ] **Step 8: 删除被取代的模块与测试**

```bash
git rm src/main/services/clipboard-source.ts src/main/services/clipboard-parse.ts tests/services/clipboard-parse.test.ts
```

- [ ] **Step 9: 全量验证**

Run: `npx vitest run`
Expected: 全绿。计数会比之前少 4(删掉 clipboard-parse 的 4 个),importer 用 addBytes 用例替换后净 +2;最终约 52。重点是**全绿、无失败**。
Run: `npm run build`
Expected: 干净打包。
> 注:此时 `NewMaterialDialog.tsx`(旧版)仍引用 `api.peekClipboard` 与 `ClipboardPeek` —— esbuild 不做类型检查,故 build 与 vitest 仍通过;该组件在 Task 2 重写。其既有组件测试(用 peek mock)此刻仍通过。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: addBytes replaces addImageBuffer; paste payload; drop main clipboard read"
```

---

## Task 2: NewMaterialDialog 改为手动粘贴 + 预览

**Files:**
- Modify: `src/renderer/components/NewMaterialDialog.tsx` (full rewrite)
- Modify: `tests/renderer/NewMaterialDialog.test.tsx` (full rewrite)

- [ ] **Step 1: 重写组件测试** `tests/renderer/NewMaterialDialog.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const createMaterial = vi.fn()
const pickFile = vi.fn()
vi.mock('../../src/renderer/api', () => ({
  api: {
    createMaterial: (...a: unknown[]) => createMaterial(...a),
    pickFile: (...a: unknown[]) => pickFile(...a)
  }
}))

import { NewMaterialDialog } from '../../src/renderer/components/NewMaterialDialog'

beforeEach(() => { createMaterial.mockReset(); pickFile.mockReset() })
afterEach(() => cleanup())

describe('NewMaterialDialog', () => {
  it('shows the paste prompt and disables 创建 initially', () => {
    render(<NewMaterialDialog open={true} aftersaleNo="AS-1" onCreated={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/粘贴图片或文件/)).toBeTruthy()
    expect((screen.getByText('创建').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('picks a file and creates with a file payload', async () => {
    pickFile.mockResolvedValue({ path: '/x/clip.mp4', name: 'clip' })
    createMaterial.mockResolvedValue({ id: 2, name: 'clip', relPath: 'AS-1/videos/clip.mp4', kind: 'video' })
    const onCreated = vi.fn()
    render(<NewMaterialDialog open={true} aftersaleNo="AS-1" onCreated={onCreated} onCancel={() => {}} />)
    fireEvent.click(screen.getByText('选择文件'))                 // switch tab
    fireEvent.click(await screen.findByText('选择文件…'))         // open picker
    await screen.findByText('clip.mp4')                           // basename shown (not the full path)
    fireEvent.click(screen.getByText('创建'))
    await waitFor(() => expect(createMaterial).toHaveBeenCalledWith('AS-1', { source: 'file', path: '/x/clip.mp4', name: 'clip' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: 运行,确认失败**

Run: `npx vitest run tests/renderer/NewMaterialDialog.test.tsx`
Expected: FAIL — 旧组件仍调用 `api.peekClipboard`(mock 里没有)且无粘贴提示文案 / 文件页显示的是完整路径。

- [ ] **Step 3: 重写组件** `src/renderer/components/NewMaterialDialog.tsx`

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Material } from '@shared/types'
import { api } from '../api'
import { IconClose, IconBox } from './icons'

interface Props { open: boolean; aftersaleNo: string; onCreated: (m: Material) => void; onCancel: () => void }
type Tab = 'clipboard' | 'file'
interface Pending { fileName: string; bytes: Uint8Array; previewUrl?: string; isImage: boolean }

const IMG_NAME: Record<string, string> = {
  'image/png': 'paste.png',
  'image/jpeg': 'paste.jpg',
  'image/gif': 'paste.gif',
  'image/webp': 'paste.webp'
}

export function NewMaterialDialog({ open, aftersaleNo, onCreated, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>('clipboard')
  const [pending, setPending] = useState<Pending | null>(null)
  const [picked, setPicked] = useState<{ path: string; name: string } | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameEdited = useRef(false)
  const pendingUrl = useRef<string | null>(null)

  function clearPending() {
    if (pendingUrl.current) { URL.revokeObjectURL(pendingUrl.current); pendingUrl.current = null }
    setPending(null)
  }

  useEffect(() => {
    if (!open) return
    setTab('clipboard'); setPicked(null); setError(null); setName(''); nameEdited.current = false; clearPending()
    return () => { clearPending() }
  }, [open])

  useEffect(() => {
    if (!open || tab !== 'clipboard') return
    const handler = async (e: ClipboardEvent) => {
      const dt = e.clipboardData
      if (!dt) return
      let file: File | null = null
      let isImage = false
      for (const it of Array.from(dt.items)) {
        if (it.kind === 'file' && it.type.startsWith('image/')) { file = it.getAsFile(); isImage = true; break }
      }
      if (!file && dt.files.length > 0) { file = dt.files[0]; isImage = file.type.startsWith('image/') }
      if (!file) { setError('未检测到可粘贴的图片或文件'); return }
      e.preventDefault()
      setError(null)
      const bytes = new Uint8Array(await file.arrayBuffer())
      const fileName = isImage ? (IMG_NAME[file.type] ?? (file.name || 'paste.png')) : (file.name || 'file')
      clearPending()
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined
      pendingUrl.current = previewUrl ?? null
      setPending({ fileName, bytes, previewUrl, isImage })
      if (!nameEdited.current) setName(isImage ? '粘贴图片' : fileName.replace(/\.[^.]+$/, ''))
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [open, tab])

  if (!open) return null

  const valid = tab === 'clipboard' ? !!pending : !!picked

  function choose(next: Tab) {
    setError(null); setTab(next); nameEdited.current = false
    if (next === 'clipboard') setPicked(null)
    else clearPending()
  }

  async function pick() {
    setError(null)
    const f = await api.pickFile()
    if (f) { setPicked(f); nameEdited.current = false; setName(f.name) }
  }

  function editName(v: string) { nameEdited.current = true; setName(v) }

  async function create() {
    if (!valid || busy) return
    setBusy(true); setError(null)
    try {
      const payload = tab === 'clipboard'
        ? { source: 'paste' as const, fileName: pending!.fileName, name, bytes: pending!.bytes }
        : { source: 'file' as const, path: picked!.path, name }
      const m = await api.createMaterial(aftersaleNo, payload)
      onCreated(m)
    } catch (e) {
      setError((e as Error).message || '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const pickedBase = picked ? picked.path.split(/[\\/]/).pop() : ''

  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">新建材料</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onCancel} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>

        <div className="mb-4 inline-flex rounded-lg border border-line bg-paper-2 p-0.5 text-sm">
          <button className={`rounded-md px-3 py-1.5 ${tab === 'clipboard' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`} onClick={() => choose('clipboard')}>从剪贴板</button>
          <button className={`rounded-md px-3 py-1.5 ${tab === 'file' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`} onClick={() => choose('file')}>选择文件</button>
        </div>

        <div className="mb-4 flex min-h-[112px] items-center justify-center rounded-lg border border-dashed border-line-strong bg-paper-2 p-3 text-center text-sm text-muted">
          {tab === 'clipboard' ? (
            pending?.isImage ? <img src={pending.previewUrl} alt="" className="max-h-28 rounded" />
            : pending ? <span className="flex items-center gap-2 font-mono text-xs text-ink-soft"><IconBox className="text-[16px]" /><span>{pending.fileName}</span></span>
            : <span className="text-muted">按 Cmd/Ctrl+V 粘贴图片或文件</span>
          ) : (
            picked ? <span className="flex items-center gap-2 font-mono text-xs text-ink-soft"><IconBox className="text-[16px]" /><span>{pickedBase}</span></span>
            : <button className="btn-ghost" onClick={pick}>选择文件…</button>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-soft">名称</span>
          <input className="field" value={name} onChange={(e) => editName(e.target.value)} placeholder="材料名称" />
        </label>

        {error && <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!valid || busy} onClick={create}>创建</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行,确认通过 + 全量**

Run: `npx vitest run tests/renderer/NewMaterialDialog.test.tsx` → PASS(2 例)。
Run: `npx vitest run` → 全绿。
Run: `npm run build` → 干净。
Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -vE "node_modules|Cannot find (type definition|module).*node:|Cannot find name '(Buffer|process|console)'" | grep -E "NewMaterialDialog|ipc.ts|preload|types.ts|importer" || echo "no feature type errors"`
Expected: `no feature type errors`(无 ClipboardPeek/peekClipboard 残留类型错误)。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/NewMaterialDialog.tsx tests/renderer/NewMaterialDialog.test.tsx
git commit -m "feat: paste-to-create material dialog with image preview"
```

---

## Task 3: 真机验证(dev)

**Files:** 无(仅验证)

- [ ] **Step 1: 切 Electron ABI 启动**

```bash
npm run rebuild:electron
npm run dev
```

- [ ] **Step 2: 手动验证清单**

1. 进入某售后单 → 「新建材料」→ 默认"从剪贴板"页,显示「按 Cmd/Ctrl+V 粘贴图片或文件」,「创建」禁用。
2. 系统截图到剪贴板 → 在对话框按 Cmd/Ctrl+V → 显示缩略图预览,名称预填「粘贴图片」→ 改名「问题截图」→ 创建 → 网格出现该材料,标题「问题截图」,缩略图正常显示。
3. 在访达/资源管理器复制一个图片或视频文件 → 按 Cmd/Ctrl+V → 若系统带入则显示文件名(不显示完整路径)→ 创建成功;若系统未带入则提示「未检测到可粘贴的图片或文件」。
4. 「选择文件」→ 选一个文件 → 仅显示文件名(非完整路径)→ 创建成功。
5. 复制一段纯文字后按 Cmd/Ctrl+V → 提示「未检测到可粘贴的图片或文件」,「创建」保持禁用。
6. 预览/网格标题显示材料名称。

- [ ] **Step 3: (可选)合成粘贴事件自检**

无法用截图工具时,可在 DevTools Console 跑(验证整链:构造带 File 的 paste 事件 → 预览 → 创建):
```js
const dt = new DataTransfer()
dt.items.add(new File([new Uint8Array([137,80,78,71])], 'x.png', { type: 'image/png' }))
document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }))
```
(注:`window` 监听 paste;`document.dispatchEvent` 会冒泡到 window。)

- [ ] **Step 4: 还原 ABI**

```bash
npm run rebuild:node
npx vitest run   # 确认仍全绿
```

---

## Self-Review 记录

- **Spec 覆盖**:渲染层 paste 监听 + 图像/文件读取 + 对象 URL 预览 → Task 2;载荷 `paste`(字节)→ Task 1(types/ipc/preload);`addBytes` 取代 `addImageBuffer` → Task 1;移除 clipboard-source/parse + peek → Task 1;粘贴区/文件页 basename/不显示路径 → Task 2;错误处理(无可粘贴内容、不支持类型、空字节)→ Task 1(addBytes)+ Task 2(行内);测试(addBytes TDD、删 clipboard-parse 测试、对话框轻量测、dev 手验)→ Task 1/2/3;不做拖拽/多文件/大文件流式 → 未引入。
- **类型一致性**:`CreateMaterialPayload` 的 `paste` 变体 `{source:'paste',fileName,name,bytes}`(Task 1 types)与 ipc handler(Task 1)、对话框 `create()` 构造(Task 2)一致;`addBytes(aftersaleNo,fileName,buffer,name)` 签名在 importer(Task 1)、ipc 调用(Task 1)一致;`Buffer.from(payload.bytes)` 接受 `Uint8Array`;`ClipboardPeek`/`peekClipboard`/`addImageBuffer` 在所有引用处同步移除(types/preload/ipc/importer + 旧对话框在 Task 2 重写)。
- **测试绿度**:Task 1 后旧对话框仍引用 peek 但 esbuild 不报错、其旧测试用 peek mock 仍过;Task 2 重写对话框与其测试,Task 4 步用 tsc 确认无残留类型错误。
- **占位符**:无。
