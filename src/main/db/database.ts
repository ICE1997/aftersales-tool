import Knex from 'knex'
import type { Knex as KnexType } from 'knex'
import { dirname, join } from 'node:path'
import { runMigrations } from './migrations'

export async function createDatabase(path: string): Promise<KnexType> {
  await runMigrations(path, join(dirname(path), 'backups'))
  return Knex({
    client: 'better-sqlite3',
    connection: { filename: path },
    useNullAsDefault: true,
    pool: {
      min: 1,
      max: 1,
      afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
        conn.pragma('journal_mode = WAL')
        conn.pragma('foreign_keys = ON')
        done(null, conn)
      }
    }
  })
}
