import type { MaterialKind } from './types'

const IMAGE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'])
const VIDEO = new Set(['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'])

export function kindFromName(name: string): MaterialKind {
  const i = name.lastIndexOf('.')
  const ext = i < 0 ? '' : name.slice(i + 1).toLowerCase()
  if (IMAGE.has(ext)) return 'image'
  if (VIDEO.has(ext)) return 'video'
  return 'other'
}

export function folderOfRelPath(relPath: string): string {
  return relPath.split('/').slice(1, -1).join('/')
}

export function nameOfRelPath(relPath: string): string {
  return relPath.slice(relPath.lastIndexOf('/') + 1)
}
