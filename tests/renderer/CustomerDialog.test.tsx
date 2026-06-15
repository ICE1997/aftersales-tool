import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { CustomerDialog } from '../../src/renderer/components/CustomerDialog'

afterEach(() => cleanup())

describe('CustomerDialog', () => {
  it('disables 保存 until nickname or name is filled', () => {
    render(<CustomerDialog open={true} onSave={() => {}} onCancel={() => {}} />)
    const save = screen.getByText('保存').closest('button') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('昵称'), { target: { value: '小明' } })
    expect(save.disabled).toBe(false)
  })

  it('calls onSave with a NewCustomer payload', () => {
    const onSave = vi.fn()
    render(<CustomerDialog open={true} onSave={onSave} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('姓名'), { target: { value: '张三' } })
    fireEvent.click(screen.getByText('保存'))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: '张三', nickname: '', addressDetail: '' }))
  })
})
