import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const peekClipboard = vi.fn()
const createMaterial = vi.fn()
const pickFile = vi.fn()
vi.mock('../../src/renderer/api', () => ({
  api: {
    peekClipboard: (...a: unknown[]) => peekClipboard(...a),
    createMaterial: (...a: unknown[]) => createMaterial(...a),
    pickFile: (...a: unknown[]) => pickFile(...a)
  }
}))

import { NewMaterialDialog } from '../../src/renderer/components/NewMaterialDialog'

beforeEach(() => { peekClipboard.mockReset(); createMaterial.mockReset(); pickFile.mockReset() })
afterEach(() => { cleanup() })

describe('NewMaterialDialog', () => {
  it('previews a clipboard image, prefills the name, lets you rename, and creates', async () => {
    peekClipboard.mockResolvedValue({ type: 'image', name: '粘贴图片', thumbDataUrl: 'data:image/png;base64,AAAA' })
    createMaterial.mockResolvedValue({ id: 1, name: '聊天截图', relPath: 'AS-1/images/paste-1.png', kind: 'image' })
    const onCreated = vi.fn()
    render(<NewMaterialDialog open={true} aftersaleNo="AS-1" onCreated={onCreated} onCancel={() => {}} />)
    const input = await screen.findByPlaceholderText('材料名称')
    await waitFor(() => expect((input as HTMLInputElement).value).toBe('粘贴图片'))
    fireEvent.change(input, { target: { value: '聊天截图' } })
    fireEvent.click(screen.getByText('创建'))
    await waitFor(() => expect(createMaterial).toHaveBeenCalledWith('AS-1', { source: 'clipboard', name: '聊天截图' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 1, name: '聊天截图', relPath: 'AS-1/images/paste-1.png', kind: 'image' }))
  })

  it('disables 创建 and shows a hint when the clipboard is empty', async () => {
    peekClipboard.mockResolvedValue({ type: 'empty' })
    render(<NewMaterialDialog open={true} aftersaleNo="AS-1" onCreated={() => {}} onCancel={() => {}} />)
    await waitFor(() => expect((screen.getByText('创建').closest('button') as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByText(/剪贴板没有可用的图片或文件/)).toBeTruthy()
    expect(screen.getByText('刷新')).toBeTruthy()
  })

  it('picks a file and creates with a file payload', async () => {
    peekClipboard.mockResolvedValue({ type: 'empty' })
    pickFile.mockResolvedValue({ path: '/x/clip.mp4', name: 'clip' })
    createMaterial.mockResolvedValue({ id: 2, name: 'clip', relPath: 'AS-1/videos/clip.mp4', kind: 'video' })
    const onCreated = vi.fn()
    render(<NewMaterialDialog open={true} aftersaleNo="AS-1" onCreated={onCreated} onCancel={() => {}} />)
    fireEvent.click(await screen.findByText('选择文件'))            // switch tab
    fireEvent.click(await screen.findByText('选择文件…'))           // open picker
    await screen.findByText('/x/clip.mp4')                          // picked path shown
    fireEvent.click(screen.getByText('创建'))
    await waitFor(() => expect(createMaterial).toHaveBeenCalledWith('AS-1', { source: 'file', path: '/x/clip.mp4', name: 'clip' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })
})
