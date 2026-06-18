import type { Ticket, TicketStatus } from '@shared/types'
import { STATUS_ORDER } from './status'

export interface TicketFilter {
  statuses: TicketStatus[]
  types: string[]
  reasons: string[]
  shippingStatuses: string[]
  appliedFrom: number | null
  appliedTo: number | null
}

export const EMPTY_FILTER: TicketFilter = {
  statuses: [], types: [], reasons: [], shippingStatuses: [], appliedFrom: null, appliedTo: null
}

export type SortKey = 'appliedAt' | 'status'
export type SortDir = 'asc' | 'desc'
export interface Sort { key: SortKey; dir: SortDir }

export const DEFAULT_SORT: Sort = { key: 'appliedAt', dir: 'desc' }

/** True when no facet is active. */
export function isFilterActive(f: TicketFilter): boolean {
  return f.statuses.length > 0 || f.types.length > 0 || f.reasons.length > 0 || f.shippingStatuses.length > 0 ||
    f.appliedFrom != null || f.appliedTo != null
}

/** Keep tickets passing every active facet (empty array / null facet = no constraint). */
export function applyFilter(tickets: Ticket[], f: TicketFilter): Ticket[] {
  return tickets.filter((t) => {
    if (f.statuses.length && !f.statuses.includes(t.status)) return false
    if (f.types.length && !f.types.includes(t.aftersaleType)) return false
    if (f.reasons.length && !f.reasons.includes(t.aftersaleReason)) return false
    if (f.shippingStatuses.length && !f.shippingStatuses.includes(t.shippingStatus)) return false
    if (f.appliedFrom != null && (t.appliedAt == null || t.appliedAt < f.appliedFrom)) return false
    if (f.appliedTo != null && (t.appliedAt == null || t.appliedAt > f.appliedTo)) return false
    return true
  })
}

function statusRank(s: TicketStatus): number {
  const i = STATUS_ORDER.indexOf(s)
  return i === -1 ? STATUS_ORDER.length : i
}

/** Stable sort into a NEW array. appliedAt nulls always sort last (both directions). */
export function applySort(tickets: Ticket[], sort: Sort): Ticket[] {
  const dir = sort.dir === 'desc' ? -1 : 1
  return tickets
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      let cmp: number
      if (sort.key === 'appliedAt') {
        const av = a.t.appliedAt, bv = b.t.appliedAt
        if (av == null && bv == null) cmp = 0
        else if (av == null) return 1
        else if (bv == null) return -1
        else cmp = (av - bv) * dir
      } else {
        cmp = (statusRank(a.t.status) - statusRank(b.t.status)) * dir
      }
      return cmp !== 0 ? cmp : a.i - b.i
    })
    .map((x) => x.t)
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** 'YYYY-MM-DD' → local 00:00:00.000 ms, or null if malformed/empty. */
export function dayStartMs(input: string): number | null {
  const m = DATE_RE.exec(input.trim())
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime()
}

/** 'YYYY-MM-DD' → local 23:59:59.999 ms, or null if malformed/empty. */
export function dayEndMs(input: string): number | null {
  const m = DATE_RE.exec(input.trim())
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime()
}

/** epoch ms → local 'YYYY-MM-DD' for <input type=date>; null → ''. */
export function msToDateInput(ms: number | null): string {
  if (ms == null) return ''
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
