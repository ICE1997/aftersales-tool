import { fileURLToPath } from 'node:url'

/** Convert a file:// URL (e.g. from macOS clipboard 'public.file-url') to a filesystem path. */
export function parseFileUrl(url: string): string {
  return fileURLToPath(url.trim())
}

/** Parse a Windows 'FileNameW' clipboard buffer (UTF-16LE, NUL-separated) and return the first path. */
export function parseWindowsFileNameW(buffer: Buffer): string {
  return buffer.toString('utf16le').replace(/\0+$/g, '').split('\0')[0] ?? ''
}
