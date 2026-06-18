// eslint-disable-next-line no-control-regex -- intentional: reject control chars in folder names
const ILLEGAL_SEG = /[<>:"/\\|?*\x00-\x1f]/

export function normalizeSegment(name: string): string {
  const s = name.trim()
  if (!s || s === '.' || s === '..' || ILLEGAL_SEG.test(s) || s.endsWith('.')) throw new Error('非法的文件夹名')
  return s
}
export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}
export function parentPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}
export function folderName(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}
export function ancestorsAndSelf(path: string): string[] {
  if (!path) return []
  const segs = path.split('/')
  return segs.map((_, i) => segs.slice(0, i + 1).join('/'))
}
export function childrenFolders(allPaths: string[], parent: string): string[] {
  const out = new Set<string>()
  for (const p of allPaths) if (parentPath(p) === parent) out.add(p)
  return [...out]
}
export function isUnderOrEqual(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}
export function rewritePrefix(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) return newPrefix
  if (path.startsWith(oldPrefix + '/')) return newPrefix + path.slice(oldPrefix.length)
  return path
}
