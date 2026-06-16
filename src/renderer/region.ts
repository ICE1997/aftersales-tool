export interface Region { code: string; name: string; parent: string }

/** Pure: children of `parentCode` within `list` (parent '' = top-level provinces). */
export function childrenOfIn(list: Region[], parentCode: string): Region[] {
  return list.filter((r) => r.parent === parentCode)
}

/** Pure: join non-empty province/city/district with ' · '. */
export function regionLabel(parts: { province?: string; city?: string; district?: string }): string {
  return [parts.province, parts.city, parts.district].filter((s) => s && s.length > 0).join(' · ')
}

import data from './china-divisions.json'
const ALL = data as Region[]

/** Children of `parentCode` in the bundled dataset (default '' = provinces). */
export function childrenOf(parentCode = ''): Region[] {
  return childrenOfIn(ALL, parentCode)
}
