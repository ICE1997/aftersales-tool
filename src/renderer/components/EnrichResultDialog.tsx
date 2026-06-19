import type { EnrichResult } from '@shared/types'

interface Props { result: EnrichResult | null; onClose: () => void }

export function EnrichResultDialog({ result, onClose }: Props) {
  if (!result) return null
  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <h3 className="mb-4 font-display text-lg font-extrabold tracking-tight">补充完成</h3>
        <ul className="space-y-1.5 text-sm text-ink-soft">
          <li>数据行 <span className="tnum font-semibold text-ink">{result.rows}</span> 条</li>
          <li>含地区 <span className="tnum font-semibold text-ink">{result.withRegion}</span> 条</li>
          <li>匹配售后单 <span className="tnum font-semibold text-ink">{result.matchedTickets}</span> 条</li>
          <li>已补充地区 <span className="tnum font-semibold text-ink">{result.updated}</span> 条</li>
          <li>跳过(已有地区) <span className="tnum font-semibold text-ink">{result.skippedHasRegion}</span> 条</li>
          <li>无匹配订单 <span className="tnum font-semibold text-ink">{result.noTicket}</span> 条</li>
          <li>地名无法解析 <span className="tnum font-semibold text-ink">{result.unresolved}</span> 条</li>
        </ul>
        <div className="mt-6 flex justify-end"><button className="btn-primary" onClick={onClose}>完成</button></div>
      </div>
    </div>
  )
}
