// Date helpers bridging react-day-picker (Date objects) with our stored values:
// the filter uses epoch-ms day bounds; the 申请时间 field uses a datetime-local
// string (YYYY-MM-DDTHH:mm:ss) round-tripped via @shared/aftersale-format.

function pad(n: number): string { return String(n).padStart(2, '0') }

/** Local start-of-day (00:00:00.000) epoch ms for a picked date. */
export function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
}

/** Local end-of-day (23:59:59.999) epoch ms for a picked date. */
export function endOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()
}

/** epoch ms → Date (for seeding the picker), null/undefined → undefined. */
export function msToDate(ms: number | null | undefined): Date | undefined {
  return ms == null ? undefined : new Date(ms)
}

/** 'YYYY-MM-DD' label for a date (or '' for undefined). */
export function dateLabel(d: Date | undefined): string {
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : ''
}

/** Parse a datetime-local string into a calendar Date + 'HH:mm:ss' time. */
export function splitLocalInput(s: string): { date: Date | undefined; time: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec((s || '').trim())
  if (!m) return { date: undefined, time: '' }
  return {
    date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
    time: `${m[4]}:${m[5]}:${m[6] ?? '00'}`
  }
}

/** Combine a picked date + 'HH:mm[:ss]' into a datetime-local string. */
export function joinLocalInput(date: Date, time: string): string {
  const t = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time)
  const hms = t ? `${t[1]}:${t[2]}:${t[3] ?? '00'}` : '00:00:00'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${hms}`
}
