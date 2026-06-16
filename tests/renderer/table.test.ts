import { describe, it, expect } from 'vitest'
import { paginate, formatTime } from '../../src/renderer/table'

describe('paginate', () => {
  const items = Array.from({ length: 25 }, (_, i) => i)
  it('returns the requested page slice', () => {
    expect(paginate(items, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(paginate(items, 3, 10)).toEqual([20, 21, 22, 23, 24])
  })
  it('clamps an out-of-range page to the last page', () => {
    expect(paginate(items, 9, 10)).toEqual([20, 21, 22, 23, 24])
  })
  it('clamps a page below 1 to the first page', () => {
    expect(paginate(items, 0, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })
  it('returns empty for an empty array', () => {
    expect(paginate([], 1, 10)).toEqual([])
  })
})

describe('formatTime', () => {
  it('formats a local time as YYYY-MM-DD HH:mm', () => {
    const ms = new Date(2024, 0, 9, 8, 5).getTime() // local 2024-01-09 08:05
    expect(formatTime(ms)).toBe('2024-01-09 08:05')
  })
})
