import type { Ticket } from '@shared/types'
import { STATUS_META } from '../status'
import { IconPlus } from './icons'

interface Props { tickets: Ticket[]; selected?: string; onSelect: (no: string) => void; onNew: () => void }

export function TicketList({ tickets, selected, onSelect, onNew }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-sm font-bold tracking-tight text-ink">售后单</span>
          <span className="tnum text-xs text-muted">{tickets.length}</span>
        </div>
        <button className="btn-primary px-2.5 py-1.5 text-xs" onClick={onNew}>
          <IconPlus className="text-[15px]" /> 新建
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted">暂无售后单</div>
      ) : (
        <ul className="flex-1 space-y-1 overflow-auto px-2 pb-3">
          {tickets.map((t, i) => {
            const meta = STATUS_META[t.status]
            const active = selected === t.aftersaleNo
            return (
              <li key={t.aftersaleNo} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}>
                <button
                  onClick={() => onSelect(t.aftersaleNo)}
                  className={`group relative w-full overflow-hidden rounded-xl2 border px-3.5 py-3 text-left transition-all duration-150 ${
                    active
                      ? 'border-accent bg-accent-soft shadow-sm'
                      : 'border-transparent hover:border-line hover:bg-surface hover:shadow-card'
                  }`}
                >
                  <span
                    className={`absolute inset-y-2 left-0 w-1 rounded-full transition-all ${active ? 'bg-accent' : 'bg-transparent group-hover:bg-line-strong'}`}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="tnum truncate text-[13px] font-semibold text-ink">{t.aftersaleNo}</span>
                    <span className={`chip ${meta.chip} shrink-0`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted">
                    订单 <span className="tnum text-ink-soft">{t.orderNo || '—'}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
