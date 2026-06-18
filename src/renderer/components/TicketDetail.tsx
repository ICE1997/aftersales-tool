import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Material, Ticket, TicketStatus, CustomerFields, AftersaleFields } from '@shared/types'
import { api } from '../api'
import { STATUS_META, STATUS_ORDER } from '../status'
import { MaterialGrid } from './MaterialGrid'
import { PreviewModal } from './PreviewModal'
import { NewMaterialDialog } from './NewMaterialDialog'
import { RegionCascader, type RegionValue } from './RegionCascader'
import { extractContact } from '../contact-extract'
import { regionLabel } from '../region'
import { IconImport, IconFolder, IconArchive, IconRefresh, IconTrash, IconClose, IconExternal } from './icons'
import { TYPE_OPTIONS, REASON_OPTIONS, SHIPPING_OPTIONS, withCurrent } from '../aftersale-options'
import { parseAmountToCents, localInputToMs, formatCents, formatMs, msToLocalInput } from '@shared/aftersale-format'

export function TicketDetail({ aftersaleNo, onChanged, onDeleted, onBack }: { aftersaleNo: string; onChanged: () => void; onDeleted: () => void; onBack: () => void }) {
  const [ticket, setTicket] = useState<Ticket | undefined>()
  const [materials, setMaterials] = useState<Material[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [currentFolder, setCurrentFolder] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [preview, setPreview] = useState<Material | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [form, setForm] = useState<
    Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo'> & CustomerFields &
    Omit<AftersaleFields, 'amount' | 'refundAmount' | 'appliedAt'> &
    { amount: string; refundAmount: string; appliedAt: string }
  >({
    orderNo: '', shippingNo: '', returnNo: '',
    recipientName: '', phone: '', provinceCode: '', province: '',
    cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: '',
    aftersaleType: '', aftersaleReason: '', shippingStatus: '',
    amount: '', refundAmount: '', appliedAt: '', returnLogistics: ''
  })
  const currentNo = useRef(aftersaleNo)

  async function reload() {
    currentNo.current = aftersaleNo
    const [t, ms, fs] = await Promise.all([api.getTicket(aftersaleNo), api.listMaterials(aftersaleNo), api.listFolders(aftersaleNo)])
    if (currentNo.current !== aftersaleNo) return
    setTicket(t)
    setMaterials(ms)
    setFolders(fs)
    setSelected(new Set())
  }
  useEffect(() => { setMsg(null); setConfirmDelete(false); setEditing(false); setCurrentFolder(''); reload() }, [aftersaleNo])

  if (!ticket) return null
  const ids = () => [...selected]
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const meta = STATUS_META[ticket.status] ?? STATUS_META['待商家处理']

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
  async function createFolder(name: string) {
    const path = currentFolder ? `${currentFolder}/${name.trim()}` : name.trim()
    try { await api.createFolder(aftersaleNo, path); await reload() } catch (e) { setMsg(`新建文件夹失败:${(e as Error).message}`) }
  }
  async function renameFolder(path: string, newName: string) {
    try { await api.renameFolder(aftersaleNo, path, newName); await reload() } catch (e) { setMsg(`重命名失败:${(e as Error).message}`) }
  }
  async function deleteFolder(path: string) {
    await api.removeFolder(aftersaleNo, path)
    if (currentFolder === path || currentFolder.startsWith(path + '/')) setCurrentFolder('')
    await reload()
  }
  async function moveSelected(folder: string) {
    for (const id of selected) await api.moveMaterial(id, folder)
    await reload()
  }
  async function remove() {
    await api.deleteTicket(aftersaleNo)
    onDeleted()
  }
  function openAftersale() {
    if (!ticket) return
    const params = new URLSearchParams({ id: ticket.aftersaleNo })
    if (ticket.orderNo) params.set('orderSn', ticket.orderNo)
    api.openInChrome(`https://mms.pinduoduo.com/aftersales-ssr/detail?${params}`)
  }
  function openOrder() {
    if (!ticket || !ticket.orderNo) return
    api.openInChrome(`https://mms.pinduoduo.com/orders/detail?sn=${encodeURIComponent(ticket.orderNo)}`)
  }
  function openChat() {
    if (!ticket || !ticket.orderNo) return
    api.openInChrome(`https://mms.pinduoduo.com/mms-chat/search?ordersn=${encodeURIComponent(ticket.orderNo)}`)
  }
  function openAppeal() {
    api.openInChrome('https://mms.pinduoduo.com/orders/appeals/aftersale')
  }
  function openCompensation() {
    api.openInChrome('https://mms.pinduoduo.com/aftersales/customer_complain_appeal')
  }
  function startEdit() {
    if (!ticket) return
    setForm({
      orderNo: ticket.orderNo, shippingNo: ticket.shippingNo, returnNo: ticket.returnNo,
      recipientName: ticket.recipientName, phone: ticket.phone,
      provinceCode: ticket.provinceCode, province: ticket.province, cityCode: ticket.cityCode, city: ticket.city,
      districtCode: ticket.districtCode, district: ticket.district, addressDetail: ticket.addressDetail, extension: ticket.extension,
      aftersaleType: ticket.aftersaleType, aftersaleReason: ticket.aftersaleReason, shippingStatus: ticket.shippingStatus,
      amount: formatCents(ticket.amount), refundAmount: formatCents(ticket.refundAmount), appliedAt: msToLocalInput(ticket.appliedAt), returnLogistics: ticket.returnLogistics
    })
    setPasteText('')
    setEditing(true)
  }
  function recognize() {
    const r = extractContact(pasteText)
    setForm((f) => ({
      ...f,
      recipientName: r.name || f.recipientName,
      phone: r.phone || f.phone,
      extension: r.extension || f.extension,
      addressDetail: r.addressDetail || f.addressDetail,
      ...(r.provinceCode
        ? { provinceCode: r.provinceCode, province: r.province, cityCode: r.cityCode, city: r.city, districtCode: r.districtCode, district: r.district }
        : {})
    }))
  }
  async function saveInfo() {
    await api.updateTicket(aftersaleNo, {
      ...form,
      amount: parseAmountToCents(form.amount),
      refundAmount: parseAmountToCents(form.refundAmount),
      appliedAt: localInputToMs(form.appliedAt)
    })
    setEditing(false)
    await reload()
    onChanged()
    setMsg('已保存基本信息')
  }
  const region: RegionValue = {
    provinceCode: form.provinceCode, province: form.province, cityCode: form.cityCode,
    city: form.city, districtCode: form.districtCode, district: form.district
  }

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
          <button className="btn-ghost px-2.5" onClick={openAftersale} title="在拼多多打开售后详情">
            <IconExternal className="text-[15px]" /> 售后详情
          </button>
          <button className="btn-ghost px-2.5 disabled:opacity-50" onClick={openOrder} disabled={!ticket.orderNo} title="在拼多多打开订单详情">
            <IconExternal className="text-[15px]" /> 订单详情
          </button>
          <button className="btn-ghost px-2.5 disabled:opacity-50" onClick={openChat} disabled={!ticket.orderNo} title="在拼多多打开客户聊天记录">
            <IconExternal className="text-[15px]" /> 聊天记录
          </button>
          <button className="btn-ghost px-2.5" onClick={openAppeal} title="在拼多多打开售后申诉">
            <IconExternal className="text-[15px]" /> 售后申诉
          </button>
          <button className="btn-ghost px-2.5" onClick={openCompensation} title="在拼多多打开消费者负向体验补偿明细">
            <IconExternal className="text-[15px]" /> 负向补偿
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
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold tracking-tight text-ink">基本信息</h3>
            {editing ? (
              <span className="flex gap-1.5">
                <button className="btn-primary px-2.5 py-1 text-xs" onClick={saveInfo}>保存</button>
                <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setEditing(false)}>取消</button>
              </span>
            ) : (
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={startEdit}>编辑</button>
            )}
          </div>
          {editing && (
            <div className="mt-4">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">粘贴识别</span>
              <textarea
                className="field h-16 resize-none"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="粘贴收货地址,自动识别姓名/电话/地址"
              />
              <button className="btn-ghost mt-1.5 px-3 py-1 text-xs disabled:opacity-50" disabled={!pasteText.trim()} onClick={recognize}>识别</button>
            </div>
          )}
          <dl className="mt-4 space-y-4">
            <InfoRow label="收货人姓名">
              {editing
                ? <input className="field py-1.5" value={form.recipientName} onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.recipientName} />}
            </InfoRow>
            <InfoRow label="手机号">
              {editing
                ? <div className="flex gap-2">
                    <input className="field tnum py-1.5" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="手机号" />
                    <input className="field tnum w-24 py-1.5" value={form.extension} onChange={(e) => setForm((f) => ({ ...f, extension: e.target.value }))} placeholder="分机号" />
                  </div>
                : <Value v={ticket.phone ? (ticket.extension ? `${ticket.phone} 转 ${ticket.extension}` : ticket.phone) : ''} />}
            </InfoRow>
            <InfoRow label="联系地址">
              {editing
                ? <div className="space-y-2">
                    <RegionCascader value={region} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
                    <input className="field py-1.5" value={form.addressDetail} onChange={(e) => setForm((f) => ({ ...f, addressDetail: e.target.value }))} placeholder="详细地址" />
                  </div>
                : <Value v={[regionLabel(ticket), ticket.addressDetail].filter(Boolean).join(' ')} />}
            </InfoRow>
            <div className="h-px bg-line" />
            <InfoRow label="订单号">
              {editing
                ? <input className="field tnum py-1.5" value={form.orderNo} onChange={(e) => setForm((f) => ({ ...f, orderNo: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.orderNo} />}
            </InfoRow>
            <InfoRow label="发货快递单号">
              {editing
                ? <input className="field tnum py-1.5" value={form.shippingNo} onChange={(e) => setForm((f) => ({ ...f, shippingNo: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.shippingNo} />}
            </InfoRow>
            <InfoRow label="退货快递单号">
              {editing
                ? <input className="field tnum py-1.5" value={form.returnNo} onChange={(e) => setForm((f) => ({ ...f, returnNo: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.returnNo} />}
            </InfoRow>
            <div className="h-px bg-line" />
            <InfoRow label="售后类型">
              {editing
                ? <select className="field py-1.5" value={form.aftersaleType} onChange={(e) => setForm((f) => ({ ...f, aftersaleType: e.target.value }))}>
                    <option value="">未选择</option>
                    {withCurrent(TYPE_OPTIONS, form.aftersaleType).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                : <Value v={ticket.aftersaleType} />}
            </InfoRow>
            <InfoRow label="售后原因">
              {editing
                ? <select className="field py-1.5" value={form.aftersaleReason} onChange={(e) => setForm((f) => ({ ...f, aftersaleReason: e.target.value }))}>
                    <option value="">未选择</option>
                    {withCurrent(REASON_OPTIONS, form.aftersaleReason).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                : <Value v={ticket.aftersaleReason} />}
            </InfoRow>
            <InfoRow label="发货状态">
              {editing
                ? <select className="field py-1.5" value={form.shippingStatus} onChange={(e) => setForm((f) => ({ ...f, shippingStatus: e.target.value }))}>
                    <option value="">未选择</option>
                    {withCurrent(SHIPPING_OPTIONS, form.shippingStatus).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                : <Value v={ticket.shippingStatus} />}
            </InfoRow>
            <InfoRow label="交易金额">
              {editing
                ? <input className="field tnum py-1.5" type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="未填写" />
                : <Value v={formatCents(ticket.amount)} />}
            </InfoRow>
            <InfoRow label="退款金额">
              {editing
                ? <input className="field tnum py-1.5" type="number" step="0.01" value={form.refundAmount} onChange={(e) => setForm((f) => ({ ...f, refundAmount: e.target.value }))} placeholder="未填写" />
                : <Value v={formatCents(ticket.refundAmount)} />}
            </InfoRow>
            <InfoRow label="申请时间">
              {editing
                ? <input className="field tnum py-1.5" type="datetime-local" step="1" value={form.appliedAt} onChange={(e) => setForm((f) => ({ ...f, appliedAt: e.target.value }))} />
                : <Value v={formatMs(ticket.appliedAt)} />}
            </InfoRow>
            <InfoRow label="退货物流状态">
              {editing
                ? <input className="field py-1.5" value={form.returnLogistics} onChange={(e) => setForm((f) => ({ ...f, returnLogistics: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.returnLogistics} />}
            </InfoRow>
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
                <select className="rounded border border-line bg-surface px-1.5 py-1 text-xs" defaultValue="__none"
                  onChange={(e) => { const v = e.target.value; e.currentTarget.value = '__none'; if (v !== '__none') void moveSelected(v === '__root' ? '' : v) }}>
                  <option value="__none">移动到…</option>
                  <option value="__root">根目录</option>
                  {folders.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
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
            <MaterialGrid
              materials={materials}
              folders={folders}
              currentFolder={currentFolder}
              selectedIds={selected}
              onToggle={toggle}
              onOpen={setPreview}
              onEnterFolder={setCurrentFolder}
              onCreateFolder={createFolder}
              onRenameFolder={renameFolder}
              onDeleteFolder={deleteFolder}
            />
          </div>
        </div>
      </div>

      <PreviewModal material={preview} onClose={() => setPreview(null)} />
      <NewMaterialDialog
        open={newOpen}
        aftersaleNo={aftersaleNo}
        targetFolder={currentFolder}
        onCancel={() => setNewOpen(false)}
        onCreated={async (m) => { setNewOpen(false); await reload(); setMsg(`已新建材料:${m.name || m.relPath.split('/').pop()}`) }}
      />
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
