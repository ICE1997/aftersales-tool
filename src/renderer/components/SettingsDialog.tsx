import { useEffect, useState } from 'react'
import { api } from '../api'
import { IconClose, IconFolder } from './icons'

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [root, setRoot] = useState('')
  useEffect(() => { if (open) api.getDataRoot().then(setRoot) }, [open])
  if (!open) return null
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal-card max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">设置</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onClose} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>

        <div className="mb-1 text-[12px] font-medium text-ink-soft">数据目录</div>
        <div className="mb-1 flex items-start gap-2 rounded-lg border border-line bg-paper-2 p-3">
          <IconFolder className="mt-0.5 shrink-0 text-[16px] text-muted" />
          <span className="break-all font-mono text-xs leading-relaxed text-ink-soft">{root}</span>
        </div>
        <p className="mb-5 text-[11px] leading-relaxed text-muted">所有售后单与材料都存放在此目录,可整体拷贝迁移。更改目录会把现有数据复制到新位置(或指向已存在的库)。</p>

        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>关闭</button>
          <button className="btn-primary" onClick={async () => { if (await api.chooseDataRoot()) onClose() }}>
            <IconFolder className="text-[15px]" /> 更改目录
          </button>
        </div>
      </div>
    </div>
  )
}
