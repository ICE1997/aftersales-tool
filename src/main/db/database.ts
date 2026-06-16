import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'

export function createDatabase(path: string): DB {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

const TICKET_CUSTOMER_COLS: [string, string][] = [
  ['recipient_name', "recipient_name TEXT NOT NULL DEFAULT ''"],
  ['phone', "phone TEXT NOT NULL DEFAULT ''"],
  ['province_code', "province_code TEXT NOT NULL DEFAULT ''"],
  ['province', "province TEXT NOT NULL DEFAULT ''"],
  ['city_code', "city_code TEXT NOT NULL DEFAULT ''"],
  ['city', "city TEXT NOT NULL DEFAULT ''"],
  ['district_code', "district_code TEXT NOT NULL DEFAULT ''"],
  ['district', "district TEXT NOT NULL DEFAULT ''"],
  ['address_detail', "address_detail TEXT NOT NULL DEFAULT ''"],
  ['extension', "extension TEXT NOT NULL DEFAULT ''"]
]

export function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      aftersale_no TEXT PRIMARY KEY,
      order_no     TEXT NOT NULL DEFAULT '',
      shipping_no  TEXT NOT NULL DEFAULT '',
      return_no    TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'pending',
      note         TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materials (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      aftersale_no TEXT NOT NULL REFERENCES tickets(aftersale_no) ON DELETE CASCADE,
      rel_path     TEXT NOT NULL UNIQUE,
      kind         TEXT NOT NULL,
      name         TEXT NOT NULL DEFAULT '',
      captured_at  INTEGER,
      imported_at  INTEGER NOT NULL,
      size_bytes   INTEGER NOT NULL,
      thumb_path   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_materials_ticket ON materials(aftersale_no);

    CREATE TABLE IF NOT EXISTS material_folders (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      aftersale_no TEXT NOT NULL REFERENCES tickets(aftersale_no) ON DELETE CASCADE,
      path         TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      UNIQUE(aftersale_no, path)
    );
    CREATE INDEX IF NOT EXISTS idx_folders_ticket ON material_folders(aftersale_no);

    CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(
      aftersale_no, order_no, shipping_no, return_no, note,
      recipient_name, phone, province, city, district, address_detail,
      content='tickets', content_rowid='rowid'
    );

  `)
  ensureColumn(db, 'materials', 'name', "name TEXT NOT NULL DEFAULT ''")
  ensureColumn(db, 'materials', 'folder', "folder TEXT NOT NULL DEFAULT ''")
  for (const [col, ddl] of TICKET_CUSTOMER_COLS) ensureColumn(db, 'tickets', col, ddl)
  migrateLegacyCustomers(db)
  rebuildFtsIfStale(db)
}

const FTS_COLS_ARR = ['aftersale_no', 'order_no', 'shipping_no', 'return_no', 'note', 'recipient_name', 'phone', 'province', 'city', 'district', 'address_detail']

/** Rebuild tickets_fts when its column set doesn't exactly match the expected set. */
function rebuildFtsIfStale(db: DB): void {
  const cols = (db.prepare(`PRAGMA table_info(tickets_fts)`).all() as { name: string }[]).map((c) => c.name)
  const same = cols.length === FTS_COLS_ARR.length && FTS_COLS_ARR.every((c, i) => cols[i] === c)
  if (same) return
  const list = FTS_COLS_ARR.join(', ')
  db.transaction(() => {
    db.exec(`
      DROP TABLE IF EXISTS tickets_fts;
      CREATE VIRTUAL TABLE tickets_fts USING fts5(${list}, content='tickets', content_rowid='rowid');
      INSERT INTO tickets_fts(rowid, ${list}) SELECT rowid, ${list} FROM tickets;
    `)
  })()
}

function hasTable(db: DB, name: string): boolean {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name)
}
function hasColumn(db: DB, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return cols.some((c) => c.name === column)
}

/** One-time: copy linked customer info onto tickets, then drop the legacy structure. */
function migrateLegacyCustomers(db: DB): void {
  if (!hasTable(db, 'customers')) return
  const tx = db.transaction(() => {
    if (hasColumn(db, 'tickets', 'customer_id')) {
      const linked = db.prepare(
        `SELECT t.aftersale_no AS no, c.name, c.province_code, c.province,
                c.city_code, c.city, c.district_code, c.district, c.address_detail
         FROM tickets t JOIN customers c ON c.id = t.customer_id`
      ).all() as Record<string, string>[]
      const upd = db.prepare(
        `UPDATE tickets SET recipient_name=@name,
           province_code=@province_code, province=@province, city_code=@city_code, city=@city,
           district_code=@district_code, district=@district, address_detail=@address_detail
         WHERE aftersale_no=@no`
      )
      for (const r of linked) upd.run(r)
      db.exec('DROP INDEX IF EXISTS idx_tickets_customer')
      db.exec('ALTER TABLE tickets DROP COLUMN customer_id')
    }
    db.exec('DROP TABLE IF EXISTS tickets_fts')
    db.exec('DROP TABLE IF EXISTS customers')
  })
  tx()
}

export function ensureColumn(db: DB, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}
