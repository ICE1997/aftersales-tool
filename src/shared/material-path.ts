// eslint-disable-next-line no-control-regex -- intentional: strip control chars from filenames
const ILLEGAL = /[<>:"/\\|?*\x00-\x1f]/

/** Sanitize one path segment: illegal chars -> '_', strip trailing dots, trim. */
export function safeSeg(s: string): string {
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars from filenames
  const cleaned = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/\.+$/, '').trim()
  return cleaned || '_'
}

/** Validate a user-entered material name. Returns the trimmed name or throws. */
export function assertValidMaterialName(name: string): string {
  const s = (name ?? '').trim()
  if (!s) throw new Error('请输入材料名称')
  if (s === '.' || s === '..' || ILLEGAL.test(s) || s.endsWith('.')) {
    throw new Error('材料名称不能包含 / \\ : * ? " < > | 等字符')
  }
  return s
}

/** Relative (POSIX) path for a material file: safeSeg(no)/[folder segs]/name+ext. */
export function materialRelPath(aftersaleNo: string, folder: string, name: string, ext: string): string {
  const segs = folder ? folder.split('/').map(safeSeg) : []
  return [safeSeg(aftersaleNo), ...segs, `${name}${ext}`].join('/')
}
