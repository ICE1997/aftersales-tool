import { useEffect, useState } from 'react'
import type { Ticket } from '@shared/types'
import { formatMs } from '@shared/aftersale-format'
import { STATUS_META } from '../status'
import { paginate } from '../table'
import { regionLabel } from '../region'
import { IconBox } from './icons'
import { applySort, DEFAULT_SORT, type SortKey } from '../ticket-filter'

interface Props { tickets: Ticket[]; onOpen: (no: string) => void; selected?: string }

const SIZES = [10, 20, 50]

export function TicketTable({ tickets, onOpen, selected }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sort, setSort] = useState(DEFAULT_SORT)
  useEffect(() => { setPage(1) }, [tickets])

  const total = tickets.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  const rows = paginate(applySort(tickets, sort), current, pageSize)

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '')

  return (
    <div className="flex h-full flex-col p-6">
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-line bg-surface py-20 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-paper-2 text-muted"><IconBox className="text-2xl" /></div>
          <p className="text-sm text-muted">暂无售后单</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[1240px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead className="sticky top-0 z-20 bg-paper-2 text-[11px] uppercase tracking-wider text-muted [&_th]:bg-paper-2">
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 text-left font-medium">售后单号</th>
                <th className="px-4 py-2.5 text-left font-medium">
                  <button className="inline-flex items-center font-medium uppercase tracking-wider hover:text-accent-ink" onClick={() => toggleSort('status')}>售后状态{arrow('status')}</button>
                </th>
                <th className="px-4 py-2.5 text-left font-medium">售后类型</th>
                <th className="px-4 py-2.5 text-left font-medium">收件人</th>
                <th className="px-4 py-2.5 text-left font-medium">地区</th>
                <th className="px-4 py-2.5 text-left font-medium">订单号</th>
                <th className="px-4 py-2.5 text-left font-medium">发货快递单号</th>
                <th className="px-4 py-2.5 text-left font-medium">退货快递单号</th>
                <th className="px-4 py-2.5 text-left font-medium">退货物流状态</th>
                <th className="px-4 py-2.5 text-left font-medium">
                  <button className="inline-flex items-center font-medium uppercase tracking-wider hover:text-accent-ink" onClick={() => toggleSort('appliedAt')}>申请时间{arrow('appliedAt')}</button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const meta = STATUS_META[t.status] ?? STATUS_META['待商家处理']
                const isSelected = t.aftersaleNo === selected
                return (
                  <tr
                    key={t.aftersaleNo}
                    className={`animate-rise cursor-pointer border-b border-line transition-colors last:border-0 ${isSelected ? 'bg-accent-soft' : 'hover:bg-paper-2'}`}
                    style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
                    onClick={() => { if (window.getSelection()?.toString()) return; onOpen(t.aftersaleNo) }}
                  >
                    <td className="tnum px-4 py-3 font-medium text-ink">{t.aftersaleNo}</td>
                    <td className="px-4 py-3"><span className={`chip ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span></td>
                    <td className="px-4 py-3 text-ink-soft">{t.aftersaleType || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{t.recipientName || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{regionLabel(t) || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.orderNo || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.shippingNo || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.returnNo || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{t.returnLogistics || '—'}</td>
                    <td className="tnum px-4 py-3 text-muted">{formatMs(t.appliedAt) || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-paper-2 px-4 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-muted">
              <span>共 {total} 条</span>
              <select className="rounded border border-line bg-surface px-1.5 py-1 text-xs" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
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
