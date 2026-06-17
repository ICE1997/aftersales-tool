/** Make an after-sale number safe to use as a single path segment (strip path separators, illegal Windows chars, traversal). */
export function safeDir(aftersaleNo: string): string {
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars from filename
  const cleaned = aftersaleNo.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.+$/, '').trim()
  return cleaned || '_'
}
