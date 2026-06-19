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
