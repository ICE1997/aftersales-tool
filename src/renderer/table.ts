/** Slice `items` to page `page` (1-based). Out-of-range pages clamp into [1, pageCount]. */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  if (items.length === 0) return []
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const p = Math.min(Math.max(1, page), pageCount)
  const start = (p - 1) * pageSize
  return items.slice(start, start + pageSize)
}

/** Format an epoch-ms timestamp as local `YYYY-MM-DD HH:mm`. */
export function formatTime(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
