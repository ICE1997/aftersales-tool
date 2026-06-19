import { ipcMain, app, dialog, clipboard, nativeImage, shell, BrowserWindow } from 'electron'
import { join, basename, extname } from 'node:path'
import { mkdirSync, existsSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { mediaUrl } from './media-url'
import { handleMediaProtocol } from './media-protocol'
import { createDatabase } from './db/database'
import { TicketRepo, type NewTicket } from './db/tickets'
import { StatsRepo } from './db/stats'
import { Settings } from './services/settings'
import { Thumbnailer } from './services/thumbnails'
import { Exporter } from './services/exporter'
import { FileTree } from './services/file-tree'
import { MaterialWatcher } from './services/material-watch'
import { safeDir, materialDir } from './services/paths'
import { Transcoder } from './services/transcoder'
import { dedupeName } from './services/transcode-args'
import { FORMATS } from '../shared/transcode'
import { folderOfRelPath } from '../shared/material-meta'

import { parseXlsx } from './services/ticket-importer'
import { mapRows } from './services/ticket-import-map'
import type { Ticket, ImportTicketsResult, MaterialKind, CreateMaterialPayload, RegionLevel, Material } from '../shared/types'
import type { TranscodeOptions } from '../shared/transcode'

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

const transcoder = new Transcoder()
const transcodeJobs = new Map<string, AbortController>()

export async function registerIpc(): Promise<void> {
  const settings = new Settings(app.getPath('userData'), join(app.getPath('documents'), 'aftersales-tool-data'))
  const dataRoot = settings.getDataRoot()
  mkdirSync(dataRoot, { recursive: true })
  handleMediaProtocol(dataRoot)
  const db = await createDatabase(join(dataRoot, 'aftersales-tool.db'))

  const tickets = new TicketRepo(db)
  const statsRepo = new StatsRepo(db)
  const thumb = new Thumbnailer(dataRoot)
  const exporter = new Exporter(dataRoot)
  const fileTree = new FileTree(dataRoot)
  const watcher = new MaterialWatcher(dataRoot, (no) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('materials:changed', no)
  })

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
    try { rmSync(join(dataRoot, safeDir(no)), { recursive: true, force: true }) } catch { /* ignore */ }
    await tickets.delete(no)
    return true
  })

  ipcMain.handle('stats:regionCounts', (_e, level: RegionLevel) => statsRepo.regionCounts(level))
  ipcMain.handle('stats:summary', () => statsRepo.summary())

  ipcMain.handle('materials:list', (_e, no: string) => fileTree.list(no))
  ipcMain.handle('materials:thumb', (_e, relPath: string, kind: MaterialKind, mtimeMs: number, sizeBytes: number) => thumb.thumbFor(relPath, kind, mtimeMs, sizeBytes))
  ipcMain.handle('materials:fileUrl', (_e, relPath: string) => mediaUrl(relPath))
  ipcMain.handle('materials:remove', (_e, relPath: string) => fileTree.removeMaterial(relPath))
  ipcMain.handle('materials:move', (_e, no: string, relPath: string, newFolder: string) => fileTree.moveMaterial(no, relPath, newFolder))
  ipcMain.handle('materials:rename', (_e, relPath: string, newName: string) => fileTree.renameMaterial(relPath, newName))

  ipcMain.handle('materials:pickFile', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return null
    const p = r.filePaths[0]
    return { path: p, name: basename(p, extname(p)) }
  })

  ipcMain.handle('materials:create', async (_e, no: string, payload: CreateMaterialPayload) => {
    const folder = payload.folder ?? ''
    if (payload.source === 'file') return fileTree.addFile(no, payload.path, payload.name, folder)
    if (payload.source === 'paste') return fileTree.addBytes(no, payload.fileName, Buffer.from(payload.bytes), payload.name, folder)
    throw new Error('unknown material source')
  })

  ipcMain.handle('materials:watch', (_e, no: string) => watcher.watch(no))
  ipcMain.handle('materials:unwatch', () => watcher.unwatch())

  ipcMain.handle('materials:transcode', async (_e, no: string, relPath: string, opts: TranscodeOptions): Promise<Material> => {
    const folder = folderOfRelPath(relPath)
    const dir = materialDir(dataRoot, no, folder)
    const ext = '.' + FORMATS[opts.format].container
    const desired = `${opts.outputName}${ext}`
    const existing = readdirSync(dir)
    const name = dedupeName(existing, desired)
    const destAbs = join(dir, name)
    const ac = new AbortController(); transcodeJobs.set(relPath, ac)
    try {
      await transcoder.transcode(
        join(dataRoot, relPath),
        destAbs,
        opts,
        (percent) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('transcode:progress', { relPath, percent }) },
        ac.signal
      )
    } finally { transcodeJobs.delete(relPath) }
    const st = statSync(destAbs)
    const newRel = folder ? `${safeDir(no)}/${folder}/${name}` : `${safeDir(no)}/${name}`
    return { relPath: newRel, folder, name, kind: 'video', sizeBytes: st.size, modifiedAt: st.mtimeMs }
  })

  ipcMain.handle('materials:cancelTranscode', (_e, relPath: string) => { transcodeJobs.get(relPath)?.abort() })

  ipcMain.handle('folders:list', (_e, no: string) => fileTree.list(no).folders)
  ipcMain.handle('folders:create', (_e, no: string, path: string) => fileTree.createFolder(no, path))
  ipcMain.handle('folders:rename', (_e, no: string, path: string, newName: string) => fileTree.renameFolder(no, path, newName))
  ipcMain.handle('folders:remove', (_e, no: string, path: string) => fileTree.removeFolder(no, path))
  ipcMain.handle('folders:move', (_e, no: string, path: string, newParent: string) => fileTree.moveFolder(no, path, newParent))

  ipcMain.handle('export:folder', async (_e, relPaths: string[], folders: string[] = []) => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return false
    await exporter.toFolder(relPaths, r.filePaths[0], folders)
    return true
  })

  ipcMain.handle('export:zip', async (_e, relPaths: string[], folders: string[] = []) => {
    const r = await dialog.showSaveDialog({ defaultPath: 'materials.zip' })
    if (r.canceled || !r.filePath) return false
    await exporter.toZip(relPaths, r.filePath, folders)
    return true
  })

  ipcMain.handle('app:version', () => app.getVersion())

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
    const dir = materialDir(dataRoot, no, folder)
    mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  })
}
