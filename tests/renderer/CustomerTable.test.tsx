import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CustomerTable } from '../../src/renderer/components/CustomerTable'
import type { CustomerSummary } from '../../src/shared/types'

afterEach(() => cleanup())

const rows: CustomerSummary[] = [
  { nickname: '小明', ticketCount: 3, recipientName: '张三', phone: '138', province: '广东省', city: '深圳市', district: '南山区', lastUpdatedAt: 1000 }
]

describe('CustomerTable', () => {
  it('renders nickname, recipient, phone, region and count; row click reports nickname', () => {
    const onOpen = vi.fn()
    render(<CustomerTable customers={rows} query="" onOpen={onOpen} />)
    expect(screen.getByText('小明')).toBeTruthy()
    expect(screen.getByText('张三')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    fireEvent.click(screen.getByText('小明'))
    expect(onOpen).toHaveBeenCalledWith('小明')
  })

  it('shows the empty state when there are no customers', () => {
    render(<CustomerTable customers={[]} query="" onOpen={() => {}} />)
    expect(screen.getByText(/暂无客户/)).toBeTruthy()
  })
})
