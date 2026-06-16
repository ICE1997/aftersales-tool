import type { TicketStatus } from '@shared/types'

// Chinese labels + Tailwind class tokens for each ticket status.
// Full class strings are written out so Tailwind's content scanner keeps them.
export const STATUS_META: Record<TicketStatus, { label: string; dot: string; chip: string }> = {
  '待商家处理': { label: '待商家处理', dot: 'bg-warn', chip: 'bg-warn-soft text-warn' },
  '待商家收货': { label: '待商家收货', dot: 'bg-warn', chip: 'bg-warn-soft text-warn' },
  '待消费者发货': { label: '待消费者发货', dot: 'bg-info', chip: 'bg-info-soft text-info' },
  '平台处理中': { label: '平台处理中', dot: 'bg-info', chip: 'bg-info-soft text-info' },
  '退款成功': { label: '退款成功', dot: 'bg-ok', chip: 'bg-ok-soft text-ok' },
  '换货/补寄成功': { label: '换货/补寄成功', dot: 'bg-ok', chip: 'bg-ok-soft text-ok' },
  '维修成功': { label: '维修成功', dot: 'bg-ok', chip: 'bg-ok-soft text-ok' },
  '退款关闭': { label: '退款关闭', dot: 'bg-muted', chip: 'bg-paper-2 text-muted' },
  '换货/补寄关闭': { label: '换货/补寄关闭', dot: 'bg-muted', chip: 'bg-paper-2 text-muted' },
  '维修关闭': { label: '维修关闭', dot: 'bg-muted', chip: 'bg-paper-2 text-muted' }
}

export const STATUS_ORDER: TicketStatus[] = [
  '待商家处理', '待商家收货', '待消费者发货', '平台处理中',
  '退款成功', '换货/补寄成功', '维修成功', '退款关闭', '换货/补寄关闭', '维修关闭'
]
