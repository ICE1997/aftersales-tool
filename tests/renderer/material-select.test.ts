import { describe, it, expect } from 'vitest'
import type { Material } from '@shared/types'
import { materialIdsUnder } from '../../src/renderer/material-select'

const mk = (id: number, folder: string): Material => ({ id, folder } as Material)

describe('materialIdsUnder', () => {
  const ms = [mk(1, '凭证'), mk(2, '凭证/聊天'), mk(3, '物流'), mk(4, '')]

  it('collects ids in the folder and all its descendants', () => {
    expect(materialIdsUnder(ms, '凭证').sort((a, b) => a - b)).toEqual([1, 2])
  })
  it('matches an exact leaf folder', () => {
    expect(materialIdsUnder(ms, '凭证/聊天')).toEqual([2])
  })
  it('returns an empty list when nothing lives under the folder', () => {
    expect(materialIdsUnder(ms, '不存在')).toEqual([])
  })
})
