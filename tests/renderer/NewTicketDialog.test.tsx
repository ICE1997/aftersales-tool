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
    fireEvent.change(screen.getByLabelText('收货人姓名'), { target: { value: '张三' } })
    fireEvent.change(screen.getByLabelText('手机号'), { target: { value: '13800' } })
    fireEvent.change(screen.getByPlaceholderText('街道门牌等'), { target: { value: '科技园1号' } })
    // pick the first real province option from the dataset → exercises the RegionCascader → region spread
    const prov = (screen.getAllByRole('combobox') as HTMLSelectElement[])
      .find((s) => Array.from(s.options).some((o) => o.text === '省'))!
    const code = Array.from(prov.options).find((o) => o.value !== '')!.value
    fireEvent.change(prov, { target: { value: code } })
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      aftersaleNo: 'AS-9', recipientName: '张三', phone: '13800',
      addressDetail: '科技园1号', provinceCode: code
    }))
    const payload = onCreate.mock.calls.at(-1)![0] as Record<string, string>
    expect(payload.province.length).toBeGreaterThan(0)
  })

  it('recognizes pasted text and fills recipient fields', () => {
    const onCreate = vi.fn()
    render(<NewTicketDialog open onCreate={onCreate} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-R' } })
    fireEvent.change(screen.getByPlaceholderText('粘贴收货地址,自动识别姓名/电话/地址'), {
      target: { value: '程玲[2817]\n19592642954\n江苏省苏州市虎丘区 龙湖时代100 8栋2207[2817]' }
    })
    fireEvent.click(screen.getByText('识别'))
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      aftersaleNo: 'AS-R', recipientName: '程玲', phone: '19592642954',
      province: '江苏省', city: '苏州市', district: '虎丘区', addressDetail: '龙湖时代100 8栋2207'
    }))
  })

  it('submits status + aftersale fields', () => {
    const onCreate = vi.fn()
    render(<NewTicketDialog open onCreate={onCreate} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-NEW' } })
    fireEvent.change(screen.getByLabelText('售后状态'), { target: { value: '退款成功' } })
    fireEvent.change(screen.getByLabelText('售后类型'), { target: { value: '换货' } })
    fireEvent.change(screen.getByLabelText('售后原因'), { target: { value: '质量问题' } })
    fireEvent.change(screen.getByLabelText('发货状态'), { target: { value: '已发货' } })
    fireEvent.change(screen.getByLabelText('交易金额'), { target: { value: '24.99' } })
    fireEvent.change(screen.getByLabelText('退款金额'), { target: { value: '20.00' } })
    fireEvent.change(screen.getByLabelText('申请时间'), { target: { value: '2026-05-28 14:27:38' } })
    fireEvent.change(screen.getByLabelText('退货物流状态'), { target: { value: '签收' } })
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate).toHaveBeenCalledTimes(1)
    const arg = onCreate.mock.calls[0][0]
    expect(arg.aftersaleNo).toBe('AS-NEW')
    expect(arg.status).toBe('退款成功')
    expect(arg.aftersaleType).toBe('换货')
    expect(arg.aftersaleReason).toBe('质量问题')
    expect(arg.shippingStatus).toBe('已发货')
    expect(arg.amount).toBe('24.99')
    expect(arg.refundAmount).toBe('20.00')
    expect(arg.appliedAt).toBe('2026-05-28 14:27:38')
    expect(arg.returnLogistics).toBe('签收')
  })

  it('defaults status to 待商家处理', () => {
    const onCreate = vi.fn()
    render(<NewTicketDialog open onCreate={onCreate} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-D' } })
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate.mock.calls[0][0].status).toBe('待商家处理')
  })

  it('clears aftersale fields after submit (reset)', () => {
    const onCreate = vi.fn()
    render(<NewTicketDialog open onCreate={onCreate} onCancel={() => {}} />)
    // First submission
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-R1' } })
    fireEvent.change(screen.getByLabelText('售后状态'), { target: { value: '退款成功' } })
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate).toHaveBeenCalledTimes(1)
    // Second submission after reset
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-R2' } })
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate).toHaveBeenCalledTimes(2)
    const secondArg = onCreate.mock.calls[1][0]
    expect(secondArg.aftersaleNo).toBe('AS-R2')
    expect(secondArg.status).toBe('待商家处理')
  })
})
