# Video Transcode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual, high-freedom video transcoding (format/resolution/quality/fps/audio/extra-args) that writes a new file beside the original, runs ffmpeg asynchronously with progress + cancel, and queues bulk jobs sequentially.

**Architecture:** A pure arg-builder + progress-parser (unit-tested, no ffmpeg) drive a thin `Transcoder` service that spawns ffmpeg (shared `FFMPEG` path) with AbortSignal cancel. IPC runs jobs, computes a deduped output path in the video's folder, and streams `transcode:progress` events; the renderer shows a `TranscodeDialog` (the form) launched from a 转码 toolbar button, queueing selected videos.

**Tech Stack:** Electron (main spawn ffmpeg), ffmpeg-static, React/TS renderer, Vitest.

## Global Constraints

- Local main worktree only: commit to `main`, **never push / force / rewrite refs**.
- Reuse the already-fixed ffmpeg path resolution (`ffmpeg-static` path → `.replace('app.asar', 'app.asar.unpacked')`); do not re-derive it ad hoc — extract it to one module (Task 2) and use everywhere.
- Output is a **new file** in the original's folder, name deduped; never replace/delete the original.
- Default params = `mp4·H.264` + 原始分辨率 + CRF 23 + 原始帧率 + 重编码音频 → one-click upload-ready mp4.
- Default CRF by codec: x264=23, x265=28, vp9=33. Resolution long-edge presets: 1080p=1920, 720p=1280, 480p=854.
- Extra ffmpeg args: split on whitespace, appended before the output path, NOT run through a shell.
- After `npm run dev`, run `npm run rebuild:node` before vitest (node↔electron ABI).

---

### Task 1: Transcode options type + pure arg-builder + progress parsers

**Files:**
- Create: `src/shared/transcode.ts`
- Create: `src/main/services/transcode-args.ts`
- Test: `tests/services/transcode-args.test.ts`

**Interfaces:**
- Produces (`src/shared/transcode.ts`):
  ```ts
  export type TranscodeFormat = 'mp4-h264' | 'mp4-h265' | 'mov-h264' | 'mov-h265' | 'webm-vp9' | 'mkv-h264' | 'mkv-h265'
  export type Resolution = { kind: 'original' } | { kind: 'longEdge'; px: number } | { kind: 'wh'; w: number; h: number }
  export type Quality = { mode: 'crf'; crf: number } | { mode: 'bitrate'; kbps: number }
  export interface TranscodeOptions {
    format: TranscodeFormat
    resolution: Resolution
    quality: Quality
    fps: number | 'original'
    audio: 'reencode' | 'copy' | 'none'
    extraArgs: string
    outputName: string   // stem (no extension)
  }
  export interface TranscodeFormatInfo { container: 'mp4' | 'mov' | 'webm' | 'mkv'; vcodec: 'libx264' | 'libx265' | 'libvpx-vp9'; acodec: 'aac' | 'libopus' }
  export const FORMATS: Record<TranscodeFormat, TranscodeFormatInfo>
  export function defaultCrf(vcodec: TranscodeFormatInfo['vcodec']): number  // 23/28/33
  ```
- Produces (`src/main/services/transcode-args.ts`):
  ```ts
  export function buildTranscodeArgs(srcAbs: string, destAbs: string, opts: TranscodeOptions): string[]
  export function parseDurationMs(text: string): number | null   // from "Duration: HH:MM:SS.cc"
  export function parseProgressMs(text: string): number | null   // last "time=HH:MM:SS.cc"
  export function dedupeName(existing: string[], desired: string): string  // "a.mp4" -> "a-1.mp4" if taken
  ```

