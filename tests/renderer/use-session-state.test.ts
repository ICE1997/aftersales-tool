import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionState } from '../../src/renderer/use-session-state'

describe('useSessionState', () => {
  beforeEach(() => sessionStorage.clear())

  it('uses the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useSessionState('k', 'a'))
    expect(result.current[0]).toBe('a')
  })

  it('persists updates and restores them after a remount (reload)', () => {
    const { result, unmount } = renderHook(() => useSessionState('k', 'a'))
    act(() => result.current[1]('b'))
    expect(result.current[0]).toBe('b')
    expect(JSON.parse(sessionStorage.getItem('k')!)).toBe('b')
    unmount() // simulate a renderer reload
    const { result: r2 } = renderHook(() => useSessionState('k', 'a'))
    expect(r2.current[0]).toBe('b')
  })

  it('falls back to the initial value on malformed stored JSON', () => {
    sessionStorage.setItem('k', '{not json')
    const { result } = renderHook(() => useSessionState('k', 'x'))
    expect(result.current[0]).toBe('x')
  })
})
