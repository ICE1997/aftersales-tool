import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const createMaterial = vi.fn()
const pickFile = vi.fn()
vi.mock('../../src/renderer/api', () => ({
  api: {
    createMaterial: (...a: unknown[]) => createMaterial(...a),
    pickFile: (...a: unknown[]) => pickFile(...a)
  }
}))

import { NewMaterialDialog } from '../../src/renderer/components/NewMaterialDialog'

beforeEach(() => { createMaterial.mockReset(); pickFile.mockReset() })
afterEach(() => cleanup())

describe('NewMaterialDialog', () => {
  it('shows the paste prompt and disables 创建 initially', () => {
    render(<NewMaterialDialog open={true} aftersaleNo="AS-1" targetFolder="" onCreated={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/粘贴图片或文件/)).toBeTruthy()
    expect((screen.getByText('创建').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('picks a file and creates with a file payload', async () => {
    pickFile.mockResolvedValue({ path: '/x/clip.mp4', name: 'clip' })
    createMaterial.mockResolvedValue({ id: 2, name: 'clip', relPath: 'AS-1/videos/clip.mp4', kind: 'video' })
    const onCreated = vi.fn()
    render(<NewMaterialDialog open={true} aftersaleNo="AS-1" targetFolder="" onCreated={onCreated} onCancel={() => {}} />)
    fireEvent.click(screen.getByText('选择文件'))
    fireEvent.click(await screen.findByText('选择文件…'))
    await screen.findByText('clip.mp4')
    fireEvent.click(screen.getByText('创建'))
    await waitFor(() => expect(createMaterial).toHaveBeenCalledWith('AS-1', { source: 'file', path: '/x/clip.mp4', name: 'clip', folder: '' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })
})
