import { describe, it, expect } from 'vitest'
import { safeSeg, assertValidMaterialName, materialRelPath } from '../../src/shared/material-path'

describe('safeSeg', () => {
  it('replaces illegal characters with underscore', () => {
    expect(safeSeg('a/b:c*d')).toBe('a_b_c_d')
  })
  it('strips trailing dots and trims, falling back to underscore', () => {
    expect(safeSeg('  name.. ')).toBe('name')
    expect(safeSeg('...')).toBe('_')
  })
})

describe('assertValidMaterialName', () => {
  it('returns the trimmed name when valid', () => {
    expect(assertValidMaterialName('  客服对话 ')).toBe('客服对话')
  })
  it('throws on empty/whitespace', () => {
    expect(() => assertValidMaterialName('   ')).toThrow('请输入材料名称')
  })
  it('throws on illegal characters', () => {
    expect(() => assertValidMaterialName('a/b')).toThrow('材料名称不能包含')
    expect(() => assertValidMaterialName('a:b')).toThrow('材料名称不能包含')
    expect(() => assertValidMaterialName('..')).toThrow('材料名称不能包含')
    expect(() => assertValidMaterialName('name.')).toThrow('材料名称不能包含')
  })
})

describe('materialRelPath', () => {
  it('builds path for a nested folder', () => {
    expect(materialRelPath('AS-1', '凭证/聊天', '客服对话', '.jpg')).toBe('AS-1/凭证/聊天/客服对话.jpg')
  })
  it('places root-folder materials directly under the ticket dir', () => {
    expect(materialRelPath('AS-1', '', '截图', '.png')).toBe('AS-1/截图.png')
  })
  it('sanitizes ticket and folder segments', () => {
    expect(materialRelPath('AS/1', 'a:b', 'n', '.jpg')).toBe('AS_1/a_b/n.jpg')
  })
})
