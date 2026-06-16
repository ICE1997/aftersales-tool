import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Customer, Material, Ticket, TicketStatus } from '@shared/types'
import { api } from '../api'
import { STATUS_META, STATUS_ORDER } from '../status'
import { MaterialGrid } from './MaterialGrid'
import { PreviewModal } from './PreviewModal'
import { NewMaterialDialog } from './NewMaterialDialog'
import { CustomerPicker } from './CustomerPicker'
import { IconImport, IconFolder, IconArchive, IconRefresh, IconTrash, IconClose, IconExternal } from './icons'

export function TicketDetail({ aftersaleNo, onChanged, onDeleted, onBack }: { aftersaleNo: string; onChanged: () => void; onDeleted: () => void; onBack: () => void }) {
  const [ticket, setTicket] = useState<Ticket | undefined>()
  const [materials, setMaterials] = useState<Material[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<Material | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [customer, setCustomer] = useState<Customer | undefined>()
  const [pickerOpen, setPickerOpen] = useState(false)
  const currentNo = useRef(aftersaleNo)

  async function reload() {
    currentNo.current = aftersaleNo
    const [t, ms] = await Promise.all([api.getTicket(aftersaleNo), api.listMaterials(aftersaleNo)])
    if (currentNo.current !== aftersaleNo) return
    const c = t && t.customerId != null ? await api.getCustomer(t.customerId) : undefined
    if (currentNo.current !== aftersaleNo) return
    setTicket(t)
    setMaterials(ms)
    setSelected(new Set())
    setCustomer(c)
  }
  useEffect(() => { setMsg(null); setConfirmDelete(false); setCustomer(undefined); reload() }, [aftersaleNo])

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
  async function linkCustomer(id: number) { await api.setTicketCustomer(aftersaleNo, id); setPickerOpen(false); await reload() }
  async function unlinkCustomer() { await api.setTicketCustomer(aftersaleNo, null); await reload() }
  function openPdd() {
    if (!ticket) return
    const params = new URLSearchParams({ id: ticket.aftersaleNo })
    if (ticket.orderNo) params.set('orderSn', ticket.orderNo)
    api.openExternal(`https://mms.pinduoduo.com/aftersales-ssr/detail?${params}`)
  }

  const customerName = customer ? (customer.name || customer.nickname || '未命名') : ''

  return (
    <div className="flex h-full flex-col">
      {/* slim header: identity + status + delete */}
      <div className="flex items-center gap-3 border-b border-line bg-paper-2 px-6 py-4">
        <button className="btn-ghost px-2.5" onClick={onBack} aria-label="返回">← 返回</button>
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">售后单号</div>
          <h2 className="tnum mt-0.5 truncate font-display text-xl font-extrabold leading-tight tracking-tight text-ink">{ticket.aftersaleNo}</h2>
        </div>
        <label className={`chip ${meta.chip} relative ml-1 cursor-pointer pr-6`}>
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
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost px-2.5" onClick={openPdd} title="在拼多多商家后台打开此售后单">
            <IconExternal className="text-[15px]" /> 拼多多
          </button>
          <button className="btn-danger px-2.5" onClick={() => setConfirmDelete(true)}>
            <IconTrash className="text-[15px]" /> 删除
          </button>
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

      {msg && (
        <div className="flex animate-slidedown items-center justify-between gap-3 border-b border-warn-soft bg-warn-soft px-6 py-2 text-sm text-warn">
          <span>{msg}</span>
          <button className="rounded p-1 hover:bg-white/50" onClick={() => setMsg(null)} aria-label="关闭"><IconClose className="text-[13px]" /></button>
        </div>
      )}

      {/* body: 基本信息 rail + materials */}
      <div className="flex min-h-0 flex-1">
        <aside className="w-[300px] shrink-0 overflow-auto border-r border-line bg-paper-2 px-5 py-5">
          <h3 className="font-display text-sm font-bold tracking-tight text-ink">基本信息</h3>
          <dl className="mt-4 space-y-4">
            <InfoRow label="客户">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span className={customer ? 'text-ink' : 'text-muted'}>{customer ? customerName : '未关联'}</span>
                <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setPickerOpen(true)}>{customer ? '更换' : '关联'}</button>
                {customer && <button className="btn-ghost px-2 py-0.5 text-xs" onClick={unlinkCustomer}>取消关联</button>}
              </div>
            </InfoRow>
            <div className="h-px bg-line" />
            <InfoRow label="订单号"><Value v={ticket.orderNo} /></InfoRow>
            <InfoRow label="发货单号"><Value v={ticket.shippingNo} /></InfoRow>
            <InfoRow label="退货单号"><Value v={ticket.returnNo} /></InfoRow>
          </dl>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* materials toolbar */}
          <div className="flex items-center gap-2 border-b border-line px-6 py-3">
            <button className="btn-primary" onClick={() => setNewOpen(true)}><IconImport className="text-[16px]" /> 新建材料</button>
            {selected.size > 0 ? (
              <div className="flex animate-slidedown items-center gap-1 rounded-lg bg-accent-soft px-2 py-1">
                <span className="tnum px-1 text-xs font-semibold text-accent-ink">已选 {selected.size}</span>
                <button className="btn-ghost border-transparent bg-transparent py-1 shadow-none hover:bg-white" onClick={exportFolder}><IconFolder className="text-[15px]" /> 导出到文件夹</button>
                <button className="btn-ghost border-transparent bg-transparent py-1 shadow-none hover:bg-white" onClick={exportZip}><IconArchive className="text-[15px]" /> 打包 zip</button>
                <button className="px-1.5 text-xs text-muted hover:text-accent-ink" onClick={() => setSelected(new Set())}>取消选择</button>
              </div>
            ) : materials.length > 0 ? (
              <span className="text-xs text-muted">勾选材料可导出或打包</span>
            ) : null}
            <button className="btn-ghost ml-auto px-2" onClick={calibrate} title="校准索引(清理已失效的材料索引)" aria-label="校准索引">
              <IconRefresh className="text-[15px]" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <MaterialGrid materials={materials} selectedIds={selected} onToggle={toggle} onOpen={setPreview} />
          </div>
        </div>
      </div>

      <PreviewModal material={preview} onClose={() => setPreview(null)} />
      <NewMaterialDialog
        open={newOpen}
        aftersaleNo={aftersaleNo}
        onCancel={() => setNewOpen(false)}
        onCreated={async (m) => { setNewOpen(false); await reload(); setMsg(`已新建材料:${m.name || m.relPath.split('/').pop()}`) }}
      />
      <CustomerPicker open={pickerOpen} onPick={linkCustomer} onCancel={() => setPickerOpen(false)} />
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  )
}

function Value({ v }: { v: string }) {
  return v ? <span className="tnum break-all font-medium text-ink">{v}</span> : <span className="text-muted">—</span>
}
