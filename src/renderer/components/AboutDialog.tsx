import { useEffect, useState } from 'react'
import { api } from '../api'
import { IconClose } from './icons'
import { Logo } from './Logo'

export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [version, setVersion] = useState('')
  useEffect(() => { if (open) api.appVersion().then(setVersion) }, [open])
  if (!open) return null
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal-card max-w-xs text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onClose} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>
        <div className="-mt-2 flex flex-col items-center gap-3 pb-2">
          <Logo size={56} className="drop-shadow-sm" />
          <div>
            <div className="font-display text-xl font-extrabold tracking-tight">售后酱</div>
            <div className="mt-0.5 text-xs text-muted">售后材料管理</div>
          </div>
          <dl className="w-full space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">版本</dt><dd className="tnum text-ink">{version || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">作者</dt><dd className="text-ink">Kiza</dd></div>
          </dl>
          <p className="text-[11px] text-muted">© 2026 售后酱</p>
        </div>
      </div>
    </div>
  )
}
