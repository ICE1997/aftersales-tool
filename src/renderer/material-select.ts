import type { Material } from '@shared/types'
import { isUnderOrEqual } from '@shared/folder-path'

/** relPaths of every material in `folderPath` or any folder nested under it. */
export function materialRelPathsUnder(materials: Material[], folderPath: string): string[] {
  return materials.filter((m) => isUnderOrEqual(m.folder, folderPath)).map((m) => m.relPath)
}
