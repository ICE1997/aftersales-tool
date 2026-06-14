import type { Ticket } from '@shared/types'

interface Props { tickets: Ticket[]; selected?: string; onSelect: (no: string) => void; onNew: () => void }

export function TicketList({ tickets, selected, onSelect, onNew }: Props) {
  return (
    <div className="flex h-full flex-col">
      <button className="m-2 rounded bg-blue-600 px-3 py-2 text-white" onClick={onNew}>+ 新建售后单</button>
      <ul className="flex-1 overflow-auto">
        {tickets.map((t) => (
          <li key={t.aftersaleNo}>
            <button
              className={`w-full px-4 py-3 text-left hover:bg-gray-100 ${selected === t.aftersaleNo ? 'bg-gray-200' : ''}`}
              onClick={() => onSelect(t.aftersaleNo)}
            >
              <div className="font-medium">{t.aftersaleNo}</div>
              <div className="text-xs text-gray-500">{t.status} · 订单 {t.orderNo || '—'}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
