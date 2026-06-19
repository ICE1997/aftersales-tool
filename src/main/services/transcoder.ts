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
