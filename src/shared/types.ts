export type MaterialKind = 'image' | 'video' | 'other'
export type TicketStatus =
  | '待商家处理' | '待商家收货' | '待消费者发货' | '平台处理中'
  | '退款成功' | '退款关闭' | '换货/补寄成功' | '换货/补寄关闭' | '维修成功' | '维修关闭'

export interface AftersaleFields {
  aftersaleType: string
  aftersaleReason: string
  shippingStatus: string
  amount: number | null
  refundAmount: number | null
  appliedAt: number | null
  returnLogistics: string
}

export interface CustomerFields {
  recipientName: string
  phone: string
  provinceCode: string
  province: string
  cityCode: string
  city: string
  districtCode: string
  district: string
  addressDetail: string
  extension: string
}

export type NewTicket = {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  note: string
  status?: TicketStatus
} & Partial<CustomerFields> & Partial<AftersaleFields>

export type Ticket = {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  status: TicketStatus
  note: string
  createdAt: number
  updatedAt: number
} & CustomerFields & AftersaleFields

export interface Material {
  relPath: string
  folder: string
  name: string
  kind: MaterialKind
  sizeBytes: number
  modifiedAt: number
}

export interface ImportResult {
  imported: Material[]
  skipped: { file: string; reason: string }[]
}

export interface PickedFile {
  path: string
  name: string
}

export type CreateMaterialPayload = (
  | { source: 'file'; path: string; name: string }
  | { source: 'paste'; fileName: string; name: string; bytes: Uint8Array }
) & { folder?: string }

export type RegionLevel = 'province' | 'city' | 'district'
export interface RegionCount { code: string; name: string; count: number }
export interface StatsSummary { total: number; classified: number; unclassified: number }

export interface ImportTicketsResult {
  imported: number
  updated: number
  skippedExisting: number
  duplicatedInFile: number
  failed: { row: number; reason: string }[]
}

export interface EnrichResult {
  rows: number
  withRegion: number
  matchedTickets: number
  updated: number
  skippedHasRegion: number
  noTicket: number
  unresolved: number
}
