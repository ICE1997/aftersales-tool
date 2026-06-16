import type { ImportTicketsResult } from '@shared/types'

interface Props { result: ImportTicketsResult | null; onClose: () => void }

export function ImportResultDialog({ result, onClose }: Props) {
  if (!result) return null
  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <h3 className="mb-4 font-display text-lg font-extrabold tracking-tight">导入完成</h3>
        <ul className="space-y-1.5 text-sm text-ink-soft">
          <li>新增 <span className="tnum font-semibold text-ink">{result.imported}</span> 条</li>
          <li>跳过(已存在) <span className="tnum font-semibold text-ink">{result.skippedExisting}</span> 条</li>
          <li>文件内重复 <span className="tnum font-semibold text-ink">{result.duplicatedInFile}</span> 条</li>
          <li>失败 <span className="tnum font-semibold text-ink">{result.failed.length}</span> 条</li>
        </ul>
        {result.failed.length > 0 && (
          <div className="mt-3 max-h-40 space-y-0.5 overflow-auto rounded-lg border border-line bg-paper-2 p-3 text-xs text-muted">
            {result.failed.map((f, i) => <div key={i}>第 {f.row} 行:{f.reason}</div>)}
          </div>
        )}
        <div className="mt-6 flex justify-end"><button className="btn-primary" onClick={onClose}>完成</button></div>
      </div>
    </div>
  )
}
