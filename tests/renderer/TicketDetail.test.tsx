import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { parseDateTimeToMs } from '../../src/shared/aftersale-format'

const ticket = {
  aftersaleNo: 'AS-1', orderNo: 'O1', shippingNo: 'S1', returnNo: 'R1',
  status: '退款成功', note: '', createdAt: 0, updatedAt: 0,
  recipientName: '', phone: '', provinceCode: '', province: '', cityCode: '', city: '',
  districtCode: '', district: '', addressDetail: '', extension: '',
  aftersaleType: '退款退货', aftersaleReason: '质量问题', shippingStatus: '已发货',
  amount: 2499, refundAmount: 2499, appliedAt: parseDateTimeToMs('2026-05-28 14:27:38'), returnLogistics: '签收'
}

vi.mock('../../src/renderer/api', () => ({
  api: {
    getTicket: vi.fn(async () => ticket),
    listMaterials: vi.fn(async () => ({ folders: [], materials: [] })),
    updateTicket: vi.fn(async () => {}),
    watchMaterials: vi.fn(async () => {}),
    unwatchMaterials: vi.fn(async () => {}),
    onMaterialsChanged: vi.fn(() => () => {}),
    transcodeMaterial: vi.fn(),
    cancelTranscode: vi.fn(),
    onTranscodeProgress: () => () => {},
  }
}))

afterEach(() => cleanup())

import { TicketDetail } from '../../src/renderer/components/TicketDetail'
import { api } from '../../src/renderer/api'

describe('TicketDetail aftersale fields', () => {
  it('shows the imported aftersale field values', async () => {
    render(<TicketDetail aftersaleNo="AS-1" onChanged={() => {}} onDeleted={() => {}} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('退款退货')).toBeTruthy())
    expect(screen.getByText('质量问题')).toBeTruthy()
    expect(screen.getByText('已发货')).toBeTruthy()
    expect(screen.getByText('签收')).toBeTruthy()
    expect(screen.getByText('2026-05-28 14:27:38')).toBeTruthy()
    expect(screen.getAllByText('24.99').length).toBeGreaterThanOrEqual(2)
  })

  it('does not crash when ticket has an off-enum status', async () => {
    ;(api.getTicket as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...ticket, status: '某未知状态' })
    render(<TicketDetail aftersaleNo="AS-1" onChanged={() => {}} onDeleted={() => {}} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('AS-1')).toBeTruthy())
  })
})