- [ ] **Step 1: Write the failing test** — `tests/services/transcode-args.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { buildTranscodeArgs, parseDurationMs, parseProgressMs, dedupeName } from '../../src/main/services/transcode-args'
import type { TranscodeOptions } from '../../src/shared/transcode'

const base: TranscodeOptions = {
  format: 'mp4-h264', resolution: { kind: 'original' }, quality: { mode: 'crf', crf: 23 },
  fps: 'original', audio: 'reencode', extraArgs: '', outputName: 'out',
}
const args = (o: Partial<TranscodeOptions>) => buildTranscodeArgs('/in.mov', '/out.mp4', { ...base, ...o })

describe('buildTranscodeArgs', () => {
  it('mp4·H.264 default: x264 + crf + aac + faststart, input first, output last', () => {
    const a = args({})
    expect(a[0]).toBe('-y'); expect(a[1]).toBe('-i'); expect(a[2]).toBe('/in.mov')
    expect(a).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart']))
    expect(a[a.length - 1]).toBe('/out.mp4')
  })
  it('H.265 + bitrate mode', () => {
    const a = args({ format: 'mp4-h265', quality: { mode: 'bitrate', kbps: 4000 } })
    expect(a).toEqual(expect.arrayContaining(['-c:v', 'libx265', '-b:v', '4000k']))
    expect(a).not.toContain('-crf')
  })
  it('vp9/webm: libvpx-vp9 + opus, no faststart, crf needs -b:v 0', () => {
    const a = args({ format: 'webm-vp9' })
    expect(a).toEqual(expect.arrayContaining(['-c:v', 'libvpx-vp9', '-crf', '23', '-b:v', '0', '-c:a', 'libopus']))
    expect(a).not.toContain('-movflags')
  })
  it('resolution longEdge → scale filter with even dims', () => {
    const a = args({ resolution: { kind: 'longEdge', px: 1280 } })
    const i = a.indexOf('-vf')
    expect(i).toBeGreaterThan(-1)
    expect(a[i + 1]).toBe("scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2")
  })
  it('resolution wh, custom fps, audio none, extra args appended before output', () => {
    const a = args({ resolution: { kind: 'wh', w: 720, h: 1280 }, fps: 30, audio: 'none', extraArgs: '-tag:v hvc1' })
    expect(a[a.indexOf('-vf') + 1]).toBe('scale=720:1280:force_original_aspect_ratio=decrease:force_divisible_by=2')
    expect(a).toEqual(expect.arrayContaining(['-r', '30', '-an', '-tag:v', 'hvc1']))
    expect(a).not.toContain('-c:a')
    expect(a.indexOf('-tag:v')).toBeLessThan(a.length - 1) // before output
  })
  it('audio copy', () => { expect(args({ audio: 'copy' })).toEqual(expect.arrayContaining(['-c:a', 'copy'])) })
  it('original resolution + original fps → no -vf, no -r', () => {
    const a = args({}); expect(a).not.toContain('-vf'); expect(a).not.toContain('-r')
  })
})

describe('parse helpers', () => {
  it('parseDurationMs reads Duration line', () => {
    expect(parseDurationMs('  Duration: 00:01:02.50, start: 0')).toBe(62500)
    expect(parseDurationMs('no duration here')).toBeNull()
  })
  it('parseProgressMs reads the last time= token', () => {
    expect(parseProgressMs('frame=1 time=00:00:10.00 bitrate=')).toBe(10000)
    expect(parseProgressMs('nope')).toBeNull()
  })
})

describe('dedupeName', () => {
  it('appends -1, -2 when taken', () => {
    expect(dedupeName([], 'a.mp4')).toBe('a.mp4')
    expect(dedupeName(['a.mp4'], 'a.mp4')).toBe('a-1.mp4')
    expect(dedupeName(['a.mp4', 'a-1.mp4'], 'a.mp4')).toBe('a-2.mp4')
  })
})
```

- [ ] **Step 2: Run — expect FAIL** `npx vitest run tests/services/transcode-args.test.ts`

- [ ] **Step 3: Implement** `src/shared/transcode.ts`:

```ts
export type TranscodeFormat = 'mp4-h264' | 'mp4-h265' | 'mov-h264' | 'mov-h265' | 'webm-vp9' | 'mkv-h264' | 'mkv-h265'
export type Resolution = { kind: 'original' } | { kind: 'longEdge'; px: number } | { kind: 'wh'; w: number; h: number }
export type Quality = { mode: 'crf'; crf: number } | { mode: 'bitrate'; kbps: number }
export interface TranscodeOptions {
  format: TranscodeFormat
  resolution: Resolution
  quality: Quality
  fps: number | 'original'
  audio: 'reencode' | 'copy' | 'none'
  extraArgs: string
  outputName: string
}
export interface TranscodeFormatInfo { container: 'mp4' | 'mov' | 'webm' | 'mkv'; vcodec: 'libx264' | 'libx265' | 'libvpx-vp9'; acodec: 'aac' | 'libopus' }
export const FORMATS: Record<TranscodeFormat, TranscodeFormatInfo> = {
  'mp4-h264': { container: 'mp4', vcodec: 'libx264', acodec: 'aac' },
  'mp4-h265': { container: 'mp4', vcodec: 'libx265', acodec: 'aac' },
  'mov-h264': { container: 'mov', vcodec: 'libx264', acodec: 'aac' },
  'mov-h265': { container: 'mov', vcodec: 'libx265', acodec: 'aac' },
  'webm-vp9': { container: 'webm', vcodec: 'libvpx-vp9', acodec: 'libopus' },
  'mkv-h264': { container: 'mkv', vcodec: 'libx264', acodec: 'aac' },
  'mkv-h265': { container: 'mkv', vcodec: 'libx265', acodec: 'aac' },
}
export function defaultCrf(vcodec: TranscodeFormatInfo['vcodec']): number {
  return vcodec === 'libx264' ? 23 : vcodec === 'libx265' ? 28 : 33
}
```
  and `src/main/services/transcode-args.ts`:

