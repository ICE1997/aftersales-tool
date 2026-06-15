import type { Database } from 'better-sqlite3'
import type { Customer, NewCustomer, CustomerRow, Ticket } from '../../shared/types'

type Now = () => number

const ROW = `id, nickname, name,
  province_code AS provinceCode, province, city_code AS cityCode, city,
  district_code AS districtCode, district, address_detail AS addressDetail,
  created_at AS createdAt, updated_at AS updatedAt`

const TICKET_ROW = `aftersale_no AS aftersaleNo, order_no AS orderNo, shipping_no AS shippingNo,
  return_no AS returnNo, status, note, created_at AS createdAt, updated_at AS updatedAt, customer_id AS customerId`

export class CustomerRepo {
  constructor(private db: Database, private now: Now = () => Date.now()) {}

  create(c: NewCustomer): number {
    const ts = this.now()
    const info = this.db.prepare(
      `INSERT INTO customers (nickname, name, province_code, province, city_code, city, district_code, district, address_detail, created_at, updated_at)
       VALUES (@nickname, @name, @provinceCode, @province, @cityCode, @city, @districtCode, @district, @addressDetail, @ts, @ts)`
    ).run({ ...c, ts })
    return Number(info.lastInsertRowid)
  }

  update(id: number, patch: Partial<NewCustomer>): void {
    const cur = this.get(id)
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: this.now() }
    this.db.prepare(
      `UPDATE customers SET nickname=@nickname, name=@name, province_code=@provinceCode, province=@province,
       city_code=@cityCode, city=@city, district_code=@districtCode, district=@district,
       address_detail=@addressDetail, updated_at=@updatedAt WHERE id=@id`
    ).run({ ...next, id })
  }

  get(id: number): Customer | undefined {
    return this.db.prepare(`SELECT ${ROW} FROM customers WHERE id = ?`).get(id) as Customer | undefined
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM customers WHERE id = ?').run(id)
  }

  list(): CustomerRow[] {
    return this.db.prepare(
      `SELECT ${ROW}, (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = customers.id) AS ticketCount
       FROM customers ORDER BY updated_at DESC`
    ).all() as CustomerRow[]
  }

  search(query: string): CustomerRow[] {
    const q = query.trim()
    if (!q) return this.list()
    const like = `%${q}%`
    return this.db.prepare(
      `SELECT ${ROW}, (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = customers.id) AS ticketCount
       FROM customers
       WHERE nickname LIKE ? OR name LIKE ? OR province LIKE ? OR city LIKE ? OR district LIKE ? OR address_detail LIKE ?
       ORDER BY updated_at DESC`
    ).all(like, like, like, like, like, like) as CustomerRow[]
  }

  ticketsOf(id: number): Ticket[] {
    return this.db.prepare(`SELECT ${TICKET_ROW} FROM tickets WHERE customer_id = ? ORDER BY updated_at DESC`).all(id) as Ticket[]
  }
}
