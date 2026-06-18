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

// Applied-time distribution as a terracotta area line (reads as a trend/rhythm
// over time). Gentle smoothing only — these are discrete counts, so heavy
// smoothing would misleadingly imply values between buckets.
export function appliedTimeBarOption(buckets: Bucket[]): Record<string, unknown> {
  return {
    grid: { left: 8, right: 16, top: 20, bottom: 24, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', boundaryGap: false, data: buckets.map((b) => b.label), axisTick: { alignWithLabel: true } },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'line',
      data: buckets.map((b) => b.count),
      smooth: 0.2,
      symbol: 'circle',
      symbolSize: 6,
      showSymbol: buckets.length <= 40,
      lineStyle: { color: '#bd4f2a', width: 2 },
      itemStyle: { color: '#bd4f2a' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(189,79,42,0.28)' },
            { offset: 1, color: 'rgba(189,79,42,0.02)' },
          ],
        },
      },
    }],
  }
}
