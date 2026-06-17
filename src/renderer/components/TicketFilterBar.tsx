import { MultiSelectMenu } from './MultiSelectMenu'
import { STATUS_ORDER } from '../status'
import { TYPE_OPTIONS, SHIPPING_OPTIONS } from '../aftersale-options'
import { EMPTY_FILTER, isFilterActive, dayStartMs, dayEndMs, msToDateInput, type TicketFilter } from '../ticket-filter'
import type { TicketStatus } from '@shared/types'

interface Props { filter: TicketFilter; onChange: (f: TicketFilter) => void }

export function TicketFilterBar({ filter, onChange }: Props) {
  const active = isFilterActive(filter)
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper-2 px-6 py-2.5">
      <MultiSelectMenu
        label="状态" options={STATUS_ORDER as unknown as string[]} selected={filter.statuses}
        onChange={(v) => onChange({ ...filter, statuses: v as TicketStatus[] })}
      />
      <MultiSelectMenu
        label="类型" options={TYPE_OPTIONS} selected={filter.types}
        onChange={(v) => onChange({ ...filter, types: v })}
      />
      <MultiSelectMenu
        label="发货状态" options={SHIPPING_OPTIONS} selected={filter.shippingStatuses}
        onChange={(v) => onChange({ ...filter, shippingStatuses: v })}
      />
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <span>申请时间</span>
        <input
          type="date" aria-label="申请时间起" className="field tnum w-[140px] py-1"
          value={msToDateInput(filter.appliedFrom)}
          onChange={(e) => onChange({ ...filter, appliedFrom: dayStartMs(e.target.value) })}
        />
        <span>至</span>
        <input
          type="date" aria-label="申请时间止" className="field tnum w-[140px] py-1"
          value={msToDateInput(filter.appliedTo)}
          onChange={(e) => onChange({ ...filter, appliedTo: dayEndMs(e.target.value) })}
        />
      </div>
      <button
        className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-40"
        disabled={!active}
        onClick={() => onChange(EMPTY_FILTER)}
      >清除</button>
    </div>
  )
}
