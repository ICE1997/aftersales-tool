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