```ts
import { extname, basename } from 'node:path'
import { FORMATS, type TranscodeOptions } from '../../shared/transcode'

export function buildTranscodeArgs(srcAbs: string, destAbs: string, opts: TranscodeOptions): string[] {
  const f = FORMATS[opts.format]
  const a: string[] = ['-y', '-i', srcAbs, '-c:v', f.vcodec]
  if (opts.quality.mode === 'crf') {
    a.push('-crf', String(opts.quality.crf))
    if (f.vcodec === 'libvpx-vp9') a.push('-b:v', '0')
  } else {
    a.push('-b:v', `${opts.quality.kbps}k`)
  }
  const r = opts.resolution
  if (r.kind === 'longEdge') a.push('-vf', `scale=${r.px}:${r.px}:force_original_aspect_ratio=decrease:force_divisible_by=2`)
  else if (r.kind === 'wh') a.push('-vf', `scale=${r.w}:${r.h}:force_original_aspect_ratio=decrease:force_divisible_by=2`)
  if (opts.fps !== 'original') a.push('-r', String(opts.fps))
  if (opts.audio === 'none') a.push('-an')
  else if (opts.audio === 'copy') a.push('-c:a', 'copy')
  else a.push('-c:a', f.acodec)
  if (f.container === 'mp4' || f.container === 'mov') a.push('-movflags', '+faststart')
  const extra = opts.extraArgs.trim()
  if (extra) a.push(...extra.split(/\s+/))
  a.push(destAbs)
  return a
}

const toMs = (h: string, m: string, s: string): number => (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000

export function parseDurationMs(text: string): number | null {
  const m = text.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/)
  return m ? Math.round(toMs(m[1], m[2], m[3])) : null
}
export function parseProgressMs(text: string): number | null {
  const all = [...text.matchAll(/time=\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)]
  const m = all[all.length - 1]
  return m ? Math.round(toMs(m[1], m[2], m[3])) : null
}
export function dedupeName(existing: string[], desired: string): string {
  if (!existing.includes(desired)) return desired
  const ext = extname(desired); const stem = basename(desired, ext)
  let i = 1; let cand = `${stem}-${i}${ext}`
  while (existing.includes(cand)) { i++; cand = `${stem}-${i}${ext}` }
  return cand
}
```

- [ ] **Step 4: Run — expect PASS** `npx vitest run tests/services/transcode-args.test.ts`
- [ ] **Step 5: Commit** `git add src/shared/transcode.ts src/main/services/transcode-args.ts tests/services/transcode-args.test.ts && git commit -m "feat(transcode): options type + pure ffmpeg arg builder & progress parsers"`

---

### Task 2: Shared ffmpeg path + Transcoder service

**Files:**
- Create: `src/main/services/ffmpeg-path.ts`
- Modify: `src/main/services/thumbnails.ts` (import the shared `FFMPEG` instead of the local const)
- Create: `src/main/services/transcoder.ts`
- Test: `tests/services/transcoder.test.ts`

**Interfaces:**
- Consumes: `buildTranscodeArgs`, `parseDurationMs`, `parseProgressMs` (Task 1).
- Produces:
  - `src/main/services/ffmpeg-path.ts`: `export const FFMPEG: string | null` (= `ffmpeg-static` path with `app.asar`→`app.asar.unpacked`).
  - `src/main/services/transcoder.ts`: `export class Transcoder { transcode(srcAbs: string, destAbs: string, opts: TranscodeOptions, onProgress: (percent: number) => void, signal: AbortSignal): Promise<void> }` — spawns ffmpeg with `buildTranscodeArgs`; reads stderr to track `parseDurationMs` once then `parseProgressMs` → `onProgress(0..100)`; resolves on exit 0; rejects with an Error (message = tail of stderr) on non-zero/spawn error; `signal.abort()` kills the process and rejects with an Error named `AbortError`; on failure/abort, removes a partial `destAbs`.

