import { useMemo, useState } from 'react'
import type { RegionLevel, Ticket } from '@shared/types'
import { RegionBarChart } from './RegionBarChart'
import { ReturnMap } from './ReturnMap'
import { regionCountsFromTickets } from '../region-counts'

const LEVELS: { key: RegionLevel; label: string }[] = [
  { key: 'province', label: '省' },
  { key: 'city', label: '市' },
  { key: 'district', label: '区县' },
]

/** Region distribution of the currently filtered tickets: a 省/市/区 ranking,
 *  plus the nationwide drill-down map (the map is whole-data, not filtered). */
export function RegionPanel({ tickets }: { tickets: Ticket[] }) {
  const [mode, setMode] = useState<'rank' | 'map'>('rank')
  const [level, setLevel] = useState<RegionLevel>('province')
  const data = useMemo(() => regionCountsFromTickets(tickets, level), [tickets, level])
  const classified = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data])
  const total = tickets.length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
            <button className={`rounded-md px-3 py-1.5 ${mode === 'rank' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setMode('rank')}>排行</button>
            <button className={`rounded-md px-3 py-1.5 ${mode === 'map' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setMode('map')}>地图</button>
          </div>
          {mode === 'rank' && (
            <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
              {LEVELS.map((l) => (
                <button key={l.key} className={`rounded-md px-3 py-1.5 ${level === l.key ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setLevel(l.key)}>{l.label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="text-sm text-muted">
          {mode === 'rank' ? (
            <>共 <span className="tnum text-ink-soft">{total}</span> 单 · 已归类 <span className="tnum text-ink-soft">{classified}</span> · 未归类 <span className="tnum text-ink-soft">{total - classified}</span></>
          ) : (
            <span className="text-xs">地图为全部数据,不随筛选</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
        {mode === 'map' ? (
          <div className="h-full min-h-[360px]"><ReturnMap /></div>
        ) : data.length === 0 ? (
          <div className="rounded-xl2 border border-line bg-surface py-20 text-center text-sm text-muted shadow-card">该范围内暂无可统计的地区(给售后单关联带地址的客户后即可统计)</div>
        ) : (
          <>
            <div className="mb-3 font-display text-sm font-bold tracking-tight text-ink">售后最多的地区(Top 20)</div>
            <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
              <RegionBarChart data={data} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
