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
