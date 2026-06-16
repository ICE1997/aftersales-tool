import { describe, it, expect } from 'vitest'
import { STATUS_META, STATUS_ORDER } from '../../src/renderer/status'
import { withCurrent, TYPE_OPTIONS } from '../../src/renderer/aftersale-options'

const ALL = [
  '待商家处理','待商家收货','待消费者发货','平台处理中',
  '退款成功','退款关闭','换货/补寄成功','换货/补寄关闭','维修成功','维修关闭',
] as const

describe('status metadata', () => {
  it('has meta for all 10 statuses', () => {
    for (const s of ALL) {
      expect(STATUS_META[s]).toBeTruthy()
      expect(STATUS_META[s].label).toBe(s)
      expect(typeof STATUS_META[s].chip).toBe('string')
      expect(typeof STATUS_META[s].dot).toBe('string')
    }
  })
  it('STATUS_ORDER lists all 10 once', () => {
    expect([...STATUS_ORDER].sort()).toEqual([...ALL].sort())
  })
})

describe('aftersale-options', () => {
  it('withCurrent prepends a non-standard current value', () => {
    expect(withCurrent(TYPE_OPTIONS, '做工问题')).toEqual(['做工问题', ...TYPE_OPTIONS])
  })
  it('withCurrent keeps options unchanged for a standard value', () => {
    expect(withCurrent(TYPE_OPTIONS, '退款')).toEqual(TYPE_OPTIONS)
  })
  it('withCurrent ignores empty current', () => {
    expect(withCurrent(TYPE_OPTIONS, '')).toEqual(TYPE_OPTIONS)
  })
})
