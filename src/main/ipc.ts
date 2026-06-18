import { ipcMain, app, dialog, clipboard, nativeImage, shell } from 'electron'
import { join, basename, extname } from 'node:path'
import { mkdirSync, existsSync, cpSync, rmSync, unlinkSync, rmdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { mediaUrl } from './media-url'
import { handleMediaProtocol } from './media-protocol'
import { createDatabase } from './db/database'
import { TicketRepo, type NewTicket } from './db/tickets'
import { MaterialRepo } from './db/materials'
import { FolderRepo } from './db/folders'
import { StatsRepo } from './db/stats'
import { Settings } from './services/settings'
import { Thumbnailer } from './services/thumbnails'
import { Importer } from './services/importer'
import { Exporter } from './services/exporter'
import { Scanner } from './services/scanner'
import { safeDir, materialDir } from './services/paths'
import { ensureFolderDir, ensureRootDir, renameFolderDir } from './services/material-fs'
import { joinPath, parentPath, normalizeSegment } from '../shared/folder-path'

import { parseXlsx } from './services/ticket-importer'
import { mapRows } from './services/ticket-import-map'
import type { Ticket, ImportTicketsResult } from '../shared/types'

// Open a URL in Google Chrome specifically, falling back to the default
// browser if Chrome is not installed / cannot be launched.
function openInChrome(url: string): void {
  const fallback = () => { void shell.openExternal(url) }
  try {
    const child =
      process.platform === 'darwin'
        ? spawn('open', ['-a', 'Google Chrome', url], { stdio: 'ignore', detached: true })
        : process.platform === 'win32'
          ? spawn('cmd', ['/c', 'start', '', 'chrome', url], { stdio: 'ignore', detached: true, windowsHide: true })
          : spawn('google-chrome', [url], { stdio: 'ignore', detached: true })
    child.on('error', fallback)
    child.on('exit', (code: number | null) => { if (code) fallback() })
    child.unref()
  } catch {
    fallback()
  }
}

export async function registerIpc(): Promise<void> {
  const settings = new Settings(app.getPath('userData'), join(app.getPath('documents'), 'aftersales-tool-data'))
  const dataRoot = settings.getDataRoot()
  mkdirSync(dataRoot, { recursive: true })
  handleMediaProtocol(dataRoot)
  const db = await createDatabase(join(dataRoot, 'aftersales-tool.db'))

  const tickets = new TicketRepo(db)
  const materials = new MaterialRepo(db)
  const folderRepo = new FolderRepo(db)
  const statsRepo = new StatsRepo(db)
  const thumb = new Thumbnailer(dataRoot)
  const importer = new Importer(dataRoot, materials, thumb)
  const exporter = new Exporter(dataRoot)
  const scanner = new Scanner(dataRoot, materials)

  ipcMain.handle('tickets:list', () => tickets.list())
  ipcMain.handle('tickets:search', (_e, q: string) => tickets.search(q))
  ipcMain.handle('tickets:get', (_e, no: string) => tickets.get(no))
  ipcMain.handle('tickets:create', (_e, t: NewTicket) => tickets.create(t))
  ipcMain.handle('tickets:update', (_e, no: string, patch: Partial<Ticket>) => tickets.update(no, patch))

  ipcMain.handle('tickets:import', async (): Promise<ImportTicketsResult | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    })
    if (r.canceled || r.filePaths.length === 0) return null
    const mapped = mapRows(parseXlsx(r.filePaths[0]))
    if (mapped.missingRequiredHeader) throw new Error('模板不正确:缺少「售后编号」列')
    const existing = await tickets.existingNos(mapped.tickets.map((t) => t.aftersaleNo))
    const toInsert = mapped.tickets.filter((t) => !existing.has(t.aftersaleNo))
    await tickets.createMany(toInsert)

    // Existing tickets: if the imported row carries a status that differs, update just the status.
    let updated = 0
    for (const t of mapped.tickets) {
      if (!existing.has(t.aftersaleNo) || !t.status) continue
      const cur = await tickets.get(t.aftersaleNo)
      if (cur && cur.status !== t.status) { await tickets.update(t.aftersaleNo, { status: t.status }); updated++ }
    }

    const existingCount = mapped.tickets.length - toInsert.length
    return {
      imported: toInsert.length,
      updated,
      skippedExisting: existingCount - updated,
      duplicatedInFile: mapped.duplicatedInFile,
      failed: mapped.failed
    }
  })

  ipcMain.handle('tickets:delete', async (_e, no: string) => {
    for (const m of await materials.listByTicket(no)) {
      if (m.thumbPath) { try { unlinkSync(join(dataRoot, m.thumbPath)) } catch { /* ignore */ } }
    }
    try { rmSync(join(dataRoot, safeDir(no)), { recursive: true, force: true }) } catch { /* ignore */ }
    await tickets.delete(no)
    return true
  })

  ipcMain.handle('stats:regionCounts', (_e, level: import('../shared/types').RegionLevel) => statsRepo.regionCounts(level))
  ipcMain.handle('stats:summary', () => statsRepo.summary())

  ipcMain.handle('materials:list', (_e, no: string) => { ensureRootDir(dataRoot, no); return materials.listByTicket(no) })
  ipcMain.handle('materials:remove', (_e, id: number) => materials.remove(id))
  ipcMain.handle('materials:fileUrl', (_e, relPath: string) => mediaUrl(relPath))

  ipcMain.handle('materials:pickFile', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return null
    const p = r.filePaths[0]
    return { path: p, name: basename(p, extname(p)) }
  })

  ipcMain.handle('materials:create', async (_e, no: string, payload: import('../shared/types').CreateMaterialPayload) => {
    const folder = payload.folder ?? ''
    if (payload.source === 'file') return importer.addFile(no, payload.path, payload.name, folder)
    if (payload.source === 'paste') return importer.addBytes(no, payload.fileName, Buffer.from(payload.bytes), payload.name, folder)
    throw new Error('unknown material source')
  })

  ipcMain.handle('folders:list', (_e, no: string) => folderRepo.list(no))
  ipcMain.handle('folders:create', async (_e, no: string, path: string) => {
    await folderRepo.create(no, path)
    ensureFolderDir(dataRoot, no, path)
  })
  ipcMain.handle('folders:rename', async (_e, no: string, path: string, newName: string) => {
    await folderRepo.rename(no, path, newName) // updates DB folder/rel_path; throws on clash/invalid name
    const newPath = joinPath(parentPath(path), normalizeSegment(newName))
    renameFolderDir(dataRoot, no, path, newPath)
  })
  ipcMain.handle('folders:remove', async (_e, no: string, path: string) => {
    for (const m of await folderRepo.remove(no, path)) {
      try { unlinkSync(join(dataRoot, m.relPath)) } catch { /* ignore */ }
      if (m.thumbPath) { try { unlinkSync(join(dataRoot, m.thumbPath)) } catch { /* ignore */ } }
    }
    try { rmdirSync(materialDir(dataRoot, no, path), { recursive: true }) } catch { /* ignore: dir missing or not empty */ }
  })
  ipcMain.handle('materials:move', (_e, id: number, folder: string) => importer.moveToFolder(id, folder))

  ipcMain.handle('export:folder', async (_e, ids: number[]) => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return false
    await exporter.toFolder(await materials.getByIds(ids), r.filePaths[0])
    return true
  })

  ipcMain.handle('export:zip', async (_e, ids: number[]) => {
    const r = await dialog.showSaveDialog({ defaultPath: 'materials.zip' })
    if (r.canceled || !r.filePath) return false
    await exporter.toZip(await materials.getByIds(ids), r.filePath)
    return true
  })

  ipcMain.handle('clipboard:copyImage', (_e, relPath: string) => {
    clipboard.writeImage(nativeImage.createFromPath(join(dataRoot, relPath)))
    return true
  })

  // Copy absolute paths to the clipboard (e.g. to paste into 拼多多 upload dialogs).
  ipcMain.handle('clipboard:copyMaterialPath', (_e, relPath: string) => {
    const abs = join(dataRoot, relPath)
    clipboard.writeText(abs)
    return abs
  })
  ipcMain.handle('clipboard:copyDirPath', (_e, no: string, folder: string) => {
    const abs = materialDir(dataRoot, no, folder)
    clipboard.writeText(abs)
    return abs
  })

  ipcMain.handle('scan:calibrate', (_e, no: string) => scanner.calibrateTicket(no))

  ipcMain.handle('settings:getDataRoot', () => settings.getDataRoot())
  ipcMain.handle('settings:chooseDataRoot', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return false
    const newRoot = r.filePaths[0]
    if (newRoot === dataRoot) return false
    // If the chosen folder already holds an aftersales-tool library, point to it; otherwise copy the current library in.
    if (!existsSync(join(newRoot, 'aftersales-tool.db'))) {
      cpSync(dataRoot, newRoot, { recursive: true })
    }
    settings.setDataRoot(newRoot)
    await dialog.showMessageBox({ message: '数据目录已更改,应用将重启以生效。' })
    app.relaunch()
    app.exit(0)
    return true
  })

  ipcMain.handle('shell:showItem', (_e, relPath: string) => shell.showItemInFolder(join(dataRoot, relPath)))
  ipcMain.handle('shell:openChrome', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) openInChrome(url)
  })

  // Open a ticket's material directory (folder='' = its root) in the OS file manager.
  ipcMain.handle('shell:openMaterialDir', async (_e, no: string, folder: string) => {
    ensureFolderDir(dataRoot, no, folder)
    await shell.openPath(materialDir(dataRoot, no, folder))
  })
}
