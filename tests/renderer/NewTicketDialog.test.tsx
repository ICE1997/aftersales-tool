import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NewTicketDialog } from '../../src/renderer/components/NewTicketDialog'

describe('NewTicketDialog', () => {
  it('calls onCreate with entered values and requires aftersaleNo', () => {
    const onCreate = vi.fn()
    render(<NewTicketDialog open={true} onCreate={onCreate} onCancel={() => {}} />)
    const createBtn = screen.getByText('创建') as HTMLButtonElement
    expect(createBtn.disabled).toBe(true)                       // disabled with empty required field
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-1' } })
    expect(createBtn.disabled).toBe(false)
    fireEvent.click(createBtn)
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ aftersaleNo: 'AS-1', orderNo: '', shippingNo: '', returnNo: '', note: '' }))
  })

  it('renders nothing when closed', () => {
    const { container } = render(<NewTicketDialog open={false} onCreate={() => {}} onCancel={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('includes customer fields in the created ticket', () => {
    const onCreate = vi.fn()
    const { container } = render(<NewTicketDialog open onCreate={onCreate} onCancel={() => {}} />)
    const within = (sel: string) => container.querySelector(sel) as HTMLElement
    fireEvent.change(within('input[placeholder="必填"]'), { target: { value: 'AS-9' } })
    fireEvent.change(within('input[placeholder="买家昵称"]'), { target: { value: '小明' } })
    fireEvent.click(screen.getAllByText('创建').at(-1)!)
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ aftersaleNo: 'AS-9', nickname: '小明' }))
  })
})
