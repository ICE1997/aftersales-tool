import { useEffect, useRef, useState } from 'react'
import { IconFolder, IconFolderOpen } from './icons'

/**
 * "移动到" control for the selected-materials toolbar. A ghost button matching its
 * siblings that opens the app's standard themed popover (root + each folder),
 * instead of a native <select> that clashes with the warm-paper buttons.
 * `onMove('')` = move to root.
 */
export function MoveToMenu({ folders, onMove }: { folders: string[]; onMove: (folder: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const pick = (folder: string) => { setOpen(false); onMove(folder) }

  return (
    <div ref={ref} className="relative">
      <button className="btn-ghost flex items-center gap-1.5 border-transparent bg-transparent py-1 shadow-none hover:bg-white" onClick={() => setOpen((o) => !o)}>
        <IconFolderOpen className="text-[15px]" /> 移动到
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 min-w-[180px] overflow-auto rounded-xl2 border border-line bg-surface p-1.5 shadow-card">
          <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-paper-2" onClick={() => pick('')}>
            <IconFolder className="shrink-0 text-[14px] text-muted" /> 根目录
          </button>
          {folders.map((f) => (
            <button key={f} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-paper-2" onClick={() => pick(f)}>
              <IconFolder className="shrink-0 text-[14px] text-accent" /> <span className="truncate">{f}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
