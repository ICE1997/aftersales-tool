import type { Database } from 'better-sqlite3'
import type { Ticket } from '../../shared/types'
import type { NewTicket } from '../../shared/types'

export type { NewTicket }

type Now = () => number

const ROW = `aftersale_no AS aftersaleNo, order_no AS orderNo, shipping_no AS shippingNo,
  return_no AS returnNo, status, note, created_at AS createdAt, updated_at AS updatedAt`

interface FtsRow {
  rowid: number
  aftersale_no: string
  order_no: string
  shipping_no: string
  return_no: string
  note: string
}

export class TicketRepo {
  constructor(private db: Database, private now: Now = () => Date.now()) {}

  create(t: NewTicket): void {
    const ts = this.now()
    const tx = this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO tickets (aftersale_no, order_no, shipping_no, return_no, status, note, created_at, updated_at)
         VALUES (@aftersaleNo, @orderNo, @shippingNo, @returnNo, 'pending', @note, @ts, @ts)`
      ).run({ ...t, ts })
      this.ftsInsert(t.aftersaleNo)
    })
    tx()
  }

  update(aftersaleNo: string, patch: Partial<Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo' | 'status' | 'note'>>): void {
    const cur = this.get(aftersaleNo)
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: this.now() }
    const tx = this.db.transaction(() => {
      // Delete old FTS entry before modifying the content table
      this.ftsDelete(aftersaleNo)
      this.db.prepare(
        `UPDATE tickets SET order_no=@orderNo, shipping_no=@shippingNo, return_no=@returnNo,
         status=@status, note=@note, updated_at=@updatedAt WHERE aftersale_no=@aftersaleNo`
      ).run(next as any)
      // Insert updated FTS entry
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
      `SELECT t.aftersale_no AS aftersaleNo, t.order_no AS orderNo, t.shipping_no AS shippingNo,
       t.return_no AS returnNo, t.status, t.note, t.created_at AS createdAt, t.updated_at AS updatedAt
       FROM tickets_fts f
       JOIN tickets t ON t.rowid = f.rowid
       WHERE tickets_fts MATCH ? ORDER BY t.updated_at DESC`
    ).all(match) as Ticket[]
  }

  private ftsInsert(aftersaleNo: string): void {
    this.db.prepare(
      `INSERT INTO tickets_fts (rowid, aftersale_no, order_no, shipping_no, return_no, note)
       SELECT rowid, aftersale_no, order_no, shipping_no, return_no, note FROM tickets WHERE aftersale_no = ?`
    ).run(aftersaleNo)
  }

  private ftsDelete(aftersaleNo: string): void {
    const row = this.db.prepare(
      'SELECT rowid, aftersale_no, order_no, shipping_no, return_no, note FROM tickets WHERE aftersale_no = ?'
    ).get(aftersaleNo) as FtsRow | undefined
    if (!row) return
    this.db.prepare(
      `INSERT INTO tickets_fts(tickets_fts, rowid, aftersale_no, order_no, shipping_no, return_no, note)
       VALUES('delete', ?, ?, ?, ?, ?, ?)`
    ).run(row.rowid, row.aftersale_no, row.order_no, row.shipping_no, row.return_no, row.note)
  }
}
