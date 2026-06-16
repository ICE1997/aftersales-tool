// Pure conversions for the numeric aftersale fields. Shared by the importer,
// the DB migration, and the renderer. Times are interpreted in LOCAL time.

export function parseAmountToCents(s: string): number | null {
  const t = (s ?? '').trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function formatCents(cents: number | null): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

const DT_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/

export function parseDateTimeToMs(s: string): number | null {
  const m = DT_RE.exec((s ?? '').trim())
  if (!m) return null
  const ms = new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : 0
  ).getTime()
  return Number.isNaN(ms) ? null : ms
}

function pad(n: number): string { return String(n).padStart(2, '0') }

export function formatMs(ms: number | null): string {
  if (ms == null) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function msToLocalInput(ms: number | null): string {
  if (ms == null) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function localInputToMs(v: string): number | null {
  return parseDateTimeToMs(v)
}
