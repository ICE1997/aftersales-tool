import { useEffect, useState } from 'react'
import type { CustomerSummary, Ticket } from '@shared/types'
import { api } from '../api'
import { regionLabel } from '../region'
import { STATUS_META } from '../status'
import { formatTime } from '../table'

interface Props { summary: CustomerSummary; onBack: () => void; onOpenTicket: (no: string) => void }

export function CustomerDetail({ summary, onBack, onOpenTicket }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  useEffect(() => { api.customerTickets(summary.nickname).then(setTickets) }, [summary.nickname])

  const region = regionLabel(summary)
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-paper-2 px-6 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <button className="btn-ghost mt-0.5 px-2.5" onClick={onBack} aria-label="返回">← 返回</button>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">客户昵称</div>
            <h2 className="mt-0.5 truncate font-display text-2xl font-extrabold tracking-tight text-ink">{summary.nickname}</h2>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-ink-soft">
          <span><span className="text-[11px] uppercase tracking-wider text-muted">收货人 </span>{summary.recipientName || '—'}</span>
          <span><span className="text-[11px] uppercase tracking-wider text-muted">手机号 </span>{summary.phone || '—'}</span>
          <span><span className="text-[11px] uppercase tracking-wider text-muted">地区 </span>{region || '—'}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-2 text-sm font-medium text-ink-soft">售后单 <span className="tnum text-muted">{tickets.length}</span></div>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted">暂无售后单</p>
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
