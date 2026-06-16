import type { Database } from 'better-sqlite3'
import type { Ticket, NewTicket, CustomerFields } from '../../shared/types'

export type { NewTicket }

type Now = () => number

const ROW = `aftersale_no AS aftersaleNo, order_no AS orderNo, shipping_no AS shippingNo,
  return_no AS returnNo, status, note, created_at AS createdAt, updated_at AS updatedAt,
  recipient_name AS recipientName, phone,
  province_code AS provinceCode, province, city_code AS cityCode, city,
  district_code AS districtCode, district, address_detail AS addressDetail, extension`

// Table-qualified version for JOIN queries to avoid ambiguous column names
const TROW = `tickets.aftersale_no AS aftersaleNo, tickets.order_no AS orderNo, tickets.shipping_no AS shippingNo,
  tickets.return_no AS returnNo, tickets.status, tickets.note, tickets.created_at AS createdAt, tickets.updated_at AS updatedAt,
  tickets.recipient_name AS recipientName, tickets.phone,
  tickets.province_code AS provinceCode, tickets.province, tickets.city_code AS cityCode, tickets.city,
  tickets.district_code AS districtCode, tickets.district, tickets.address_detail AS addressDetail, tickets.extension`

const EMPTY_CUSTOMER: CustomerFields = {
  recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: ''
}

interface FtsRow {
  rowid: number
  aftersale_no: string; order_no: string; shipping_no: string; return_no: string; note: string
  recipient_name: string; phone: string
  province: string; city: string; district: string; address_detail: string
}

const FTS_COLS = 'aftersale_no, order_no, shipping_no, return_no, note, recipient_name, phone, province, city, district, address_detail'

export class TicketRepo {
  constructor(private db: Database, private now: Now = () => Date.now()) {}

  create(t: NewTicket): void {
    const ts = this.now()
    const row = { ...EMPTY_CUSTOMER, ...t, ts }
    const tx = this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO tickets (aftersale_no, order_no, shipping_no, return_no, status, note, created_at, updated_at,
           recipient_name, phone, province_code, province, city_code, city, district_code, district, address_detail, extension)
         VALUES (@aftersaleNo, @orderNo, @shippingNo, @returnNo, 'pending', @note, @ts, @ts,
           @recipientName, @phone, @provinceCode, @province, @cityCode, @city, @districtCode, @district, @addressDetail, @extension)`
      ).run(row)
      this.ftsInsert(t.aftersaleNo)
    })
    tx()
  }

  update(
    aftersaleNo: string,
    patch: Partial<Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo' | 'status' | 'note'> & CustomerFields>
  ): void {
    const cur = this.get(aftersaleNo)
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: this.now() }
    const tx = this.db.transaction(() => {
      this.ftsDelete(aftersaleNo)
      this.db.prepare(
        `UPDATE tickets SET order_no=@orderNo, shipping_no=@shippingNo, return_no=@returnNo,
         status=@status, note=@note, updated_at=@updatedAt,
         recipient_name=@recipientName, phone=@phone,
         province_code=@provinceCode, province=@province, city_code=@cityCode, city=@city,
         district_code=@districtCode, district=@district, address_detail=@addressDetail, extension=@extension
         WHERE aftersale_no=@aftersaleNo`
      ).run(next as any)
      this.ftsInsert(aftersaleNo)
    })
    tx()
  }

  delete(aftersaleNo: string): void {
    const tx = this.db.transaction(() => {
      this.ftsDelete(aftersaleNo)
      this.db.prepare('DELETE FROM tickets WHERE aftersale_no = ?').run(aftersaleNo)
    })
    tx()
  }

  get(aftersaleNo: string): Ticket | undefined {
    return this.db.prepare(`SELECT ${ROW} FROM tickets WHERE aftersale_no = ?`).get(aftersaleNo) as Ticket | undefined
  }

  list(): Ticket[] {
    return this.db.prepare(`SELECT ${ROW} FROM tickets ORDER BY updated_at DESC`).all() as Ticket[]
  }

  search(query: string): Ticket[] {
    const q = query.trim()
    if (!q) return this.list()
    const match = `"${q.replace(/"/g, '""')}"*`
    return this.db.prepare(
      `SELECT ${TROW} FROM tickets_fts f
       JOIN tickets ON tickets.rowid = f.rowid
       WHERE tickets_fts MATCH ? ORDER BY tickets.updated_at DESC`
    ).all(match) as Ticket[]
  }

  private ftsInsert(aftersaleNo: string): void {
    this.db.prepare(
      `INSERT INTO tickets_fts (rowid, ${FTS_COLS})
       SELECT rowid, ${FTS_COLS} FROM tickets WHERE aftersale_no = ?`
    ).run(aftersaleNo)
  }

  private ftsDelete(aftersaleNo: string): void {
    const row = this.db.prepare(
      `SELECT rowid, ${FTS_COLS} FROM tickets WHERE aftersale_no = ?`
    ).get(aftersaleNo) as FtsRow | undefined
    if (!row) return
    this.db.prepare(
      `INSERT INTO tickets_fts(tickets_fts, rowid, ${FTS_COLS})
       VALUES('delete', @rowid, @aftersale_no, @order_no, @shipping_no, @return_no, @note,
         @recipient_name, @phone, @province, @city, @district, @address_detail)`
    ).run(row)
  }
}
