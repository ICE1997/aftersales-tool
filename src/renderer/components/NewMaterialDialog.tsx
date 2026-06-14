import { useEffect, useState } from 'react'
import type { ClipboardPeek, Material } from '@shared/types'
import { api } from '../api'
import { IconClose } from './icons'

interface Props { open: boolean; aftersaleNo: string; onCreated: (m: Material) => void; onCancel: () => void }

type Tab = 'clipboard' | 'file'

export function NewMaterialDialog({ open, aftersaleNo, onCreated, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>('clipboard')
  const [peek, setPeek] = useState<ClipboardPeek | null>(null)
  const [picked, setPicked] = useState<{ path: string; name: string } | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function refreshClipboard() {
    const p = await api.peekClipboard()
    setPeek(p)
    setName(p.name ?? '')
  }

  useEffect(() => {
    if (!open) return
    setTab('clipboard'); setPicked(null); setError(null); setPeek(null); setName('')
    refreshClipboard()
  }, [open])

  if (!open) return null

  const valid = tab === 'clipboard' ? !!peek && peek.type !== 'empty' : !!picked

  async function choose(next: Tab) {
    setError(null)
    setTab(next)
    if (next === 'clipboard') { setPicked(null); await refreshClipboard() }
  }

  async function pick() {
    setError(null)
    const f = await api.pickFile()
    if (f) { setPicked(f); setName(f.name) }
  }

  async function create() {
    if (!valid || busy) return
    setBusy(true); setError(null)
    try {
      const payload = tab === 'clipboard'
        ? { source: 'clipboard' as const, name }
        : { source: 'file' as const, path: picked!.path, name }
      const m = await api.createMaterial(aftersaleNo, payload)
      onCreated(m)
    } catch (e) {
      setError((e as Error).message || '创建失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">新建材料</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onCancel} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>

        <div className="mb-4 inline-flex rounded-lg border border-line bg-paper-2 p-0.5 text-sm">
          <button className={`rounded-md px-3 py-1.5 ${tab === 'clipboard' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`} onClick={() => choose('clipboard')}>从剪贴板</button>
          <button className={`rounded-md px-3 py-1.5 ${tab === 'file' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`} onClick={() => choose('file')}>选择文件</button>
        </div>

        <div className="mb-4 flex min-h-[88px] items-center justify-center rounded-lg border border-line bg-paper-2 p-3 text-center text-sm text-muted">
          {tab === 'clipboard' ? (
            peek?.type === 'image' ? <img src={peek.thumbDataUrl} alt="" className="max-h-24 rounded" />
            : peek?.type === 'file' ? <span className="font-mono text-xs text-ink-soft">{peek.path}</span>
            : <div className="flex flex-col items-center gap-2"><span>剪贴板没有可用的图片或文件</span><button className="btn-ghost px-2.5 py-1 text-xs" onClick={refreshClipboard}>刷新</button></div>
          ) : (
            picked ? <span className="font-mono text-xs text-ink-soft">{picked.path}</span>
            : <button className="btn-ghost" onClick={pick}>选择文件…</button>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-soft">名称</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="材料名称" />
        </label>

        {error && <div className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!valid || busy} onClick={create}>创建</button>
        </div>
      </div>
    </div>
  )
}
