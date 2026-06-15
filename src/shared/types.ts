export type MaterialKind = 'image' | 'video'
export type TicketStatus = 'pending' | 'processing' | 'resolved'

export interface NewTicket {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  note: string
}

export interface Ticket {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  status: TicketStatus
  note: string
  createdAt: number
  updatedAt: number
  customerId: number | null
}

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
}

export interface ImportResult {
  imported: Material[]
  skipped: { file: string; reason: string }[]
}

export interface PickedFile {
  path: string
  name: string
}

export type CreateMaterialPayload =
  | { source: 'file'; path: string; name: string }
  | { source: 'paste'; fileName: string; name: string; bytes: Uint8Array }

export interface Customer {
  id: number
  nickname: string
  name: string
  provinceCode: string
  province: string
  cityCode: string
  city: string
  districtCode: string
  district: string
  addressDetail: string
  createdAt: number
  updatedAt: number
}
export type NewCustomer = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>
export interface CustomerRow extends Customer { ticketCount: number }
