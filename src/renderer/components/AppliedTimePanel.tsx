import { useMemo } from 'react'
import type { Ticket } from '@shared/types'
import { DatePresetChips } from './DatePresetChips'
import { AppliedTimeBarChart } from './AppliedTimeBarChart'
import { bucketByAppliedTime, summaryText } from '../applied-time-buckets'
import { presetRange, matchPreset, type PresetKey } from '../date-presets'

interface Props {
  tickets: Ticket[]
  from: number | null
  to: number | null
  onRangeChange: (from: number | null, to: number | null) => void
}

/** Applied-time distribution view: quick-range chips + a full-height bar chart. */
export function AppliedTimePanel({ tickets, from, to, onRangeChange }: Props) {
  const result = useMemo(() => bucketByAppliedTime(tickets, from, to), [tickets, from, to])
  const activePreset = matchPreset(from, to)

  function selectPreset(key: PresetKey) {
    const r = presetRange(key)
    onRangeChange(r.from, r.to)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-6">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <DatePresetChips active={activePreset} onSelect={selectPreset} />
        {result.total > 0 && <span className="tnum text-xs text-muted">{summaryText(result)}</span>}
      </div>
      {result.total === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center rounded-xl2 border border-line bg-surface text-sm text-muted shadow-card">
          该范围内暂无售后单
        </div>
      ) : (
        <div className="min-h-0 flex-1 rounded-xl2 border border-line bg-surface p-4 shadow-card">
          <AppliedTimeBarChart buckets={result.buckets} />
        </div>
      )}
    </div>
  )
}
