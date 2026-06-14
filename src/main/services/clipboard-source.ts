import { clipboard } from 'electron'
import { basename, extname } from 'node:path'
import { parseFileUrl, parseWindowsFileNameW } from './clipboard-parse'
import type { ClipboardPeek } from '../../shared/types'

function clipboardFilePath(): string | null {
  if (process.platform === 'darwin') {
    const u = clipboard.read('public.file-url')
    if (!u) return null
    try { return parseFileUrl(u) } catch { return null }
  }
  if (process.platform === 'win32') {
    const buf = clipboard.readBuffer('FileNameW')
    if (!buf || buf.length === 0) return null
    return parseWindowsFileNameW(buf) || null
  }
  return null
}

/** Inspect the clipboard for the new-material preview. */
export function peekClipboard(): ClipboardPeek {
  const img = clipboard.readImage()
  if (!img.isEmpty()) {
    return { type: 'image', name: '粘贴图片', thumbDataUrl: img.resize({ width: 240 }).toDataURL() }
  }
  const p = clipboardFilePath()
  if (p) return { type: 'file', name: basename(p, extname(p)), path: p }
  return { type: 'empty' }
}

/** Read the clipboard at create time. */
export function readClipboardSource(): { kind: 'image'; buffer: Buffer } | { kind: 'file'; path: string } | null {
  const img = clipboard.readImage()
  if (!img.isEmpty()) return { kind: 'image', buffer: img.toPNG() }
  const p = clipboardFilePath()
  if (p) return { kind: 'file', path: p }
  return null
}
