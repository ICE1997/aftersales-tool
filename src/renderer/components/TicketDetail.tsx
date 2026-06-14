import { useEffect, useRef, useState } from 'react'
import type { Material, Ticket, TicketStatus } from '@shared/types'
import { api } from '../api'
import { STATUS_META, STATUS_ORDER } from '../status'
import { MaterialGrid } from './MaterialGrid'
import { PreviewModal } from './PreviewModal'
import { NewMaterialDialog } from './NewMaterialDialog'
import { IconImport, IconFolder, IconArchive, IconRefresh, IconTrash, IconClose } from './icons'

export function TicketDetail({ aftersaleNo, onChanged, onDeleted }: { aftersaleNo: string; onChanged: () => void; onDeleted: () => void }) {
  const [ticket, setTicket] = useState<Ticket | undefined>()
  const [materials, setMaterials] = useState<Material[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<Material | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const currentNo = useRef(aftersaleNo)

  async function reload() {
    currentNo.current = aftersaleNo
    const [t, ms] = await Promise.all([api.getTicket(aftersaleNo), api.listMaterials(aftersaleNo)])
    if (currentNo.current !== aftersaleNo) return
    setTicket(t)
    setMaterials(ms)
    setSelected(new Set())
  }
  useEffect(() => { setMsg(null); setConfirmDelete(false); reload() }, [aftersaleNo])

  if (!ticket) return null
  const ids = () => [...selected]
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const meta = STATUS_META[ticket.status]

  async function exportFolder() {
    try { const ok = await api.exportFolder(ids()); setMsg(ok ? '已导出到文件夹' : null) }
    catch (e) { setMsg(`导出失败:${(e as Error).message}`) }
  }
  async function exportZip() {
    try { const ok = await api.exportZip(ids()); setMsg(ok ? '已打包 zip' : null) }
    catch (e) { setMsg(`打包失败:${(e as Error).message}`) }
  }
  async function calibrate() {
    const n = await api.calibrate(aftersaleNo)
    setMsg(`校准完成,清理 ${n} 条失效索引`)
    await reload()
  }
  async function remove() {
    await api.deleteTicket(aftersaleNo)
    onDeleted()
  }

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="border-b border-line bg-paper-2 px-6 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">售后单号</div>
            <h2 className="tnum mt-0.5 truncate font-display text-2xl font-extrabold tracking-tight text-ink">{ticket.aftersaleNo}</h2>
          </div>

          {/* status pill with invisible native select overlay */}
          <label className={`chip ${meta.chip} relative ml-1 mt-1 cursor-pointer pr-6`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
            <svg className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            <select
              className="absolute inset-0 cursor-pointer opacity-0"
              value={ticket.status}
              onChange={async (e) => { await api.updateTicket(aftersaleNo, { status: e.target.value as TicketStatus }); await reload(); onChanged() }}
            >
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </label>

          <button className="btn-danger ml-auto mt-0.5 px-2.5" onClick={() => setConfirmDelete(true)}>
            <IconTrash className="text-[15px]" /> 删除
          </button>
        </div>

        {/* number chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          <NumChip label="订单" value={ticket.orderNo} />
          <NumChip label="发货" value={ticket.shippingNo} />
          <NumChip label="退货" value={ticket.returnNo} />
        </div>
      </div>

      {confirmDelete && (
        <div className="flex animate-slidedown items-center justify-between gap-3 border-b border-danger-soft bg-danger-soft px-6 py-2.5 text-sm text-danger">
          <span>确认删除该售后单及其所有材料?此操作不可撤销。</span>
          <span className="flex shrink-0 gap-2">
            <button className="btn-danger-solid px-3 py-1.5 text-xs" onClick={remove}>确认删除</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>取消</button>
          </span>
        </div>
      )}

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-3">
        <button className="btn-primary" onClick={() => setNewOpen(true)}><IconImport className="text-[16px]" /> 新建材料</button>
        <span className="mx-1 h-5 w-px bg-line" />
        <button className="btn-ghost" disabled={!selected.size} onClick={exportFolder}><IconFolder className="text-[16px]" /> 导出到文件夹</button>
        <button className="btn-ghost" disabled={!selected.size} onClick={exportZip}><IconArchive className="text-[16px]" /> 打包 zip</button>
        {selected.size > 0 && <span className="tnum text-xs text-muted">已选 {selected.size}</span>}
        <button className="btn-ghost ml-auto" onClick={calibrate}><IconRefresh className="text-[15px]" /> 校准索引</button>
      </div>

      {msg && (
        <div className="flex animate-slidedown items-center justify-between gap-3 border-b border-warn-soft bg-warn-soft px-6 py-2 text-sm text-warn">
          <span>{msg}</span>
          <button className="rounded p-1 hover:bg-white/50" onClick={() => setMsg(null)} aria-label="关闭"><IconClose className="text-[13px]" /></button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <MaterialGrid materials={materials} selectedIds={selected} onToggle={toggle} onOpen={setPreview} />
      </div>
      <PreviewModal material={preview} onClose={() => setPreview(null)} />
      <NewMaterialDialog
        open={newOpen}
        aftersaleNo={aftersaleNo}
        onCancel={() => setNewOpen(false)}
        onCreated={async (m) => { setNewOpen(false); await reload(); setMsg(`已新建材料:${m.name || m.relPath.split('/').pop()}`) }}
      />
    </div>
  )
}

function NumChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="numchip">
      <span className="text-[11px] text-muted">{label}</span>
      <span className="tnum text-xs font-medium text-ink-soft">{value || '—'}</span>
    </span>
  )
}
