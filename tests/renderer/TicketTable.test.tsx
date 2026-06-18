import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { Ticket } from '../../src/shared/types'
import { TicketTable } from '../../src/renderer/components/TicketTable'
import { parseDateTimeToMs } from '../../src/shared/aftersale-format'

afterEach(() => cleanup())

const EMPTY_CUSTOMER = {
  recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: ''
}

const EMPTY_AFTERSALE = {
  aftersaleType: '', aftersaleReason: '', shippingStatus: '',
  amount: null, refundAmount: null, appliedAt: null, returnLogistics: ''
}

function mk(over: Partial<Ticket> = {}): Ticket {
  return {
    aftersaleNo: 'AS-1', orderNo: 'O1', shippingNo: '', returnNo: '',
    status: '待商家处理' as const, note: '', createdAt: 0, updatedAt: 0,
    ...EMPTY_CUSTOMER,
    ...EMPTY_AFTERSALE,
    ...over,
  }
}

function mks(n: number): Ticket[] {
  return Array.from({ length: n }, (_, i) => mk({ aftersaleNo: `AS-${i + 1}`, orderNo: `O${i + 1}`, createdAt: i, updatedAt: i }))
}

describe('TicketTable', () => {
  it('shows the first page (default 20 rows) and the total count', () => {
    render(<TicketTable tickets={mks(25)} onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('共 25 条')).toBeTruthy()
    expect(screen.getAllByRole('row').length).toBe(1 + 20) // header + 20 body rows
  })

  it('goes to the next page', () => {
    render(<TicketTable tickets={mks(25)} onOpen={() => {}} onNew={() => {}} />)
    fireEvent.click(screen.getByText('下一页'))
    expect(screen.getAllByRole('row').length).toBe(1 + 5)
    expect(screen.getByText('AS-21')).toBeTruthy()
  })

  it('calls onOpen with the row aftersaleNo when a row is clicked', () => {
    const onOpen = vi.fn()
    render(<TicketTable tickets={mks(3)} onOpen={onOpen} onNew={() => {}} />)
    fireEvent.click(screen.getByText('AS-2'))
    expect(onOpen).toHaveBeenCalledWith('AS-2')
  })

  it('hides the pager when everything fits on one page', () => {
    render(<TicketTable tickets={mks(5)} onOpen={() => {}} onNew={() => {}} />)
    expect(screen.queryByText('下一页')).toBeNull()
    expect(screen.getByText('共 5 条')).toBeTruthy()
  })

  it('shows the empty state when there are no tickets', () => {
    render(<TicketTable tickets={[]} onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('暂无售后单')).toBeTruthy()
  })

  it('resets to page 1 when the tickets list changes', () => {
    const { rerender } = render(<TicketTable tickets={mks(25)} onOpen={() => {}} onNew={() => {}} />)
    fireEvent.click(screen.getByText('下一页'))
    expect(screen.getByText('AS-21')).toBeTruthy()
    rerender(<TicketTable tickets={mks(25)} onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('AS-1')).toBeTruthy()
    expect(screen.queryByText('AS-21')).toBeNull()
  })

  it('shows recipient name and region columns', () => {
    const onOpen = vi.fn()
    render(<TicketTable tickets={[mk({ aftersaleNo: 'AS-1', recipientName: '程玲', province: '江苏省', city: '苏州市', district: '虎丘区' })]} onOpen={onOpen} onNew={() => {}} />)
    expect(screen.getByText('程玲')).toBeTruthy()
    expect(screen.getByText('江苏省 · 苏州市 · 虎丘区')).toBeTruthy()
  })

  it('renders the new aftersale columns and the status chip', () => {
    render(<TicketTable
      tickets={[mk({ aftersaleType: '退款退货', returnLogistics: '签收', appliedAt: parseDateTimeToMs('2026-05-28 14:27:38'), status: '退款成功' })]}
      onOpen={() => {}} onNew={() => {}} onImport={() => {}} />)
    expect(screen.getByText('退款退货')).toBeTruthy()
    expect(screen.getByText('签收')).toBeTruthy()
    expect(screen.getByText('2026-05-28 14:27:38')).toBeTruthy()
    expect(screen.getByText('退款成功')).toBeTruthy()
  })

  it('calls onImport when the import button is clicked', () => {
    const onImport = vi.fn()
    render(<TicketTable tickets={mks(1)} onOpen={() => {}} onNew={() => {}} onImport={onImport} />)
    fireEvent.click(screen.getByText('导入售后单'))
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('sorts by 申请时间 when its header is clicked', () => {
    const tickets = [mk({ aftersaleNo: 'OLD', appliedAt: 100 }), mk({ aftersaleNo: 'NEW', appliedAt: 200 })]
    render(<TicketTable tickets={tickets} onOpen={() => {}} onNew={() => {}} />)
    let rows = screen.getAllByRole('row')
    expect(rows[1].textContent).toContain('NEW') // default desc → newest first
    fireEvent.click(screen.getByText(/申请时间/))
    rows = screen.getAllByRole('row')
    expect(rows[1].textContent).toContain('OLD') // now asc
  })
})
