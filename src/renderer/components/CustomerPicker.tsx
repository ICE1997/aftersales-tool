import { useEffect, useRef, useState } from 'react'
import type { CustomerRow } from '@shared/types'
import { api } from '../api'
import { regionLabel } from '../region'
import { IconClose, IconSearch } from './icons'

interface Props { open: boolean; onPick: (id: number) => void; onCancel: () => void }

export function CustomerPicker({ open, onPick, onCancel }: Props) {
  const [rows, setRows] = useState<CustomerRow[]>([])
  const tokenRef = useRef(0)

  useEffect(() => { if (open) { setRows([]); runSearch('') } }, [open])
  if (!open) return null

  async function runSearch(q: string) {
    const tok = ++tokenRef.current
    const r = q ? await api.searchCustomers(q) : await api.listCustomers()
    if (tokenRef.current === tok) setRows(r)
  }

  return (
    <div className="scrim" onClick={onCancel}>
      <div className="modal-card max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">关联客户</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onCancel} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>
        <div className="relative mb-3">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-muted" />
          <input className="field pl-9" placeholder="搜索昵称 / 姓名 / 地区" onChange={(e) => runSearch(e.target.value)} autoFocus />
        </div>
        <div className="max-h-72 overflow-auto rounded-lg border border-line">
          {rows.length === 0 ? <div className="p-4 text-center text-sm text-muted">无客户,请先在「客户」中新建</div> : rows.map((c) => (
            <button key={c.id} className="block w-full border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-paper-2" onClick={() => onPick(c.id)}>
              <div className="text-sm text-ink">{c.name || c.nickname || '未命名'}</div>
              <div className="text-xs text-muted">{regionLabel(c) || '—'}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
