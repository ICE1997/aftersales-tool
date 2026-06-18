import { MultiSelectMenu } from './MultiSelectMenu'
import { DateRangeField } from './DateFields'
import { STATUS_ORDER } from '../status'
import { TYPE_OPTIONS, REASON_OPTIONS, SHIPPING_OPTIONS } from '../aftersale-options'
import { EMPTY_FILTER, isFilterActive, type TicketFilter } from '../ticket-filter'
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
        label="原因" options={REASON_OPTIONS} selected={filter.reasons}
        onChange={(v) => onChange({ ...filter, reasons: v })}
      />
      <MultiSelectMenu
        label="发货状态" options={SHIPPING_OPTIONS} selected={filter.shippingStatuses}
        onChange={(v) => onChange({ ...filter, shippingStatuses: v })}
      />
      <DateRangeField
        from={filter.appliedFrom}
        to={filter.appliedTo}
        onChange={(appliedFrom, appliedTo) => onChange({ ...filter, appliedFrom, appliedTo })}
      />
      <button
        className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-40"
        disabled={!active}
        onClick={() => onChange(EMPTY_FILTER)}
      >清除</button>
    </div>
  )
}
