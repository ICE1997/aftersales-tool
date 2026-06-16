import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Ticket } from '../../src/shared/types'
import { TicketTable } from '../../src/renderer/components/TicketTable'

afterEach(() => cleanup())

const EMPTY_CUSTOMER = {
  nickname: '', recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: ''
}

function mk(n: number): Ticket[] {
  return Array.from({ length: n }, (_, i) => ({
    aftersaleNo: `AS-${i + 1}`, orderNo: `O${i + 1}`, shippingNo: '', returnNo: '',
    status: 'pending' as const, note: '', createdAt: i, updatedAt: i,
    ...EMPTY_CUSTOMER
  }))
}

describe('TicketTable', () => {
  it('shows the first page (default 20 rows) and the total count', () => {
    render(<TicketTable tickets={mk(25)} query="" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('共 25 条')).toBeTruthy()
    expect(screen.getAllByRole('row').length).toBe(1 + 20) // header + 20 body rows
  })

  it('goes to the next page', () => {
    render(<TicketTable tickets={mk(25)} query="" onOpen={() => {}} onNew={() => {}} />)
    fireEvent.click(screen.getByText('下一页'))
    expect(screen.getAllByRole('row').length).toBe(1 + 5)
    expect(screen.getByText('AS-21')).toBeTruthy()
  })

  it('calls onOpen with the row aftersaleNo when a row is clicked', () => {
    const onOpen = vi.fn()
    render(<TicketTable tickets={mk(3)} query="" onOpen={onOpen} onNew={() => {}} />)
    fireEvent.click(screen.getByText('AS-2'))
    expect(onOpen).toHaveBeenCalledWith('AS-2')
  })

  it('hides the pager when everything fits on one page', () => {
    render(<TicketTable tickets={mk(5)} query="" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.queryByText('下一页')).toBeNull()
    expect(screen.getByText('共 5 条')).toBeTruthy()
  })

  it('shows the empty state when there are no tickets', () => {
    render(<TicketTable tickets={[]} query="" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('暂无售后单')).toBeTruthy()
  })

  it('resets to page 1 when the query changes', () => {
    const { rerender } = render(<TicketTable tickets={mk(25)} query="" onOpen={() => {}} onNew={() => {}} />)
    fireEvent.click(screen.getByText('下一页'))
    expect(screen.getByText('AS-21')).toBeTruthy()
    rerender(<TicketTable tickets={mk(25)} query="x" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('AS-1')).toBeTruthy()
    expect(screen.queryByText('AS-21')).toBeNull()
  })
})
