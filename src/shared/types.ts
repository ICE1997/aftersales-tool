export type MaterialKind = 'image' | 'video'
export type TicketStatus = 'pending' | 'processing' | 'resolved'

export interface Ticket {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  status: TicketStatus
  note: string
  createdAt: number
  updatedAt: number
}

export interface Material {
  id: number
  aftersaleNo: string
  relPath: string
  kind: MaterialKind
  capturedAt: number | null
  importedAt: number
  sizeBytes: number
  thumbPath: string | null
}

export interface ImportResult {
  imported: Material[]
  skipped: { file: string; reason: string }[]
}
