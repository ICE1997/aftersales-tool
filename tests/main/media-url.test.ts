import { describe, it, expect } from 'vitest'
import { MEDIA_SCHEME, mediaUrl } from '../../src/main/media-url'

describe('mediaUrl', () => {
  it('builds a custom-scheme url from a relative path', () => {
    expect(mediaUrl('AS-1/images/a.jpg')).toBe('vhmedia://local/AS-1/images/a.jpg')
  })

  it('percent-encodes each segment but preserves the slashes', () => {
    expect(mediaUrl('A B/v 2/p q.jpg')).toBe('vhmedia://local/A%20B/v%202/p%20q.jpg')
  })

  it('encodes non-ascii filenames', () => {
    const u = mediaUrl('AS-1/images/破损.png')
    expect(u).toBe(`${MEDIA_SCHEME}://local/AS-1/images/${encodeURIComponent('破损.png')}`)
  })

  it('round-trips: decoding the URL pathname yields the original relPath', () => {
    const rel = 'AS-1/images/破 损.png'
    const u = new URL(mediaUrl(rel))
    expect(decodeURIComponent(u.pathname).replace(/^\/+/, '')).toBe(rel)
  })
})
