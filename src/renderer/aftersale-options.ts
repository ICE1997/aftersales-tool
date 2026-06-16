// Standard dropdown options for the editable aftersale fields.
export const TYPE_OPTIONS = ['退款', '退款退货', '换货', '补寄', '维修']
export const REASON_OPTIONS = ['七天无理由退货', '其他原因', '质量问题', '商品描述不符', '发货履约原因', '少件', '疑似假货']
export const SHIPPING_OPTIONS = ['未发货', '已发货']

/** Options to render in a <select>: prepend the current value if it isn't a standard option
 * (so imported, non-standard values are preserved and selectable). */
export function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options
}
