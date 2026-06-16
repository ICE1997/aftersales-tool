export type MaterialKind = 'image' | 'video'
export type TicketStatus = 'pending' | 'processing' | 'resolved'

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
} & Partial<CustomerFields>

export type Ticket = {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  status: TicketStatus
  note: string
  createdAt: number
  updatedAt: number
} & CustomerFields

export interface Material {
  id: number
  aftersaleNo: string
  name: string
  relPath: string
  kind: MaterialKind
  capturedAt: number | null
  importedAt: number
  sizeBytes: number
  thumbPath: string | null
  folder: string
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
