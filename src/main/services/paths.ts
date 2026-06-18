import { join } from 'node:path'
import { safeSeg } from '../../shared/material-path'

/** Make an after-sale number safe to use as a single path segment. */
export const safeDir = safeSeg

/** Absolute directory that holds a material: dataRoot/safeSeg(no)/[folder segs]. */
export function materialDir(dataRoot: string, aftersaleNo: string, folder: string): string {
  const segs = folder ? folder.split('/').map(safeSeg) : []
  return join(dataRoot, safeSeg(aftersaleNo), ...segs)
}
