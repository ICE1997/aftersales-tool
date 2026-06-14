import { useEffect, useRef, useState } from 'react'
import type { Material, Ticket, TicketStatus } from '@shared/types'
import { api } from '../api'
import { MaterialGrid } from './MaterialGrid'
import { PreviewModal } from './PreviewModal'

const STATUSES: TicketStatus[] = ['pending', 'processing', 'resolved']

export function TicketDetail({ aftersaleNo, onChanged, onDeleted }: { aftersaleNo: string; onChanged: () => void; onDeleted: () => void }) {
  const [ticket, setTicket] = useState<Ticket | undefined>()
  const [materials, setMaterials] = useState<Material[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<Material | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
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

  async function doImport() {
    const res = await api.importPick(aftersaleNo)
    await reload()
    const skipped = res.skipped.length
    setMsg(`导入 ${res.imported.length} 个${skipped ? `,跳过 ${skipped} 个(${res.skipped.map(s => s.reason).join('、')})` : ''}`)
  }
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
      <div className="border-b p-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{ticket.aftersaleNo}</h2>
          <select className="rounded border px-2 py-1" value={ticket.status}
            onChange={async (e) => { await api.updateTicket(aftersaleNo, { status: e.target.value as TicketStatus }); await reload(); onChanged() }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="ml-auto rounded border border-red-300 px-3 py-1 text-red-600" onClick={() => setConfirmDelete(true)}>删除售后单</button>
        </div>
        <div className="mt-2 text-sm text-gray-600">订单 {ticket.orderNo || '—'} · 发货 {ticket.shippingNo || '—'} · 退货 {ticket.returnNo || '—'}</div>
      </div>

      {confirmDelete && (
        <div className="flex items-center justify-between bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>确认删除该售后单及其所有材料?此操作不可撤销。</span>
          <span className="flex gap-2">
            <button className="rounded bg-red-600 px-3 py-1 text-white" onClick={remove}>确认删除</button>
            <button className="rounded border px-3 py-1" onClick={() => setConfirmDelete(false)}>取消</button>
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 border-b p-2">
        <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={doImport}>导入材料</button>
        <button className="rounded border px-3 py-1" disabled={!selected.size} onClick={exportFolder}>导出到文件夹</button>
        <button className="rounded border px-3 py-1" disabled={!selected.size} onClick={exportZip}>打包 zip</button>
        <button className="ml-auto rounded border px-3 py-1" onClick={calibrate}>校准索引</button>
      </div>

      {msg && (
        <div className="flex items-center justify-between bg-amber-50 px-3 py-1 text-sm text-amber-800">
          <span>{msg}</span>
          <button className="text-amber-600" onClick={() => setMsg(null)}>×</button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <MaterialGrid materials={materials} selectedIds={selected} onToggle={toggle} onOpen={setPreview} />
      </div>
      <PreviewModal material={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
