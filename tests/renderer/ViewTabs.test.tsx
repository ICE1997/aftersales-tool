import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ViewTabs } from '../../src/renderer/components/ViewTabs'

afterEach(() => cleanup())

const TABS = [
  { key: 'list', label: '售后单', count: 153 },
  { key: 'chart', label: '申请时间分布' },
]

describe('ViewTabs', () => {
  it('renders every tab label, and a count badge only where given', () => {
    render(<ViewTabs tabs={TABS} active="list" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: /售后单/ })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '申请时间分布' })).toBeTruthy()
    expect(screen.getByText('153')).toBeTruthy()
  })

  it('marks the active tab with aria-selected', () => {
    render(<ViewTabs tabs={TABS} active="chart" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: '申请时间分布' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /售后单/ }).getAttribute('aria-selected')).toBe('false')
  })

  it('calls onChange with the tab key when a tab is clicked', () => {
    const onChange = vi.fn()
    render(<ViewTabs tabs={TABS} active="list" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: '申请时间分布' }))
    expect(onChange).toHaveBeenCalledWith('chart')
  })

  it('renders the right-side slot content', () => {
    render(<ViewTabs tabs={TABS} active="list" onChange={() => {}} right={<button>新建售后单</button>} />)
    expect(screen.getByRole('button', { name: '新建售后单' })).toBeTruthy()
  })
})
