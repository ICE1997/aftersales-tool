import { readdirSync, statSync, mkdirSync, renameSync, rmSync, unlinkSync, copyFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import type { Material } from '../../shared/types'
import { materialDir, safeDir } from './paths'
import { assertValidMaterialName } from '../../shared/material-path'
import { normalizeSegment, joinPath, parentPath, folderName, isUnderOrEqual } from '../../shared/folder-path'
import { kindFromName, folderOfRelPath } from '../../shared/material-meta'

export interface Listing { folders: string[]; materials: Material[] }

export class FileTree {
  constructor(private dataRoot: string) {}

  private ticketRoot(no: string): string { return join(this.dataRoot, safeDir(no)) }

  list(no: string): Listing {
    const base = this.ticketRoot(no)
    const folders: string[] = []
    const materials: Material[] = []
    const walk = (absDir: string, rel: string): void => {
      let entries: import('node:fs').Dirent[]
      try { entries = readdirSync(absDir, { withFileTypes: true }) } catch { return }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const childRel = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) { folders.push(childRel); walk(join(absDir, e.name), childRel) }
        else if (e.isFile()) {
          const relPath = `${safeDir(no)}/${childRel}`
          const st = statSync(join(absDir, e.name))
          materials.push({ relPath, folder: folderOfRelPath(relPath), name: e.name, kind: kindFromName(e.name), sizeBytes: st.size, modifiedAt: st.mtimeMs })
        }
      }
    }
    walk(base, '')
    return { folders, materials }
  }

  createFolder(no: string, path: string): void {
    for (const seg of path.split('/')) normalizeSegment(seg)
    mkdirSync(materialDir(this.dataRoot, no, path), { recursive: true })
  }

  renameFolder(no: string, path: string, newName: string): string {
    const newPath = joinPath(parentPath(path), normalizeSegment(newName))
    return this.relocateFolder(no, path, newPath)
  }

  moveFolder(no: string, path: string, newParent: string): string {
    if (isUnderOrEqual(newParent, path)) throw new Error('不能把文件夹移动到它自己或其子文件夹里')
    return this.relocateFolder(no, path, joinPath(newParent, folderName(path)))
  }

  private relocateFolder(no: string, fromPath: string, toPath: string): string {
    if (toPath === fromPath) return toPath
    const fromAbs = materialDir(this.dataRoot, no, fromPath)
    const toAbs = materialDir(this.dataRoot, no, toPath)
    if (existsSync(toAbs)) throw new Error('同级已存在同名文件夹')
    mkdirSync(join(toAbs, '..'), { recursive: true })
    renameSync(fromAbs, toAbs)
    return toPath
  }

  removeFolder(no: string, path: string): void {
    rmSync(materialDir(this.dataRoot, no, path), { recursive: true, force: true })
  }

  addFile(no: string, srcPath: string, folder: string): Material {
    return this.place(no, folder, extname(srcPath), basename(srcPath, extname(srcPath)), (abs) => copyFileSync(srcPath, abs))
  }

  addBytes(no: string, fileName: string, buffer: Buffer, folder: string): Material {
    return this.place(no, folder, extname(fileName), basename(fileName, extname(fileName)), (abs) => writeFileSync(abs, buffer))
  }

  private place(no: string, folder: string, ext: string, rawStem: string, write: (abs: string) => void): Material {
    const stem = assertValidMaterialName(rawStem || 'file')
    const dir = materialDir(this.dataRoot, no, folder)
    mkdirSync(dir, { recursive: true })
    let name = `${stem}${ext}`; let i = 1
    while (existsSync(join(dir, name))) { name = `${stem}-${i}${ext}`; i++ }
    const abs = join(dir, name)
    write(abs)
    const relPath = folder ? `${safeDir(no)}/${folder}/${name}` : `${safeDir(no)}/${name}`
    const st = statSync(abs)
    return { relPath, folder, name, kind: kindFromName(name), sizeBytes: st.size, modifiedAt: st.mtimeMs }
  }

  moveMaterial(no: string, relPath: string, newFolder: string): Material {
    const name = relPath.slice(relPath.lastIndexOf('/') + 1)
    const srcAbs = join(this.dataRoot, relPath)
    const dir = materialDir(this.dataRoot, no, newFolder)
    mkdirSync(dir, { recursive: true })
    let dest = name; let i = 1
    const ext = extname(name); const stem = basename(name, ext)
    while (existsSync(join(dir, dest))) { dest = `${stem}-${i}${ext}`; i++ }
    const destAbs = join(dir, dest)
    if (existsSync(srcAbs) && srcAbs !== destAbs) renameSync(srcAbs, destAbs)
    const newRel = newFolder ? `${safeDir(no)}/${newFolder}/${dest}` : `${safeDir(no)}/${dest}`
    const st = statSync(destAbs)
    return { relPath: newRel, folder: newFolder, name: dest, kind: kindFromName(dest), sizeBytes: st.size, modifiedAt: st.mtimeMs }
  }

  removeMaterial(relPath: string): void {
    try { unlinkSync(join(this.dataRoot, relPath)) } catch { /* already gone */ }
  }
}
