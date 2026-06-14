import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'

export function createDatabase(path: string): DB {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrate(db)
  return db
}

function migrate(db: DB): void {
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
      captured_at  INTEGER,
      imported_at  INTEGER NOT NULL,
      size_bytes   INTEGER NOT NULL,
      thumb_path   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_materials_ticket ON materials(aftersale_no);

    CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(
      aftersale_no, order_no, shipping_no, return_no, note,
      content='tickets', content_rowid='rowid'
    );
  `)
}
