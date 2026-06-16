import type { Database } from 'better-sqlite3'
import type { CustomerSummary, Ticket } from '../../shared/types'

const TICKET_ROW = `aftersale_no AS aftersaleNo, order_no AS orderNo, shipping_no AS shippingNo,
  return_no AS returnNo, status, note, created_at AS createdAt, updated_at AS updatedAt,
  nickname, recipient_name AS recipientName, phone,
  province_code AS provinceCode, province, city_code AS cityCode, city,
  district_code AS districtCode, district, address_detail AS addressDetail`

// Each nickname's representative is its most-recently-updated ticket (updated_at desc, then rowid desc),
// plus its复诉 count.
const SUMMARY_SQL = `
  WITH agg AS (
    SELECT nickname, COUNT(*) AS ticketCount, MAX(updated_at) AS lastUpdatedAt
    FROM tickets WHERE nickname != '' GROUP BY nickname
  ),
  rep AS (
    SELECT t.nickname, t.recipient_name AS recipientName, t.phone, t.province, t.city, t.district,
           ROW_NUMBER() OVER (PARTITION BY t.nickname ORDER BY t.updated_at DESC, t.rowid DESC) AS rn
    FROM tickets t WHERE t.nickname != ''
  )
  SELECT a.nickname, a.ticketCount, a.lastUpdatedAt,
         r.recipientName, r.phone, r.province, r.city, r.district
  FROM agg a JOIN rep r ON r.nickname = a.nickname AND r.rn = 1`

export class CustomerRepo {
  constructor(private db: Database) {}

  listByNickname(): CustomerSummary[] {
    return this.db.prepare(
      `${SUMMARY_SQL} ORDER BY a.ticketCount DESC, a.lastUpdatedAt DESC`
    ).all() as CustomerSummary[]
  }

  search(query: string): CustomerSummary[] {
    const q = query.trim()
    if (!q) return this.listByNickname()
    const like = `%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`
    return this.db.prepare(
      `${SUMMARY_SQL}
       WHERE a.nickname LIKE ? ESCAPE '\\' OR r.recipientName LIKE ? ESCAPE '\\' OR r.phone LIKE ? ESCAPE '\\'
       ORDER BY a.ticketCount DESC, a.lastUpdatedAt DESC`
    ).all(like, like, like) as CustomerSummary[]
  }

  ticketsOfNickname(nickname: string): Ticket[] {
    return this.db.prepare(
      `SELECT ${TICKET_ROW} FROM tickets WHERE nickname = ? ORDER BY updated_at DESC`
    ).all(nickname) as Ticket[]
  }
}
