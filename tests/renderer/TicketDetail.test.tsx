import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

const ticket = {
  aftersaleNo: 'AS-1', orderNo: 'O1', shippingNo: 'S1', returnNo: 'R1',
  status: '退款成功', note: '', createdAt: 0, updatedAt: 0,
  recipientName: '', phone: '', provinceCode: '', province: '', cityCode: '', city: '',
  districtCode: '', district: '', addressDetail: '', extension: '',
  aftersaleType: '退款退货', aftersaleReason: '质量问题', shippingStatus: '已发货',
  amount: '24.99', refundAmount: '24.99', appliedAt: '2026-05-28 14:27:38', returnLogistics: '签收'
}

vi.mock('../../src/renderer/api', () => ({
  api: {
    getTicket: vi.fn(async () => ticket),
    listMaterials: vi.fn(async () => []),
    updateTicket: vi.fn(async () => {}),
  }
}))

afterEach(() => cleanup())

import { TicketDetail } from '../../src/renderer/components/TicketDetail'

describe('TicketDetail aftersale fields', () => {
  it('shows the imported aftersale field values', async () => {
    render(<TicketDetail aftersaleNo="AS-1" onChanged={() => {}} onDeleted={() => {}} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('退款退货')).toBeTruthy())
    expect(screen.getByText('质量问题')).toBeTruthy()
    expect(screen.getByText('已发货')).toBeTruthy()
    expect(screen.getByText('签收')).toBeTruthy()
    expect(screen.getByText('2026-05-28 14:27:38')).toBeTruthy()
  })
})
