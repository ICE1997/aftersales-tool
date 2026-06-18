import { describe, it, expect } from 'vitest'
import type { Material } from '@shared/types'
import { materialRelPathsUnder } from '../../src/renderer/material-select'

const mk = (relPath: string, folder: string): Material => ({ relPath, folder } as Material)

describe('materialRelPathsUnder', () => {
  const ms = [
    mk('AS-1/凭证/a.jpg', '凭证'),
    mk('AS-1/凭证/聊天/b.jpg', '凭证/聊天'),
    mk('AS-1/物流/c.jpg', '物流'),
    mk('AS-1/d.jpg', '')
  ]

  it('collects relPaths in the folder and all its descendants', () => {
    expect(materialRelPathsUnder(ms, '凭证').sort()).toEqual(['AS-1/凭证/a.jpg', 'AS-1/凭证/聊天/b.jpg'])
  })
  it('matches an exact leaf folder', () => {
    expect(materialRelPathsUnder(ms, '凭证/聊天')).toEqual(['AS-1/凭证/聊天/b.jpg'])
  })
  it('returns an empty list when nothing lives under the folder', () => {
    expect(materialRelPathsUnder(ms, '不存在')).toEqual([])
  })
})
