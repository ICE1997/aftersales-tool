import { useEffect, useState } from 'react'
import type { Material, Ticket, TicketStatus } from '@shared/types'
import { api } from '../api'
import { MaterialGrid } from './MaterialGrid'
import { PreviewModal } from './PreviewModal'

const STATUSES: TicketStatus[] = ['pending', 'processing', 'resolved']

export function TicketDetail({ aftersaleNo, onChanged }: { aftersaleNo: string; onChanged: () => void }) {
  const [ticket, setTicket] = useState<Ticket | undefined>()
  const [materials, setMaterials] = useState<Material[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<Material | null>(null)

  async function reload() {
    setTicket(await api.getTicket(aftersaleNo))
    setMaterials(await api.listMaterials(aftersaleNo))
    setSelected(new Set())
  }
  useEffect(() => { reload() }, [aftersaleNo])

  if (!ticket) return null
  const ids = () => [...selected]
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{ticket.aftersaleNo}</h2>
          <select className="rounded border px-2 py-1" value={ticket.status}
            onChange={async (e) => { await api.updateTicket(aftersaleNo, { status: e.target.value as TicketStatus }); await reload(); onChanged() }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="mt-2 text-sm text-gray-600">订单 {ticket.orderNo || '—'} · 发货 {ticket.shippingNo || '—'} · 退货 {ticket.returnNo || '—'}</div>
      </div>

      <div className="flex gap-2 border-b p-2">
        <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={async () => { await api.importPick(aftersaleNo); await reload() }}>导入材料</button>
        <button className="rounded border px-3 py-1" disabled={!selected.size} onClick={() => api.exportFolder(ids())}>导出到文件夹</button>
        <button className="rounded border px-3 py-1" disabled={!selected.size} onClick={() => api.exportZip(ids())}>打包 zip</button>
        <button className="ml-auto rounded border px-3 py-1" onClick={async () => { const n = await api.calibrate(aftersaleNo); alert(`校准完成,清理 ${n} 条失效索引`); await reload() }}>校准索引</button>
      </div>

      <div className="flex-1 overflow-auto">
        <MaterialGrid materials={materials} selectedIds={selected} onToggle={toggle} onOpen={setPreview} />
      </div>
      <PreviewModal material={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
