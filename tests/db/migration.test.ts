import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../../src/main/db/database'

function legacyDb() {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE tickets (
      aftersale_no TEXT PRIMARY KEY, order_no TEXT NOT NULL DEFAULT '',
      shipping_no TEXT NOT NULL DEFAULT '', return_no TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      customer_id INTEGER
    );
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '', province_code TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '', city_code TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '', district_code TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '', address_detail TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_tickets_customer ON tickets(customer_id);
    INSERT INTO customers (id, nickname, name, province_code, province, city_code, city, district_code, district, address_detail, created_at, updated_at)
      VALUES (1, '小明', '张三', '44', '广东省', '4403', '深圳市', '440305', '南山区', '科技园1号', 1, 1);
    INSERT INTO tickets (aftersale_no, created_at, updated_at, customer_id) VALUES ('AS-1', 1, 1, 1);
    INSERT INTO tickets (aftersale_no, created_at, updated_at, customer_id) VALUES ('AS-2', 1, 1, NULL);
  `)
  return db
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name)
}
function columns(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
}

describe('migrate (legacy customers → embedded ticket fields)', () => {
  it('backfills linked customer info onto tickets', () => {
    const db = legacyDb()
    migrate(db)
    const t = db.prepare(`SELECT nickname, recipient_name AS recipientName, phone, province, district_code AS districtCode, address_detail AS addressDetail FROM tickets WHERE aftersale_no='AS-1'`).get() as any
    expect(t.nickname).toBe('小明')
    expect(t.recipientName).toBe('张三')
    expect(t.phone).toBe('')
    expect(t.province).toBe('广东省')
    expect(t.districtCode).toBe('440305')
    expect(t.addressDetail).toBe('科技园1号')
  })

  it('drops the customers table and customer_id column', () => {
    const db = legacyDb()
    migrate(db)
    expect(tableExists(db, 'customers')).toBe(false)
    expect(columns(db, 'tickets')).not.toContain('customer_id')
  })

  it('is idempotent (safe to run twice)', () => {
    const db = legacyDb()
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    expect(tableExists(db, 'customers')).toBe(false)
  })

  it('leaves a fresh db (no customers table) untouched', () => {
    const db = new Database(':memory:')
    expect(() => migrate(db)).not.toThrow()
    expect(tableExists(db, 'customers')).toBe(false)
    expect(columns(db, 'tickets')).toContain('nickname')
  })
})
