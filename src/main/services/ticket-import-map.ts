import type { NewTicket } from '../../shared/types'

// Excel 表头中文名 → NewTicket 字段。未列出的列(商品ID/买家/备注等)一律忽略。
const HEADER_MAP: Record<string, keyof NewTicket> = {
  '售后编号': 'aftersaleNo',
  '订单编号': 'orderNo',
  '发货运单号': 'shippingNo',
  '退货运单号': 'returnNo',
  '售后状态': 'status',
  '退款类型': 'aftersaleType',
  '退款原因': 'aftersaleReason',
  '订单状态': 'shippingStatus',
  '交易金额': 'amount',
  '退款金额': 'refundAmount',
  '申请时间': 'appliedAt',
  '退货物流状态': 'returnLogistics'
}

export interface MapResult {
  tickets: NewTicket[]
  failed: { row: number; reason: string }[]
  duplicatedInFile: number
  missingRequiredHeader: boolean
}

const cell = (v: unknown): string => String(v ?? '').trim()

export function mapRows(matrix: string[][]): MapResult {
  const failed: { row: number; reason: string }[] = []
  const tickets: NewTicket[] = []
  const seen = new Set<string>()
  let duplicatedInFile = 0

  if (matrix.length === 0) return { tickets, failed, duplicatedInFile, missingRequiredHeader: true }

  const headers = matrix[0].map(cell)
  const colField = headers.map((h) => HEADER_MAP[h] as keyof NewTicket | undefined)
  if (!colField.includes('aftersaleNo')) {
    return { tickets, failed, duplicatedInFile, missingRequiredHeader: true }
  }

  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r] ?? []
    const rec: Partial<Record<keyof NewTicket, string>> = {}
    for (let c = 0; c < colField.length; c++) {
      const field = colField[c]
      if (field) rec[field] = cell(cells[c])
    }
    const no = rec.aftersaleNo ?? ''
    if (!no) { failed.push({ row: r + 1, reason: '缺少售后编号' }); continue }
    if (seen.has(no)) { duplicatedInFile++; continue }
    seen.add(no)
    tickets.push({
      aftersaleNo: no,
      orderNo: rec.orderNo ?? '',
      shippingNo: rec.shippingNo ?? '',
      returnNo: rec.returnNo ?? '',
      note: '',
      status: (rec.status || '待商家处理') as NewTicket['status'],
      aftersaleType: rec.aftersaleType ?? '',
      aftersaleReason: rec.aftersaleReason ?? '',
      shippingStatus: rec.shippingStatus ?? '',
      amount: rec.amount ?? '',
      refundAmount: rec.refundAmount ?? '',
      appliedAt: rec.appliedAt ?? '',
      returnLogistics: rec.returnLogistics ?? ''
    })
  }
  return { tickets, failed, duplicatedInFile, missingRequiredHeader: false }
}
