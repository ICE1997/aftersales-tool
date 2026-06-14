import { describe, it, expect, beforeEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { createDatabase } from '../../src/main/db/database'
import { TicketRepo } from '../../src/main/db/tickets'

let db: Database
let repo: TicketRepo

beforeEach(() => {
  db = createDatabase(':memory:')
  repo = new TicketRepo(db, () => 1000)
})

describe('TicketRepo', () => {
  it('creates and reads a ticket', () => {
    repo.create({ aftersaleNo: 'AS-1', orderNo: 'O-9', shippingNo: '', returnNo: '', note: '' })
    const t = repo.get('AS-1')
    expect(t?.orderNo).toBe('O-9')
    expect(t?.status).toBe('pending')
    expect(t?.createdAt).toBe(1000)
  })

  it('updates fields and bumps updatedAt', () => {
    repo.create({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.update('AS-1', { status: 'resolved', note: 'done' })
    const t = repo.get('AS-1')
    expect(t?.status).toBe('resolved')
    expect(t?.note).toBe('done')
  })

  it('searches by any of the four numbers via FTS', () => {
    repo.create({ aftersaleNo: 'AS-100', orderNo: 'ORD-555', shippingNo: 'SHIP-777', returnNo: 'RET-888', note: '破损' })
    expect(repo.search('555').map(t => t.aftersaleNo)).toContain('AS-100')
    expect(repo.search('777').map(t => t.aftersaleNo)).toContain('AS-100')
    expect(repo.search('888').map(t => t.aftersaleNo)).toContain('AS-100')
    expect(repo.search('AS-100').map(t => t.aftersaleNo)).toContain('AS-100')
  })

  it('list returns all tickets newest first', () => {
    repo.create({ aftersaleNo: 'A', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.create({ aftersaleNo: 'B', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect(repo.list().length).toBe(2)
  })

  it('updating a number field removes old token and adds new one in FTS', () => {
    repo.create({ aftersaleNo: 'AS-1', orderNo: 'ORD-555', shippingNo: '', returnNo: '', note: '' })
    repo.update('AS-1', { orderNo: 'ORD-999' })
    expect(repo.search('555').map(t => t.aftersaleNo)).not.toContain('AS-1')
    expect(repo.search('999').map(t => t.aftersaleNo)).toContain('AS-1')
  })

  it('deletes a ticket and cascades to its materials and FTS', () => {
    repo.create({ aftersaleNo: 'DEL-1', orderNo: 'ORD-DEL', shippingNo: '', returnNo: '', note: '' })
    repo.delete('DEL-1')
    expect(repo.get('DEL-1')).toBeUndefined()
    expect(repo.search('ORD-DEL').length).toBe(0)   // FTS entry gone
    expect(repo.list().length).toBe(0)
  })
})
