import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { MapChart } from 'echarts/charts'
import { TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { RegionLevel } from '@shared/types'
import { api } from '../api'
import { loadGeo, mapData, toAdcode } from '../geo'

echarts.use([MapChart, TooltipComponent, VisualMapComponent, CanvasRenderer])

interface Frame { adcode: string; level: RegionLevel; name: string }
const NEXT: Record<RegionLevel, RegionLevel | null> = { province: 'city', city: 'district', district: null }
interface GeoFC { features: { properties: { adcode: number | string; name: string } }[] }

export function ReturnMap() {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const featuresRef = useRef<GeoFC['features']>([])
  const busyRef = useRef(false)
  const [stack, setStack] = useState<Frame[]>([{ adcode: '100000', level: 'province', name: '全国' }])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [notice, setNotice] = useState<string | null>(null)
  const current = stack[stack.length - 1]

  // init once
  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chartRef.current = chart
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.dispose(); chartRef.current = null }
  }, [])

  // (re)bind click for the current level
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const handler = (p: { name?: string }) => {
      if (busyRef.current) return
      const next = NEXT[current.level]
      if (!next || !p.name) return
      const f = featuresRef.current.find((x) => x.properties.name === p.name)
      if (!f) return
      setNotice(null)
      setStack((s) => [...s, { adcode: toAdcode(String(f.properties.adcode)), level: next, name: p.name! }])
    }
    chart.on('click', handler)
    return () => { chart.off('click', handler) }
  }, [current.level])

  // load geo + counts and render whenever the current frame changes
  useEffect(() => {
    let alive = true
    setStatus('loading')
    busyRef.current = true
    Promise.all([loadGeo(current.adcode), api.regionCounts(current.level)])
      .then(([geo, counts]) => {
        if (!alive || !chartRef.current) return
        const fc = geo as GeoFC
        featuresRef.current = fc.features
        const countsByAdcode: Record<string, number> = {}
        for (const c of counts) countsByAdcode[toAdcode(c.code)] = c.count
        const { rows, max } = mapData(fc.features, countsByAdcode)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        echarts.registerMap(current.adcode, geo as any)
        chartRef.current.setOption({
          tooltip: { trigger: 'item', formatter: (p: { name?: string; value?: number }) => `${p.name}:${p.value || 0} 单` },
          visualMap: { min: 0, max: Math.max(1, max), inRange: { color: ['#f6e9e2', '#bd4f2a'] }, left: 8, bottom: 8 },
          series: [{ type: 'map', map: current.adcode, roam: true, data: rows, label: { show: false } }]
        }, true)
        chartRef.current.resize()
        setStatus('ready')
      })
      .catch(() => {
        if (!alive) return
        setStack((s) => {
          if (s.length > 1) { setNotice('该地区暂无下级地图'); return s.slice(0, -1) }
          setStatus('error')
          return s
        })
      })
      .finally(() => { if (alive) busyRef.current = false })
    return () => { alive = false }
  }, [current.adcode, current.level])

  return (
    <div>
      <div className="mb-3 flex items-center gap-1 text-sm text-muted">
        {stack.map((f, i) => (
          <span key={f.adcode + '-' + i} className="flex items-center gap-1">
            {i > 0 && <span>/</span>}
            <button className="btn-ghost px-2 py-0.5 text-xs disabled:opacity-60" disabled={i === stack.length - 1} onClick={() => setStack((s) => s.slice(0, i + 1))}>{f.name}</button>
          </span>
        ))}
        {notice && <span className="ml-2 text-xs text-warn">{notice}</span>}
      </div>
      <div className="relative rounded-xl2 border border-line bg-surface p-2 shadow-card">
        {status === 'loading' && <div className="absolute inset-0 z-10 grid place-items-center text-sm text-muted">地图加载中…</div>}
        {status === 'error' && <div className="absolute inset-0 z-10 grid place-items-center text-sm text-danger">地图数据缺失</div>}
        <div ref={ref} style={{ width: '100%', height: 560 }} />
      </div>
    </div>
  )
}
