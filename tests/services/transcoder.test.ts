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
  // 3s test pattern, h264 (0.3s is too short for ffmpeg to emit a time= progress line)
  spawnSync(FFMPEG!, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10:duration=3', '-c:v', 'libx264', src], { stdio: 'ignore' })
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
