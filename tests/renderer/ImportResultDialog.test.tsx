import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ImportResultDialog } from '../../src/renderer/components/ImportResultDialog'

afterEach(() => cleanup())

describe('ImportResultDialog', () => {
  it('renders nothing when result is null', () => {
    const { container } = render(<ImportResultDialog result={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the summary counts and failed rows', () => {
    render(<ImportResultDialog
      result={{ imported: 3, skippedExisting: 2, duplicatedInFile: 1, failed: [{ row: 5, reason: '缺少售后编号' }] }}
      onClose={() => {}} />)
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('第 5 行:缺少售后编号')).toBeTruthy()
  })

  it('calls onClose when 完成 is clicked', () => {
    const onClose = vi.fn()
    render(<ImportResultDialog result={{ imported: 0, skippedExisting: 0, duplicatedInFile: 0, failed: [] }} onClose={onClose} />)
    fireEvent.click(screen.getByText('完成'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
