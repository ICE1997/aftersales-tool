import { useEffect, useState } from 'react'
import type { Customer, Ticket } from '@shared/types'
import { api } from '../api'
import { regionLabel } from '../region'
import { STATUS_META } from '../status'
import { formatTime } from '../table'

interface Props { id: number; onBack: () => void; onEdit: (c: Customer) => void; onDeleted: () => void; onOpenTicket: (no: string) => void; refreshTick?: number }

export function CustomerDetail({ id, onBack, onEdit, onDeleted, onOpenTicket, refreshTick }: Props) {
  const [customer, setCustomer] = useState<Customer | undefined>()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function reload() {
    const [c, ts] = await Promise.all([api.getCustomer(id), api.customerTickets(id)])
    setCustomer(c)
    setTickets(ts)
  }
  useEffect(() => { setConfirmDelete(false); reload() }, [id, refreshTick])

  if (!customer) return null
  const region = regionLabel(customer)
  const fullAddress = [region, customer.addressDetail].filter(Boolean).join(' ')

  async function remove() {
    try { await api.deleteCustomer(id); onDeleted() }
    catch (e) { setErr(`删除失败:${(e as Error).message}`) }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-paper-2 px-6 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <button className="btn-ghost mt-0.5 px-2.5" onClick={onBack} aria-label="返回">← 返回</button>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">客户</div>
            <h2 className="mt-0.5 truncate font-display text-2xl font-extrabold tracking-tight text-ink">{customer.name || customer.nickname || '未命名'}</h2>
          </div>
          <button className="btn-ghost ml-auto mt-0.5 px-2.5" onClick={() => onEdit(customer)}>编辑</button>
          <button className="btn-danger mt-0.5 px-2.5" onClick={() => setConfirmDelete(true)}>删除</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm text-ink-soft">
          <span className="numchip"><span className="text-[11px] text-muted">昵称</span><span>{customer.nickname || '—'}</span></span>
          <span className="numchip"><span className="text-[11px] text-muted">地址</span><span>{fullAddress || '—'}</span></span>
        </div>
      </div>

      {confirmDelete && (
        <div className="flex animate-slidedown items-center justify-between gap-3 border-b border-danger-soft bg-danger-soft px-6 py-2.5 text-sm text-danger">
          <span>{err ?? '确认删除该客户?其关联售后单将解除关联(不删除售后单)。'}</span>
          <span className="flex shrink-0 gap-2">
            <button className="btn-danger-solid px-3 py-1.5 text-xs" onClick={remove}>确认删除</button>
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirmDelete(false)}>取消</button>
          </span>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-2 text-sm font-medium text-ink-soft">关联售后单 <span className="tnum text-muted">{tickets.length}</span></div>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted">暂无关联售后单</p>
        ) : (
          <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
            <table className="w-full text-sm">
              <tbody>
                {tickets.map((t) => {
                  const meta = STATUS_META[t.status] ?? STATUS_META.pending
                  return (
                    <tr key={t.aftersaleNo} className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-paper-2" onClick={() => onOpenTicket(t.aftersaleNo)}>
                      <td className="tnum px-4 py-3 font-medium text-ink">{t.aftersaleNo}</td>
                      <td className="px-4 py-3"><span className={`chip ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span></td>
                      <td className="px-4 py-3 text-muted">{formatTime(t.updatedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
