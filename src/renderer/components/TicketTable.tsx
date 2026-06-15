import { useEffect, useState } from 'react'
import type { Ticket } from '@shared/types'
import { STATUS_META } from '../status'
import { paginate, formatTime } from '../table'
import { IconBox, IconPlus } from './icons'

interface Props { tickets: Ticket[]; query: string; onOpen: (no: string) => void; onNew: () => void }

const SIZES = [10, 20, 50]

export function TicketTable({ tickets, query, onOpen, onNew }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [query, pageSize])

  const total = tickets.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  const rows = paginate(tickets, current, pageSize)

  return (
    <div className="p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-sm font-bold tracking-tight text-ink">售后单</span>
          <span className="tnum text-xs text-muted">{total}</span>
        </div>
        <button className="btn-primary px-3 py-1.5 text-sm" onClick={onNew}><IconPlus className="text-[15px]" /> 新建售后单</button>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-line bg-surface py-20 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-paper-2 text-muted"><IconBox className="text-2xl" /></div>
          <p className="text-sm text-muted">暂无售后单</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-paper-2 text-[11px] uppercase tracking-wider text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 text-left font-medium">售后单号</th>
                <th className="px-4 py-2.5 text-left font-medium">状态</th>
                <th className="px-4 py-2.5 text-left font-medium">订单号</th>
                <th className="px-4 py-2.5 text-left font-medium">发货单号</th>
                <th className="px-4 py-2.5 text-left font-medium">退货单号</th>
                <th className="px-4 py-2.5 text-left font-medium">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const meta = STATUS_META[t.status]
                return (
                  <tr
                    key={t.aftersaleNo}
                    className="animate-rise cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-paper-2"
                    style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
                    onClick={() => onOpen(t.aftersaleNo)}
                  >
                    <td className="tnum px-4 py-3 font-medium text-ink">{t.aftersaleNo}</td>
                    <td className="px-4 py-3"><span className={`chip ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span></td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.orderNo || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.shippingNo || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.returnNo || '—'}</td>
                    <td className="px-4 py-3 text-muted">{formatTime(t.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between gap-3 border-t border-line bg-paper-2 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-muted">
              <span>共 {total} 条</span>
              <select className="rounded border border-line bg-surface px-1.5 py-1 text-xs" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {SIZES.map((s) => <option key={s} value={s}>{s} / 页</option>)}
              </select>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <button className="btn-ghost px-2.5 py-1 text-xs disabled:opacity-50" disabled={current <= 1} onClick={() => setPage(current - 1)}>上一页</button>
                <span className="tnum text-xs text-ink-soft">{current} / {pageCount}</span>
                <button className="btn-ghost px-2.5 py-1 text-xs disabled:opacity-50" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>下一页</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
