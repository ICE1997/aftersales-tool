import { describe, it, expect } from 'vitest'
import {
  parseAmountToCents, formatCents,
  parseDateTimeToMs, formatMs, msToLocalInput, localInputToMs
} from '../../src/shared/aftersale-format'

describe('amount helpers', () => {
  it('parses yuan strings to integer cents', () => {
    expect(parseAmountToCents('24.99')).toBe(2499)
    expect(parseAmountToCents('22.5')).toBe(2250)
    expect(parseAmountToCents(' 24.99 ')).toBe(2499)
    expect(parseAmountToCents('100')).toBe(10000)
    expect(parseAmountToCents('24.999')).toBe(2500) // rounds to nearest cent
  })
  it('treats empty / non-numeric as null', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('   ')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('12a')).toBeNull()
  })
  it('formats cents back to a 2-decimal string', () => {
    expect(formatCents(2499)).toBe('24.99')
    expect(formatCents(2000)).toBe('20.00')
    expect(formatCents(null)).toBe('')
  })
})

describe('datetime helpers', () => {
  it('round-trips a local datetime string through ms', () => {
    const ms = parseDateTimeToMs('2026-05-28 14:27:38')
    expect(typeof ms).toBe('number')
    expect(formatMs(ms)).toBe('2026-05-28 14:27:38')
  })
  it('accepts the T separator and optional seconds', () => {
    expect(parseDateTimeToMs('2026-05-28T14:27:38')).toBe(parseDateTimeToMs('2026-05-28 14:27:38'))
    expect(formatMs(parseDateTimeToMs('2026-05-28 14:27'))).toBe('2026-05-28 14:27:00')
  })
  it('treats empty / malformed as null', () => {
    expect(parseDateTimeToMs('')).toBeNull()
    expect(parseDateTimeToMs('not a date')).toBeNull()
    expect(formatMs(null)).toBe('')
  })
  it('round-trips through the datetime-local input format', () => {
    const ms = parseDateTimeToMs('2026-05-28 14:27:38')
    expect(msToLocalInput(ms)).toBe('2026-05-28T14:27:38')
    expect(localInputToMs('2026-05-28T14:27:38')).toBe(ms)
    expect(msToLocalInput(null)).toBe('')
    expect(localInputToMs('')).toBeNull()
  })
  it('localInputToMs strips an optional fractional-seconds suffix', () => {
    const base = localInputToMs('2026-05-28T14:27:38')
    expect(localInputToMs('2026-05-28T14:27:38.000')).toBe(base)
    expect(localInputToMs('2026-05-28T14:27:38.123')).toBe(base)
  })
})
