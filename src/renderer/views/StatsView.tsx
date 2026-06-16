import { useEffect, useState } from 'react'
import type { RegionCount, RegionLevel, StatsSummary } from '@shared/types'
import { api } from '../api'
import { RegionBarChart } from '../components/RegionBarChart'
import { ReturnMap } from '../components/ReturnMap'

const LEVELS: { key: RegionLevel; label: string }[] = [
  { key: 'province', label: '省' },
  { key: 'city', label: '市' },
  { key: 'district', label: '区县' }
]

export function StatsView() {
  const [mode, setMode] = useState<'rank' | 'map'>('rank')
  const [level, setLevel] = useState<RegionLevel>('province')
  const [data, setData] = useState<RegionCount[]>([])
  const [summary, setSummary] = useState<StatsSummary>({ total: 0, classified: 0, unclassified: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.statsSummary().then(setSummary).catch(() => {})
  }, [])

  useEffect(() => {
    let stale = false
    api.regionCounts(level)
      .then((d) => { if (!stale) { setData(d); setError(null) } })
      .catch((e) => { if (!stale) setError(`加载失败:${(e as Error).message}`) })
    return () => { stale = true }
  }, [level])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-2 px-6 py-3">
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
          共 <span className="tnum text-ink-soft">{summary.total}</span> 单 · 已归类 <span className="tnum text-ink-soft">{summary.classified}</span> · 未归类 <span className="tnum text-ink-soft">{summary.unclassified}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {mode === 'map' ? (
          <ReturnMap />
        ) : (
          <>
            <div className="mb-3 font-display text-sm font-bold tracking-tight text-ink">售后最多的地区(Top 20)</div>
            {error ? (
              <div className="rounded-xl2 border border-danger-soft bg-danger-soft py-20 text-center text-sm text-danger shadow-card">{error}</div>
            ) : data.length === 0 ? (
              <div className="rounded-xl2 border border-line bg-surface py-20 text-center text-sm text-muted shadow-card">暂无可统计的数据(请先给售后单关联带地址的客户)</div>
            ) : (
              <div className="rounded-xl2 border border-line bg-surface p-4 shadow-card">
                <RegionBarChart data={data} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
