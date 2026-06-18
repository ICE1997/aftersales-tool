// src/renderer/components/AppliedTimePanel.tsx
import { useMemo, useState } from 'react'
import type { Ticket } from '@shared/types'
import { DatePresetChips } from './DatePresetChips'
import { AppliedTimeBarChart } from './AppliedTimeBarChart'
import { DateRangeField } from './DateFields'
import { bucketByAppliedTime, summaryText } from '../applied-time-buckets'
import { presetRange, matchPreset, type PresetKey } from '../date-presets'

interface Props {
  tickets: Ticket[]
  from: number | null
  to: number | null
  onRangeChange: (from: number | null, to: number | null) => void
}

/** Collapsible panel: quick-range chips + custom date + applied-time bar chart. */
export function AppliedTimePanel({ tickets, from, to, onRangeChange }: Props) {
  const [open, setOpen] = useState(true)
  const result = useMemo(() => bucketByAppliedTime(tickets, from, to), [tickets, from, to])
  const activePreset = matchPreset(from, to)

  function selectPreset(key: PresetKey) {
    const r = presetRange(key)
    onRangeChange(r.from, r.to)
  }

  return (
    <div className="shrink-0 border-b border-line bg-paper-2 px-6 py-3">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm text-ink-soft">申请时间分布</span>
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen((o) => !o)}>
          {open ? '收起' : '展开'}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <DatePresetChips active={activePreset} onSelect={selectPreset} />
            <DateRangeField from={from} to={to} onChange={onRangeChange} />
          </div>
          {result.total === 0 ? (
            <div className="grid h-[180px] place-items-center text-sm text-muted">该范围内暂无售后单</div>
          ) : (
            <>
              <AppliedTimeBarChart buckets={result.buckets} />
              <div className="text-right text-xs text-muted tnum">{summaryText(result)}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
