import { useEffect, useState } from 'react'
import type { TranscodeFormat, TranscodeOptions, Resolution } from '@shared/transcode'
import { FORMATS, defaultCrf } from '@shared/transcode'
import { IconClose } from './icons'

const FORMAT_OPTIONS: { value: TranscodeFormat; label: string }[] = [
  { value: 'mp4-h264', label: 'mp4 · H.264(推荐)' },
  { value: 'mp4-h265', label: 'mp4 · H.265' },
  { value: 'mov-h264', label: 'mov · H.264' },
  { value: 'mov-h265', label: 'mov · H.265' },
  { value: 'webm-vp9', label: 'webm · VP9' },
  { value: 'mkv-h264', label: 'mkv · H.264' },
  { value: 'mkv-h265', label: 'mkv · H.265' },
]

type ResPreset = 'original' | '1080' | '720' | '480' | 'custom'
const PRESET_PX: Record<'1080' | '720' | '480', number> = { '1080': 1920, '720': 1280, '480': 854 }

type FpsPreset = 'original' | '60' | '30' | '24' | 'custom'

function isCompatRisky(format: TranscodeFormat): boolean {
  const { vcodec, container } = FORMATS[format]
  return vcodec === 'libx265' || container === 'webm' || container === 'mkv'
}

export function TranscodeDialog({
  open, videoCount, defaultStem, onCancel, onConfirm,
}: {
  open: boolean
  videoCount: number
  defaultStem: string
  onCancel: () => void
  onConfirm: (opts: TranscodeOptions) => void
}) {
  const [format, setFormat] = useState<TranscodeFormat>('mp4-h264')
  const [resPreset, setResPreset] = useState<ResPreset>('original')
  const [customResMode, setCustomResMode] = useState<'longEdge' | 'wh'>('longEdge')
  const [longEdge, setLongEdge] = useState(1920)
  const [width, setWidth] = useState(1920)
  const [height, setHeight] = useState(1080)
  const [qualityMode, setQualityMode] = useState<'crf' | 'bitrate'>('crf')
  const [crf, setCrf] = useState(() => defaultCrf(FORMATS['mp4-h264'].vcodec))
  const [crfTouched, setCrfTouched] = useState(false)
  const [kbps, setKbps] = useState(4000)
  const [fpsPreset, setFpsPreset] = useState<FpsPreset>('original')
  const [customFps, setCustomFps] = useState(30)
  const [audio, setAudio] = useState<'reencode' | 'copy' | 'none'>('reencode')
  const [outputName, setOutputName] = useState(defaultStem)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [extraArgs, setExtraArgs] = useState('')

  // Reset to sensible defaults whenever the dialog (re)opens.
  useEffect(() => {
    if (!open) return
    setFormat('mp4-h264')
    setResPreset('original')
    setCustomResMode('longEdge')
    setLongEdge(1920)
    setWidth(1920)
    setHeight(1080)
    setQualityMode('crf')
    setCrf(defaultCrf(FORMATS['mp4-h264'].vcodec))
    setCrfTouched(false)
    setKbps(4000)
    setFpsPreset('original')
    setCustomFps(30)
    setAudio('reencode')
    setOutputName(defaultStem)
    setAdvancedOpen(false)
    setExtraArgs('')
  }, [open, defaultStem])

  // When format changes and the user hasn't overridden CRF, follow the codec default.
  function changeFormat(next: TranscodeFormat) {
    setFormat(next)
    if (!crfTouched) setCrf(defaultCrf(FORMATS[next].vcodec))
  }

  if (!open) return null

  const bulk = videoCount > 1
  const compatRisky = isCompatRisky(format)

  function buildResolution(): Resolution {
    if (resPreset === 'original') return { kind: 'original' }
    if (resPreset === 'custom') {
      return customResMode === 'longEdge'
        ? { kind: 'longEdge', px: Math.max(1, Math.round(longEdge)) }
        : { kind: 'wh', w: Math.max(1, Math.round(width)), h: Math.max(1, Math.round(height)) }
    }
    return { kind: 'longEdge', px: PRESET_PX[resPreset] }
  }

  function build(): TranscodeOptions {
    return {
      format,
      resolution: buildResolution(),
      quality: qualityMode === 'crf'
        ? { mode: 'crf', crf: Math.round(crf) }
        : { mode: 'bitrate', kbps: Math.max(1, Math.round(kbps)) },
      fps: fpsPreset === 'original'
        ? 'original'
        : fpsPreset === 'custom'
          ? Math.max(1, Math.round(customFps))
          : Number(fpsPreset),
      audio,
      extraArgs: extraArgs.trim(),
      outputName: outputName.trim() || defaultStem,
    }
  }

  return (
    <div className="scrim" onClick={onCancel}>
      <div className="modal-card max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">转码</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onCancel} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>

        {bulk && (
          <p className="mb-4 rounded-lg border border-line bg-paper-2 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
            将对 {videoCount} 个视频应用相同参数(文件名各自派生)
          </p>
        )}

        <div className="max-h-[60vh] space-y-4 overflow-auto pr-1">
          {/* 输出格式 */}
          <Field label="输出格式">
            <select className="field py-1.5" value={format} onChange={(e) => changeFormat(e.target.value as TranscodeFormat)}>
              {FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>

          {/* 分辨率 */}
          <Field label="分辨率">
            <select className="field py-1.5" value={resPreset} onChange={(e) => setResPreset(e.target.value as ResPreset)}>
              <option value="original">原始</option>
              <option value="1080">1080p</option>
              <option value="720">720p</option>
              <option value="480">480p</option>
              <option value="custom">自定义</option>
            </select>
            {resPreset === 'custom' && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className={`btn-ghost px-2.5 py-1 text-xs ${customResMode === 'longEdge' ? 'bg-accent-soft text-accent-ink' : ''}`}
                    onClick={() => setCustomResMode('longEdge')}
                  >长边</button>
                  <button
                    type="button"
                    className={`btn-ghost px-2.5 py-1 text-xs ${customResMode === 'wh' ? 'bg-accent-soft text-accent-ink' : ''}`}
                    onClick={() => setCustomResMode('wh')}
                  >宽×高</button>
                </div>
                {customResMode === 'longEdge' ? (
                  <input className="field tnum py-1.5" type="number" min={1} value={longEdge} onChange={(e) => setLongEdge(Number(e.target.value))} placeholder="长边像素" />
                ) : (
                  <div className="flex items-center gap-2">
                    <input className="field tnum py-1.5" type="number" min={1} value={width} onChange={(e) => setWidth(Number(e.target.value))} placeholder="宽" />
                    <span className="text-muted">×</span>
                    <input className="field tnum py-1.5" type="number" min={1} value={height} onChange={(e) => setHeight(Number(e.target.value))} placeholder="高" />
                  </div>
                )}
              </div>
            )}
          </Field>

          {/* 画质 */}
          <Field label="画质">
            <div className="flex gap-1.5">
              <button
                type="button"
                className={`btn-ghost px-2.5 py-1 text-xs ${qualityMode === 'crf' ? 'bg-accent-soft text-accent-ink' : ''}`}
                onClick={() => setQualityMode('crf')}
              >质量(CRF)</button>
              <button
                type="button"
                className={`btn-ghost px-2.5 py-1 text-xs ${qualityMode === 'bitrate' ? 'bg-accent-soft text-accent-ink' : ''}`}
                onClick={() => setQualityMode('bitrate')}
              >目标码率</button>
            </div>
            <div className="mt-2">
              {qualityMode === 'crf' ? (
                <input
                  className="field tnum py-1.5"
                  type="number" min={0} max={51}
                  value={crf}
                  onChange={(e) => { setCrf(Number(e.target.value)); setCrfTouched(true) }}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <input className="field tnum py-1.5" type="number" min={1} value={kbps} onChange={(e) => setKbps(Number(e.target.value))} />
                  <span className="text-xs text-muted">kbps</span>
                </div>
              )}
            </div>
          </Field>

          {/* 帧率 */}
          <Field label="帧率">
            <select className="field py-1.5" value={fpsPreset} onChange={(e) => setFpsPreset(e.target.value as FpsPreset)}>
              <option value="original">原始</option>
              <option value="60">60</option>
              <option value="30">30</option>
              <option value="24">24</option>
              <option value="custom">自定义</option>
            </select>
            {fpsPreset === 'custom' && (
              <input className="field tnum mt-2 py-1.5" type="number" min={1} value={customFps} onChange={(e) => setCustomFps(Number(e.target.value))} placeholder="fps" />
            )}
          </Field>

          {/* 音频 */}
          <Field label="音频">
            <select className="field py-1.5" value={audio} onChange={(e) => setAudio(e.target.value as typeof audio)}>
              <option value="reencode">重编码</option>
              <option value="copy">保留原音轨</option>
              <option value="none">去掉</option>
            </select>
          </Field>

          {/* 输出文件名 (single only) */}
          {!bulk && (
            <Field label="输出文件名">
              <input className="field py-1.5" value={outputName} onChange={(e) => setOutputName(e.target.value)} placeholder={defaultStem} />
            </Field>
          )}

          {/* 高级 */}
          <div>
            <button
              type="button"
              className="text-[12px] font-medium text-ink-soft hover:text-ink"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen ? '▾' : '▸'} 高级
            </button>
            {advancedOpen && (
              <div className="mt-2">
                <input className="field py-1.5 font-mono text-xs" value={extraArgs} onChange={(e) => setExtraArgs(e.target.value)} placeholder="附加 ffmpeg 参数" />
                <p className="mt-1 text-[11px] leading-relaxed text-muted">高级,后果自负:原样按空格追加到 ffmpeg 命令。</p>
              </div>
            )}
          </div>

          {compatRisky && (
            <p className="rounded-lg border border-warn-soft bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn">
              H.265/webm/mkv 兼容性较差,Windows 预览或拼多多可能不支持;上传建议 mp4·H.264。
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn-primary" onClick={() => onConfirm(build())}>开始转码</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-medium text-ink-soft">{label}</div>
      {children}
    </div>
  )
}
