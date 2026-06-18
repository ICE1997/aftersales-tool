import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DatePresetChips } from '../../src/renderer/components/DatePresetChips'

afterEach(() => cleanup())

describe('DatePresetChips', () => {
  it('renders all five quick-range chips', () => {
    render(<DatePresetChips active={null} onSelect={() => {}} />)
    for (const label of ['今日', '昨日', '近7日', '近30日', '近90日']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['今日', '昨日', '近7日', '近30日', '近90日'])
  })

  it('marks the active chip with aria-pressed', () => {
    render(<DatePresetChips active="last7" onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: '近7日' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '今日' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onSelect with the chip key when clicked', () => {
    const onSelect = vi.fn()
    render(<DatePresetChips active={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: '近30日' }))
    expect(onSelect).toHaveBeenCalledWith('last30')
  })
})
