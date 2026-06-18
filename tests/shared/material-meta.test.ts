import { describe, it, expect } from 'vitest'
import { kindFromName, folderOfRelPath, nameOfRelPath } from '../../src/shared/material-meta'

describe('material-meta', () => {
  it('classifies by extension (case-insensitive), unknown -> other', () => {
    expect(kindFromName('a.JPG')).toBe('image')
    expect(kindFromName('clip.mp4')).toBe('video')
    expect(kindFromName('doc.pdf')).toBe('other')
    expect(kindFromName('noext')).toBe('other')
  })
  it('derives folder (between ticket seg and filename) and name from relPath', () => {
    expect(folderOfRelPath('21275/凭证/聊天/a.jpg')).toBe('凭证/聊天')
    expect(folderOfRelPath('21275/a.jpg')).toBe('')
    expect(nameOfRelPath('21275/凭证/a.jpg')).toBe('a.jpg')
  })
})
