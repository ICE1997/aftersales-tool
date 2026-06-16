import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { NewTicketDialog } from '../../src/renderer/components/NewTicketDialog'

afterEach(() => cleanup())

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

  it('includes all customer fields in the created ticket', () => {
    const onCreate = vi.fn()
    render(<NewTicketDialog open onCreate={onCreate} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-9' } })
    fireEvent.change(screen.getByPlaceholderText('买家昵称'), { target: { value: '小明' } })
    fireEvent.change(screen.getByLabelText('收货人姓名'), { target: { value: '张三' } })
    fireEvent.change(screen.getByLabelText('手机号'), { target: { value: '13800' } })
    fireEvent.change(screen.getByPlaceholderText('街道门牌等'), { target: { value: '科技园1号' } })
    // pick the first real province option from the dataset → exercises the RegionCascader → region spread
    const prov = screen.getAllByRole('combobox')[0] as HTMLSelectElement
    const code = Array.from(prov.options).find((o) => o.value !== '')!.value
    fireEvent.change(prov, { target: { value: code } })
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      aftersaleNo: 'AS-9', nickname: '小明', recipientName: '张三', phone: '13800',
      addressDetail: '科技园1号', provinceCode: code
    }))
    const payload = onCreate.mock.calls.at(-1)![0] as Record<string, string>
    expect(payload.province.length).toBeGreaterThan(0)
  })
})
