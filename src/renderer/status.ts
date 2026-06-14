import type { TicketStatus } from '@shared/types'

// Chinese labels + Tailwind class tokens for each ticket status.
// Full class strings are written out so Tailwind's content scanner keeps them.
export const STATUS_META: Record<TicketStatus, { label: string; dot: string; chip: string }> = {
  pending: { label: '待处理', dot: 'bg-warn', chip: 'bg-warn-soft text-warn' },
  processing: { label: '处理中', dot: 'bg-info', chip: 'bg-info-soft text-info' },
  resolved: { label: '已解决', dot: 'bg-ok', chip: 'bg-ok-soft text-ok' }
}

export const STATUS_ORDER: TicketStatus[] = ['pending', 'processing', 'resolved']