- [ ] **Step 1: Write the failing test** — `tests/services/transcoder.test.ts` (integration: generates a tiny clip with ffmpeg, transcodes it; skips cleanly if ffmpeg is unavailable)

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { FFMPEG } from '../../src/main/services/ffmpeg-path'
import { Transcoder } from '../../src/main/services/transcoder'
import type { TranscodeOptions } from '../../src/shared/transcode'

const run = FFMPEG ? describe : describe.skip
let dir: string; let src: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'vh-tc-'))
  src = join(dir, 'src.mp4')
  // 0.3s test pattern, h264
  spawnSync(FFMPEG!, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=0.3', '-c:v', 'libx264', src], { stdio: 'ignore' })
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const opts: TranscodeOptions = {
  format: 'mp4-h264', resolution: { kind: 'longEdge', px: 160 }, quality: { mode: 'crf', crf: 28 },
  fps: 'original', audio: 'none', extraArgs: '', outputName: 'out',
}

run('Transcoder', () => {
  it('transcodes to the destination and reports progress', async () => {
    const out = join(dir, 'out.mp4')
    let last = 0
    await new Transcoder().transcode(src, out, opts, (p) => { last = Math.max(last, p) }, new AbortController().signal)
    expect(existsSync(out)).toBe(true)
    expect(last).toBeGreaterThan(0)
  })
  it('abort kills the job and leaves no partial file', async () => {
    const out = join(dir, 'aborted.mp4')
    const ac = new AbortController()
    const p = new Transcoder().transcode(src, out, opts, () => {}, ac.signal)
    ac.abort()
    await expect(p).rejects.toBeTruthy()
    expect(existsSync(out)).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** `npm run rebuild:node && npx vitest run tests/services/transcoder.test.ts`
- [ ] **Step 3: Implement**
  - `src/main/services/ffmpeg-path.ts`:
    ```ts
    import ffmpegPath from 'ffmpeg-static'
    export const FFMPEG: string | null = ffmpegPath ? ffmpegPath.replace('app.asar', 'app.asar.unpacked') : null
    ```
  - In `thumbnails.ts`: delete its local `const FFMPEG = …` and `import ffmpegPath`, and `import { FFMPEG } from './ffmpeg-path'` instead (behavior identical).
  - `src/main/services/transcoder.ts`:
    ```ts
    import { spawn } from 'node:child_process'
    import { rmSync } from 'node:fs'
    import { FFMPEG } from './ffmpeg-path'
    import { buildTranscodeArgs, parseDurationMs, parseProgressMs } from './transcode-args'
    import type { TranscodeOptions } from '../../shared/transcode'

    export class Transcoder {
      transcode(srcAbs: string, destAbs: string, opts: TranscodeOptions, onProgress: (percent: number) => void, signal: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
          if (!FFMPEG) return reject(new Error('转码不可用:未找到 ffmpeg'))
          const proc = spawn(FFMPEG, buildTranscodeArgs(srcAbs, destAbs, opts), { stdio: ['ignore', 'ignore', 'pipe'] })
          let durationMs: number | null = null
          let tail = ''
          const onAbort = () => proc.kill('SIGKILL')
          signal.addEventListener('abort', onAbort)
          proc.stderr.on('data', (b: Buffer) => {
            const s = b.toString()
            tail = (tail + s).slice(-2000)
            if (durationMs == null) durationMs = parseDurationMs(s)
            const t = parseProgressMs(s)
            if (durationMs && t != null) onProgress(Math.min(100, Math.round((t / durationMs) * 100)))
          })
          proc.on('error', (e) => { signal.removeEventListener('abort', onAbort); try { rmSync(destAbs, { force: true }) } catch { /* */ }; reject(e) })
          proc.on('close', (code) => {
            signal.removeEventListener('abort', onAbort)
            if (signal.aborted) { try { rmSync(destAbs, { force: true }) } catch { /* */ }; const e = new Error('已取消'); e.name = 'AbortError'; return reject(e) }
            if (code === 0) return resolve()
            try { rmSync(destAbs, { force: true }) } catch { /* */ }
            reject(new Error(tail.trim().split('\n').slice(-3).join('\n') || `ffmpeg 退出码 ${code}`))
          })
        })
      }
    }
    ```
- [ ] **Step 4: Run — expect PASS** `npx vitest run tests/services/transcoder.test.ts tests/services/thumb-cache.test.ts` (thumbnails still green after the FFMPEG import refactor)
- [ ] **Step 5: Commit** `git add src/main/services/ffmpeg-path.ts src/main/services/thumbnails.ts src/main/services/transcoder.ts tests/services/transcoder.test.ts && git commit -m "feat(transcode): shared ffmpeg path + Transcoder service (progress + cancel)"`

---

### Task 3: IPC + preload (transcode job, progress event, cancel)

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

**Interfaces:**
- Consumes: `Transcoder` (Task 2), `dedupeName` (Task 1), `FileTree`/`materialDir` for the video's folder (existing), `TranscodeOptions` (Task 1).
- Produces (preload `api`):
  - `transcodeMaterial(no: string, relPath: string, opts: TranscodeOptions): Promise<Material>` — resolves with the new material (the output file), or rejects on failure/cancel.
  - `cancelTranscode(relPath: string): Promise<void>`
  - `onTranscodeProgress(cb: (p: { relPath: string; percent: number }) => void): () => void` — event subscription (same pattern as `onMaterialsChanged`).

- [ ] **Step 1:** In `ipc.ts` add `const transcoder = new Transcoder()` and a `const jobs = new Map<string, AbortController>()` (keyed by source relPath). Handlers:
  ```ts
  ipcMain.handle('materials:transcode', async (e, no: string, relPath: string, opts: import('../shared/transcode').TranscodeOptions): Promise<Material> => {
    const folder = folderOfRelPath(relPath)
    const dir = materialDir(dataRoot, no, folder)
    const ext = '.' + FORMATS[opts.format].container
    const desired = `${opts.outputName}${ext}`
    const existing = readdirSync(dir)
    const name = dedupeName(existing, desired)
    const destAbs = join(dir, name)
    const ac = new AbortController(); jobs.set(relPath, ac)
    try {
      await transcoder.transcode(join(dataRoot, relPath), destAbs, opts,
        (percent) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('transcode:progress', { relPath, percent }) },
        ac.signal)
    } finally { jobs.delete(relPath) }
    const st = statSync(destAbs)
    const newRel = folder ? `${safeDir(no)}/${folder}/${name}` : `${safeDir(no)}/${name}`
    return { relPath: newRel, folder, name, kind: 'video', sizeBytes: st.size, modifiedAt: st.mtimeMs }
  })
  ipcMain.handle('materials:cancelTranscode', (_e, relPath: string) => { jobs.get(relPath)?.abort() })
  ```
  Add imports: `Transcoder` from `./services/transcoder`, `dedupeName` from `./services/transcode-args`, `FORMATS` from `../shared/transcode`, `folderOfRelPath` from `../shared/material-meta`, `readdirSync`/`statSync` from `node:fs` (extend the existing import).
- [ ] **Step 2:** In `preload/index.ts` add the three methods (`transcodeMaterial`, `cancelTranscode`, `onTranscodeProgress`) mirroring the `onMaterialsChanged`/invoke patterns already present. Import `TranscodeOptions` type.
- [ ] **Step 3: Verify** `npx tsc --noEmit` → 0; `npm run lint` → clean; `npm run build` → clean.
- [ ] **Step 4: Commit** `git commit -am "feat(transcode): ipc + preload — run job, stream progress, cancel"`

---

### Task 4: TranscodeDialog + toolbar wiring (queue, progress, cancel)

**Files:**
- Create: `src/renderer/components/TranscodeDialog.tsx`
- Modify: `src/renderer/components/TicketDetail.tsx`

**Interfaces:**
- Consumes: `api.transcodeMaterial`, `api.cancelTranscode`, `api.onTranscodeProgress` (Task 3); `TranscodeOptions`, `FORMATS`, `defaultCrf` (Task 1); the existing `materials`/`selected` state in `TicketDetail`.

- [ ] **Step 1: Build `TranscodeDialog.tsx`** — a themed modal (reuse `scrim`/`modal-card` like `SettingsDialog`/`AboutDialog`) with the high-freedom form:
  - 输出格式 `<select>`→ no; use the app's control style: a labeled `<select className="field">` is acceptable here (inside a form), OR reuse simple selects styled with `.field`. Fields: 输出格式 (7 FORMATS keys with labels), 分辨率 (原始/1080p/720p/480p/自定义→长边 or 宽×高 number inputs), 画质 (radio: 质量 CRF number / 目标码率 kbps number; CRF default = `defaultCrf(FORMATS[format].vcodec)`), 帧率 (原始/60/30/24/自定义), 音频 (重编码/保留/去掉), 输出文件名 (text, default = `<原stem>`), 高级折叠: 附加参数 text.
  - Compatibility hint line when format is H.265/webm/mkv.
  - Props: `{ open: boolean; videoCount: number; defaultStem: string; onCancel: () => void; onConfirm: (opts: TranscodeOptions) => void }`. The dialog builds a single `TranscodeOptions` (outputName from the field) and calls `onConfirm`.
  - When `videoCount > 1`, show "将对 N 个视频应用相同参数(文件名各自派生)" and the per-file outputName is derived by TicketDetail (ignore the single name field for bulk, or disable it) — keep it simple: if bulk, hide the filename field and TicketDetail derives each name from the source stem.

- [ ] **Step 2: Wire into `TicketDetail.tsx`:**
  - In the selected-actions toolbar (next to MoveToMenu), add a `转码` `btn-ghost` button, shown only when the selection contains ≥1 video (`[...selected].some((rp) => materials.find((m) => m.relPath === rp)?.kind === 'video')`).
  - Clicking opens `TranscodeDialog` with `videoCount` = number of selected videos, `defaultStem` = the single video's stem (or '' for bulk).
  - State: `transcoding: { relPath: string; percent: number; index: number; total: number } | null`. On confirm: build the queue (selected video relPaths), then sequentially `await api.transcodeMaterial(aftersaleNo, relPath, optsForThisFile)` (for bulk, set `opts.outputName` = that file's stem). Subscribe `api.onTranscodeProgress` to update `percent` for the current `relPath`. Show a small progress overlay (`第 index/total · 文件名 · percent%`) with a 取消 button → `api.cancelTranscode(currentRelPath)` and stop the queue.
  - On each success: toast via `setMsg`; the watcher refresh (or call `reload()`) surfaces the new file. On failure: collect, continue queue; at end `setMsg` summarizing `已转码 X 个，失败 Y 个`. On cancel: stop, `setMsg('已取消转码')`.
- [ ] **Step 3: Verify** `npx tsc --noEmit` → 0; `npm run lint` → clean; `npm run build` → clean; `npm run rebuild:node && npx vitest run` → all pass (update the TicketDetail test if it needs `window.api.transcodeMaterial`/`onTranscodeProgress` mocks).
- [ ] **Step 4: Launch-verify** `npm run dev`: select a video → 转码 → pick mp4·H.264 720p → confirm → progress shows → new file appears and previews. (Then `npm run rebuild:node` before any further vitest.)
- [ ] **Step 5: Commit** `git commit -am "feat(transcode): TranscodeDialog + toolbar queue with progress & cancel"`

---

## Self-Review

**Spec coverage:** goal/new-file output (T3) ✓; manual trigger + toolbar + dialog (T4) ✓; high-freedom params — format list/resolution incl custom/CRF-or-bitrate/fps incl custom/audio modes/extra-args/output name (T1 type + T4 form) ✓; default = mp4·H.264 CRF23 (T1 defaults + T4) ✓; async ffmpeg + progress + cancel (T2 service, T3 events, T4 UI) ✓; bulk sequential queue + failure-continue summary (T4) ✓; H.265/webm/mkv compat hint (T4) ✓; non-video ignored (T4 button guard + queue filters videos) ✓; shared ffmpeg path reuse (T2) ✓; testing buildArgs/parsers/dedupe (T1) + Transcoder integration (T2) ✓.

**Placeholder scan:** none — pure code is complete (T1/T2); T3/T4 give exact handler/wiring code and the form field list with concrete options. T4's form markup is described field-by-field with the exact option sets rather than full JSX (mechanical, gated by tsc/lint/build + launch-verify).

**Type consistency:** `TranscodeOptions` shape identical across T1→T4; `FORMATS`/`defaultCrf` names match; `transcodeMaterial(no, relPath, opts)→Material`, `cancelTranscode(relPath)`, `onTranscodeProgress({relPath,percent})` consistent T3↔T4; `dedupeName(existing[], desired)` matches T1↔T3; Transcoder `transcode(src,dest,opts,onProgress,signal)` matches T2↔T3.
