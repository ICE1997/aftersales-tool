import { describe, it, expect } from 'vitest'
import { startOfDayMs, endOfDayMs, msToDate, dateLabel, splitLocalInput, joinLocalInput } from '../../src/renderer/date-util'

describe('date-util', () => {
  it('startOfDayMs / endOfDayMs span one day minus 1ms', () => {
    const d = new Date(2026, 4, 28, 13, 30) // local
    expect(endOfDayMs(d) - startOfDayMs(d)).toBe(24 * 3600 * 1000 - 1)
    expect(new Date(startOfDayMs(d)).getHours()).toBe(0)
    expect(new Date(endOfDayMs(d)).getHours()).toBe(23)
  })

  it('msToDate round-trips and handles null', () => {
    const ms = startOfDayMs(new Date(2026, 4, 28))
    expect(msToDate(ms)?.getTime()).toBe(ms)
    expect(msToDate(null)).toBeUndefined()
    expect(msToDate(undefined)).toBeUndefined()
  })

  it('dateLabel formats / blanks', () => {
    expect(dateLabel(new Date(2026, 4, 28))).toBe('2026-05-28')
    expect(dateLabel(undefined)).toBe('')
  })

  it('splitLocalInput parses date + time (seconds optional)', () => {
    const a = splitLocalInput('2026-05-28T14:27:38')
    expect(dateLabel(a.date)).toBe('2026-05-28')
    expect(a.time).toBe('14:27:38')
    const b = splitLocalInput('2026-05-28T09:05')
    expect(b.time).toBe('09:05:00')
    expect(splitLocalInput('').date).toBeUndefined()
    expect(splitLocalInput('garbage').time).toBe('')
  })

  it('joinLocalInput recombines and round-trips with splitLocalInput', () => {
    expect(joinLocalInput(new Date(2026, 4, 28), '14:27:38')).toBe('2026-05-28T14:27:38')
    expect(joinLocalInput(new Date(2026, 4, 28), '09:05')).toBe('2026-05-28T09:05:00')
    expect(joinLocalInput(new Date(2026, 4, 28), '')).toBe('2026-05-28T00:00:00')
    const s = '2026-05-28T14:27:38'
    const { date, time } = splitLocalInput(s)
    expect(joinLocalInput(date!, time)).toBe(s)
  })
})
