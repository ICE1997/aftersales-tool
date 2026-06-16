import { useEffect, useState } from 'react'
import type { CustomerSummary } from '@shared/types'
import { paginate, formatTime } from '../table'
import { regionLabel } from '../region'
import { IconBox } from './icons'

interface Props { customers: CustomerSummary[]; query: string; onOpen: (nickname: string) => void }
const SIZES = [10, 20, 50]

export function CustomerTable({ customers, query, onOpen }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  useEffect(() => { setPage(1) }, [query])

  const total = customers.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pageCount)
  const rows = paginate(customers, current, pageSize)

  return (
    <div className="p-6">
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-display text-sm font-bold tracking-tight text-ink">客户</span>
        <span className="tnum text-xs text-muted">{total}</span>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl2 border border-line bg-surface py-20 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-paper-2 text-muted"><IconBox className="text-2xl" /></div>
          <p className="text-sm text-muted">暂无客户 — 在售后单里填写买家昵称后会自动归集</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl2 border border-line bg-surface shadow-card">
          <div className="max-h-[calc(100vh-220px)] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-2 text-[11px] uppercase tracking-wider text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-left font-medium">昵称</th>
                  <th className="px-4 py-2.5 text-left font-medium">收货人</th>
                  <th className="px-4 py-2.5 text-left font-medium">手机号</th>
                  <th className="px-4 py-2.5 text-left font-medium">地区</th>
                  <th className="px-4 py-2.5 text-left font-medium">售后单数</th>
                  <th className="px-4 py-2.5 text-left font-medium">最近更新</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.nickname}
                    className="animate-rise cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-paper-2"
                    style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
                    onClick={() => onOpen(c.nickname)}>
                    <td className="px-4 py-3 text-ink">{c.nickname}</td>
                    <td className="px-4 py-3 text-ink-soft">{c.recipientName || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{regionLabel(c) || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{c.ticketCount}</td>
                    <td className="px-4 py-3 text-muted">{formatTime(c.lastUpdatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line bg-paper-2 px-4 py-2.5 text-sm">
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
