import type { RegionCount } from '@shared/types'
import type { Bucket } from './applied-time-buckets'

/** Build an ECharts option for a horizontal Top-20 ranking bar (highest at top). */
export function barOption(data: RegionCount[]): Record<string, unknown> {
  const rows = [...data.slice(0, 20)].reverse() // reverse so the largest sits at the top of the y category axis
  return {
    grid: { left: 8, right: 48, top: 12, bottom: 12, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: rows.map((r) => r.name) },
    series: [{
      type: 'bar',
      data: rows.map((r) => r.count),
      label: { show: true, position: 'right' },
      itemStyle: { color: '#bd4f2a', borderRadius: [0, 4, 4, 0] }
    }]
  }
}

/** Vertical bar option for the applied-time distribution chart. */
export function appliedTimeBarOption(buckets: Bucket[]): Record<string, unknown> {
  return {
    grid: { left: 8, right: 12, top: 20, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: buckets.map((b) => b.label), axisTick: { alignWithLabel: true } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar',
      data: buckets.map((b) => b.count),
      label: { show: true, position: 'top' },
      itemStyle: { color: '#bd4f2a', borderRadius: [4, 4, 0, 0] },
    }],
  }
}
