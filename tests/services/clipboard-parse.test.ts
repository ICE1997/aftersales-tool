import { describe, it, expect } from 'vitest'
import { parseFileUrl, parseWindowsFileNameW } from '../../src/main/services/clipboard-parse'

describe('parseFileUrl', () => {
  it('decodes a file URL to a path', () => {
    expect(parseFileUrl('file:///Users/x/a%20b.png')).toBe('/Users/x/a b.png')
  })
  it('trims surrounding whitespace', () => {
    expect(parseFileUrl('  file:///tmp/p.png\n')).toBe('/tmp/p.png')
  })
})

describe('parseWindowsFileNameW', () => {
  it('reads the first NUL-terminated UTF-16LE path', () => {
    const buf = Buffer.from('C:\\imgs\\a.png\0', 'utf16le')
    expect(parseWindowsFileNameW(buf)).toBe('C:\\imgs\\a.png')
  })
  it('returns the first of several NUL-separated paths', () => {
    const buf = Buffer.from('C:\\a.png\0C:\\b.png\0', 'utf16le')
    expect(parseWindowsFileNameW(buf)).toBe('C:\\a.png')
  })
})
