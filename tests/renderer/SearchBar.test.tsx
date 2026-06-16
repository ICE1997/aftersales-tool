import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from '../../src/renderer/components/SearchBar'

describe('SearchBar', () => {
  it('calls onSearch with typed text', () => {
    const onSearch = vi.fn()
    render(<SearchBar onSearch={onSearch} />)
    fireEvent.change(screen.getByPlaceholderText(/搜索/), { target: { value: 'ORD-9' } })
    expect(onSearch).toHaveBeenCalledWith('ORD-9')
  })
})
