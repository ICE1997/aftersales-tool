import { useEffect, useState } from 'react'
import type { Material } from '@shared/types'
import { api } from '../api'
import { IconPlay, IconCheck, IconImage } from './icons'

interface Props { materials: Material[]; selectedIds: Set<number>; onToggle: (id: number) => void; onOpen: (m: Material) => void }

function Thumb({ m }: { m: Material }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (m.thumbPath) api.fileUrl(m.thumbPath).then(setUrl)
    else if (m.kind === 'image') api.fileUrl(m.relPath).then(setUrl)
  }, [m.thumbPath, m.relPath, m.kind])
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-paper-2 text-muted">
        {m.kind === 'video'
          ? <IconPlay className="text-2xl opacity-40" />
          : <IconImage className="text-2xl opacity-30" />}
      </div>
    )
  }
  return <img src={url} alt="" className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.05]" />
}

export function MaterialGrid({ materials, selectedIds, onToggle, onOpen }: Props) {
  if (materials.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-paper-2 text-muted">
          <IconImage className="text-2xl" />
        </div>
        <p className="text-sm text-muted">还没有材料 — 点击「导入材料」添加视频或图片</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4 p-6">
      {materials.map((m, i) => {
        const sel = selectedIds.has(m.id)
        return (
          <div
            key={m.id}
            className={`group relative animate-rise overflow-hidden rounded-xl2 border bg-surface transition-all duration-150 ${
              sel
                ? 'border-accent shadow-card ring-2 ring-accent ring-offset-2 ring-offset-paper'
                : 'border-line hover:-translate-y-0.5 hover:shadow-lift'
            }`}
            style={{ animationDelay: `${Math.min(i, 16) * 18}ms` }}
          >
            <button className="relative block aspect-square w-full overflow-hidden bg-paper-2" onClick={() => onOpen(m)}>
              <Thumb m={m} />
              {m.kind === 'video' && (
                <span
                  className="pointer-events-none absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg"
                  style={{ background: 'rgba(33,30,24,.55)', backdropFilter: 'blur(2px)' }}
                >
                  <IconPlay className="text-[15px]" />
                </span>
              )}
            </button>

            <button
              onClick={() => onToggle(m.id)}
              aria-label={sel ? '取消选择' : '选择'}
              className={`absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border backdrop-blur transition ${
                sel
                  ? 'border-accent bg-accent text-white'
                  : 'border-white/70 bg-white/65 text-transparent opacity-0 hover:text-muted group-hover:opacity-100'
              }`}
            >
              <IconCheck className="text-[13px]" />
            </button>

            <div className="truncate px-2.5 py-2 font-mono text-[11px] text-ink-soft">{m.relPath.split('/').pop()}</div>
          </div>
        )
      })}
    </div>
  )
}
