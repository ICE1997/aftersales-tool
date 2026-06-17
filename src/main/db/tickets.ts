import type { Knex } from 'knex'
import type { Ticket, NewTicket, CustomerFields, AftersaleFields } from '../../shared/types'

export type { NewTicket }

type Now = () => number
type Exec = Knex | Knex.Transaction

const TICKET_COLS = {
  aftersaleNo: 'aftersale_no', orderNo: 'order_no', shippingNo: 'shipping_no', returnNo: 'return_no',
  status: 'status', note: 'note', createdAt: 'created_at', updatedAt: 'updated_at',
  recipientName: 'recipient_name', phone: 'phone',
  provinceCode: 'province_code', province: 'province', cityCode: 'city_code', city: 'city',
  districtCode: 'district_code', district: 'district', addressDetail: 'address_detail', extension: 'extension',
  aftersaleType: 'aftersale_type', aftersaleReason: 'aftersale_reason', shippingStatus: 'shipping_status',
  amount: 'amount', refundAmount: 'refund_amount', appliedAt: 'applied_at', returnLogistics: 'return_logistics'
} as const

/** Knex select map (alias -> column), optionally table-qualified. */
function selectMap(prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [alias, col] of Object.entries(TICKET_COLS)) out[alias] = prefix ? `${prefix}.${col}` : col
  return out
}

/** camelCase object -> snake_case row. */
function toRow(obj: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [alias, col] of Object.entries(TICKET_COLS)) row[col] = obj[alias]
  return row
}

const EMPTY_CUSTOMER: CustomerFields = {
  recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: ''
}
const EMPTY_AFTERSALE: AftersaleFields = {
  aftersaleType: '', aftersaleReason: '', shippingStatus: '',
  amount: null, refundAmount: null, appliedAt: null, returnLogistics: ''
}

const FTS_COLS = 'aftersale_no, order_no, shipping_no, return_no, note, recipient_name, phone, province, city, district, address_detail, extension, aftersale_type, aftersale_reason, shipping_status, return_logistics'

interface FtsRow {
  rowid: number
  aftersale_no: string; order_no: string; shipping_no: string; return_no: string; note: string
  recipient_name: string; phone: string
  province: string; city: string; district: string; address_detail: string
  extension: string; aftersale_type: string; aftersale_reason: string; shipping_status: string; return_logistics: string
}

export class TicketRepo {
  constructor(private db: Knex, private now: Now = () => Date.now()) {}

  async create(t: NewTicket): Promise<void> {
    await this.db.transaction(async (trx) => { await this.insertOne(trx, t) })
  }

  private async insertOne(x: Exec, t: NewTicket): Promise<void> {
    const ts = this.now()
    const full = { ...EMPTY_CUSTOMER, ...EMPTY_AFTERSALE, ...t, status: t.status || '待商家处理', createdAt: ts, updatedAt: ts }
    await x('tickets').insert(toRow(full))
    await this.ftsInsert(x, t.aftersaleNo)
  }

  async update(
    aftersaleNo: string,
    patch: Partial<Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo' | 'status' | 'note'> & CustomerFields & AftersaleFields>
  ): Promise<void> {
    const cur = await this.get(aftersaleNo)
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: this.now() }
    await this.db.transaction(async (trx) => {
      await this.ftsDelete(trx, aftersaleNo)
      const row = toRow(next)
      delete row.aftersale_no
      delete row.created_at
      await trx('tickets').where('aftersale_no', aftersaleNo).update(row)
      await this.ftsInsert(trx, aftersaleNo)
    })
  }

  async existingNos(nos: string[]): Promise<Set<string>> {
    const found = new Set<string>()
    const CHUNK = 500
    for (let i = 0; i < nos.length; i += CHUNK) {
      const slice = nos.slice(i, i + CHUNK)
      if (slice.length === 0) continue
      const rows: string[] = await this.db('tickets').whereIn('aftersale_no', slice).pluck('aftersale_no')
      for (const no of rows) found.add(no)
    }
    return found
  }

  async createMany(tickets: NewTicket[]): Promise<void> {
    await this.db.transaction(async (trx) => {
      for (const t of tickets) await this.insertOne(trx, t)
    })
  }

  async delete(aftersaleNo: string): Promise<void> {
    await this.db.transaction(async (trx) => {
      await this.ftsDelete(trx, aftersaleNo)
      await trx('tickets').where('aftersale_no', aftersaleNo).del()
    })
  }

  async get(aftersaleNo: string): Promise<Ticket | undefined> {
    return (await this.db('tickets').select(selectMap()).where('aftersale_no', aftersaleNo).first()) as Ticket | undefined
  }

  async list(): Promise<Ticket[]> {
    return (await this.db('tickets').select(selectMap()).orderBy('updated_at', 'desc')) as Ticket[]
  }

  async search(query: string): Promise<Ticket[]> {
    const q = query.trim()
    if (!q) return this.list()
    const match = `"${q.replace(/"/g, '""')}"*`
    return (await this.db
      .select(selectMap('tickets'))
      .from('tickets_fts as f')
      .join('tickets', 'tickets.rowid', 'f.rowid')
      .whereRaw('tickets_fts MATCH ?', [match])
      .orderBy('tickets.updated_at', 'desc')) as Ticket[]
  }

  private async ftsInsert(x: Exec, aftersaleNo: string): Promise<void> {
    await x.raw(
      `INSERT INTO tickets_fts (rowid, ${FTS_COLS}) SELECT rowid, ${FTS_COLS} FROM tickets WHERE aftersale_no = ?`,
      [aftersaleNo]
    )
  }

  private async ftsDelete(x: Exec, aftersaleNo: string): Promise<void> {
    const row = (await x('tickets')
      .select('rowid', 'aftersale_no', 'order_no', 'shipping_no', 'return_no', 'note',
        'recipient_name', 'phone', 'province', 'city', 'district', 'address_detail',
        'extension', 'aftersale_type', 'aftersale_reason', 'shipping_status', 'return_logistics')
      .where('aftersale_no', aftersaleNo)
      .first()) as FtsRow | undefined
    if (!row) return
    await x.raw(
      `INSERT INTO tickets_fts(tickets_fts, rowid, ${FTS_COLS})
       VALUES('delete', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.rowid, row.aftersale_no, row.order_no, row.shipping_no, row.return_no, row.note,
        row.recipient_name, row.phone, row.province, row.city, row.district, row.address_detail,
        row.extension, row.aftersale_type, row.aftersale_reason, row.shipping_status, row.return_logistics]
    )
  }
}
