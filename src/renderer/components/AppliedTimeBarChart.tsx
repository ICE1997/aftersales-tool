import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import { appliedTimeBarOption } from '../charts'
import type { Bucket } from '../applied-time-buckets'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

export function AppliedTimeBarChart({ buckets }: { buckets: Bucket[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const option = useMemo(() => appliedTimeBarOption(buckets), [buckets])

  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chartRef.current = chart
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setOption(option as EChartsCoreOption, true)
    chart.resize()
  }, [option])

  return <div ref={ref} style={{ width: '100%', height: 220 }} />
}
