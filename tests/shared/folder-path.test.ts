import { describe, it, expect } from 'vitest'
import { normalizeSegment, joinPath, parentPath, folderName, ancestorsAndSelf, childrenFolders, isUnderOrEqual, rewritePrefix } from '../../src/shared/folder-path'

describe('folder-path', () => {
  it('normalizeSegment trims and rejects bad names', () => {
    expect(normalizeSegment('  凭证 ')).toBe('凭证')
    expect(() => normalizeSegment('')).toThrow()
    expect(() => normalizeSegment('a/b')).toThrow()
    expect(() => normalizeSegment('..')).toThrow()
    expect(() => normalizeSegment('.')).toThrow()
  })
  it('joinPath / parentPath / folderName', () => {
    expect(joinPath('', '凭证')).toBe('凭证')
    expect(joinPath('凭证', '聊天')).toBe('凭证/聊天')
    expect(parentPath('凭证/聊天')).toBe('凭证')
    expect(parentPath('凭证')).toBe('')
    expect(folderName('凭证/聊天')).toBe('聊天')
    expect(folderName('凭证')).toBe('凭证')
  })
  it('ancestorsAndSelf', () => {
    expect(ancestorsAndSelf('a/b/c')).toEqual(['a', 'a/b', 'a/b/c'])
    expect(ancestorsAndSelf('a')).toEqual(['a'])
    expect(ancestorsAndSelf('')).toEqual([])
  })
  it('childrenFolders returns immediate children, sorted/deduped', () => {
    const all = ['凭证', '凭证/聊天', '凭证/截图', '物流', '凭证/聊天/2024']
    expect(childrenFolders(all, '')).toEqual(['凭证', '物流'])
    expect(childrenFolders(all, '凭证')).toEqual(['凭证/聊天', '凭证/截图'])
    expect(childrenFolders(all, '凭证/聊天')).toEqual(['凭证/聊天/2024'])
  })
  it('isUnderOrEqual / rewritePrefix', () => {
    expect(isUnderOrEqual('凭证/聊天', '凭证')).toBe(true)
    expect(isUnderOrEqual('凭证', '凭证')).toBe(true)
    expect(isUnderOrEqual('凭证2', '凭证')).toBe(false)
    expect(rewritePrefix('凭证/聊天', '凭证', '证据')).toBe('证据/聊天')
    expect(rewritePrefix('凭证', '凭证', '证据')).toBe('证据')
    expect(rewritePrefix('物流', '凭证', '证据')).toBe('物流')
  })
})
