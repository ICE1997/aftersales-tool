import { useEffect, useRef, useState } from 'react'
import type { Material } from '@shared/types'
import { api } from '../api'
import { IconClose, IconBox } from './icons'

interface Props { open: boolean; aftersaleNo: string; targetFolder: string; onCreated: (m: Material) => void; onCancel: () => void }
type Tab = 'clipboard' | 'file'
interface Pending { fileName: string; bytes: Uint8Array; previewUrl?: string; isImage: boolean }

const IMG_NAME: Record<string, string> = {
  'image/png': 'paste.png',
  'image/jpeg': 'paste.jpg',
  'image/gif': 'paste.gif',
  'image/webp': 'paste.webp'
}

export function NewMaterialDialog({ open, aftersaleNo, targetFolder, onCreated, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>('clipboard')
  const [pending, setPending] = useState<Pending | null>(null)
  const [picked, setPicked] = useState<{ path: string; name: string } | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameEdited = useRef(false)
  const pendingUrl = useRef<string | null>(null)
  const aliveRef = useRef(true)
  const tokenRef = useRef<object | null>(null)

  function clearPending() {
    tokenRef.current = null
    if (pendingUrl.current) { URL.revokeObjectURL(pendingUrl.current); pendingUrl.current = null }
    setPending(null)
  }

  useEffect(() => {
    if (!open) return
    aliveRef.current = true
    setTab('clipboard'); setPicked(null); setError(null); setName(''); nameEdited.current = false; clearPending()
    return () => { aliveRef.current = false; clearPending() }
  }, [open])

  useEffect(() => {
    if (!open || tab !== 'clipboard') return
    const handler = async (e: ClipboardEvent) => {
      const dt = e.clipboardData
      if (!dt) return
      let file: File | null = null
      let isImage = false
      for (const it of Array.from(dt.items)) {
        if (it.kind === 'file' && it.type.startsWith('image/')) { file = it.getAsFile(); isImage = true; break }
      }
      if (!file && dt.files.length > 0) { file = dt.files[0]; isImage = file.type.startsWith('image/') }
      if (!file) { setError('未检测到可粘贴的图片或文件'); return }
      e.preventDefault()
      setError(null)
      const token = {}
      tokenRef.current = token
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!aliveRef.current || tokenRef.current !== token) return // dialog closed or superseded by a newer paste
      const fileName = isImage ? (IMG_NAME[file.type] ?? (file.name || 'paste.png')) : (file.name || 'file')
      if (pendingUrl.current) { URL.revokeObjectURL(pendingUrl.current); pendingUrl.current = null }
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined
      pendingUrl.current = previewUrl ?? null
      setPending({ fileName, bytes, previewUrl, isImage })
      if (!nameEdited.current) setName(isImage ? '粘贴图片' : fileName.replace(/\.[^.]+$/, ''))
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [open, tab])

  if (!open) return null

  const valid = tab === 'clipboard' ? !!pending : !!picked

  function choose(next: Tab) {
    setError(null); setTab(next); nameEdited.current = false
    if (next === 'clipboard') setPicked(null)
    else clearPending()
  }

  async function pick() {
    setError(null)
    const f = await api.pickFile()
    if (f) { setPicked(f); nameEdited.current = false; setName(f.name) }
  }

  function editName(v: string) { nameEdited.current = true; setName(v) }

  async function create() {
    if (!valid || busy) return
    setBusy(true); setError(null)
    try {
      const payload = tab === 'clipboard'
        ? { source: 'paste' as const, fileName: pending!.fileName, name, bytes: pending!.bytes, folder: targetFolder }
        : { source: 'file' as const, path: picked!.path, name, folder: targetFolder }
      const m = await api.createMaterial(aftersaleNo, payload)
      onCreated(m)
    } catch (e) {
      setError((e as Error).message || '创建失败')
    } finally {
      setBusy(false)
    }
  }

  const pickedBase = picked ? picked.path.split(/[\\/]/).pop() : ''

  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">新建材料</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onCancel} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>
        <div className="mb-3 text-xs text-muted">将添加到:<span className="text-ink-soft">{targetFolder === '' ? '根目录' : targetFolder}</span></div>

        <div className="mb-4 inline-flex rounded-lg border border-line bg-paper-2 p-0.5 text-sm">
          <button className={`rounded-md px-3 py-1.5 ${tab === 'clipboard' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`} onClick={() => choose('clipboard')}>从剪贴板</button>
          <button className={`rounded-md px-3 py-1.5 ${tab === 'file' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`} onClick={() => choose('file')}>选择文件</button>
        </div>

        <div className="mb-4 flex min-h-[112px] items-center justify-center rounded-lg border border-dashed border-line-strong bg-paper-2 p-3 text-center text-sm text-muted">
          {tab === 'clipboard' ? (
            pending?.isImage ? <img src={pending.previewUrl} alt="" className="max-h-28 rounded" />
            : pending ? <span className="flex items-center gap-2 font-mono text-xs text-ink-soft"><IconBox className="text-[16px]" /><span>{pending.fileName}</span></span>
            : <span className="text-muted">按 Cmd/Ctrl+V 粘贴图片或文件</span>
          ) : (
            picked ? <span className="flex items-center gap-2 font-mono text-xs text-ink-soft"><IconBox className="text-[16px]" /><span>{pickedBase}</span></span>
            : <button className="btn-ghost" onClick={pick}>选择文件…</button>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-soft">名称</span>
          <input className="field" value={name} onChange={(e) => editName(e.target.value)} placeholder="材料名称" />
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
