import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { CustomerRow } from '../../src/shared/types'
import { CustomerTable } from '../../src/renderer/components/CustomerTable'

afterEach(() => cleanup())

function mk(n: number): CustomerRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1, nickname: 'nick' + (i + 1), name: '客户' + (i + 1),
    provinceCode: '44', province: '广东省', cityCode: '4403', city: '深圳市',
    districtCode: '440305', district: '南山区', addressDetail: '', ticketCount: i,
    createdAt: i, updatedAt: i
  }))
}

describe('CustomerTable', () => {
  it('renders rows with region label and total', () => {
    render(<CustomerTable customers={mk(3)} query="" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('共 3 条')).toBeTruthy()
    expect(screen.getAllByText('广东省 · 深圳市 · 南山区').length).toBe(3)
  })
  it('calls onOpen with the customer id on row click', () => {
    const onOpen = vi.fn()
    render(<CustomerTable customers={mk(3)} query="" onOpen={onOpen} onNew={() => {}} />)
    fireEvent.click(screen.getByText('客户2'))
    expect(onOpen).toHaveBeenCalledWith(2)
  })
  it('shows empty state', () => {
    render(<CustomerTable customers={[]} query="" onOpen={() => {}} onNew={() => {}} />)
    expect(screen.getByText('暂无客户')).toBeTruthy()
  })
})
