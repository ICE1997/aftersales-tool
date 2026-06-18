import type { Material } from '@shared/types'
import { isUnderOrEqual } from '@shared/folder-path'

/** Ids of every material in `folderPath` or any folder nested under it. */
export function materialIdsUnder(materials: Material[], folderPath: string): number[] {
  return materials.filter((m) => isUnderOrEqual(m.folder, folderPath)).map((m) => m.id)
}
