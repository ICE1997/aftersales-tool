import { ipcMain, app, dialog, clipboard, nativeImage, shell } from 'electron'
import { join, basename, extname } from 'node:path'
import { mkdirSync, existsSync, cpSync, rmSync, unlinkSync } from 'node:fs'
import { mediaUrl } from './media-url'
import { handleMediaProtocol } from './media-protocol'
import { createDatabase } from './db/database'
import { TicketRepo, type NewTicket } from './db/tickets'
import { MaterialRepo } from './db/materials'
import { Settings } from './services/settings'
import { Thumbnailer } from './services/thumbnails'
import { Importer } from './services/importer'
import { Exporter } from './services/exporter'
import { Scanner } from './services/scanner'
import { safeDir } from './services/paths'
import { peekClipboard, readClipboardSource } from './services/clipboard-source'
import type { Ticket } from '../shared/types'

export function registerIpc(): void {
  const settings = new Settings(app.getPath('userData'), join(app.getPath('documents'), 'vhelper-data'))
  const dataRoot = settings.getDataRoot()
  mkdirSync(dataRoot, { recursive: true })
  handleMediaProtocol(dataRoot)
  const db = createDatabase(join(dataRoot, 'vhelper.db'))

  const tickets = new TicketRepo(db)
  const materials = new MaterialRepo(db)
  const thumb = new Thumbnailer(dataRoot)
  const importer = new Importer(dataRoot, materials, thumb)
  const exporter = new Exporter(dataRoot)
  const scanner = new Scanner(dataRoot, materials)

  ipcMain.handle('tickets:list', () => tickets.list())
  ipcMain.handle('tickets:search', (_e, q: string) => tickets.search(q))
  ipcMain.handle('tickets:get', (_e, no: string) => tickets.get(no))
  ipcMain.handle('tickets:create', (_e, t: NewTicket) => tickets.create(t))
  ipcMain.handle('tickets:update', (_e, no: string, patch: Partial<Ticket>) => tickets.update(no, patch))

  ipcMain.handle('tickets:delete', (_e, no: string) => {
    // Remove on-disk thumbnails for this ticket's materials, then the ticket folder, then DB rows
    for (const m of materials.listByTicket(no)) {
      if (m.thumbPath) { try { unlinkSync(join(dataRoot, m.thumbPath)) } catch { /* ignore */ } }
    }
    try { rmSync(join(dataRoot, safeDir(no)), { recursive: true, force: true }) } catch { /* ignore */ }
    tickets.delete(no)
    return true
  })

  ipcMain.handle('materials:list', (_e, no: string) => materials.listByTicket(no))
  ipcMain.handle('materials:remove', (_e, id: number) => materials.remove(id))
  ipcMain.handle('materials:fileUrl', (_e, relPath: string) => mediaUrl(relPath))

  ipcMain.handle('clipboard:peek', () => peekClipboard())

  ipcMain.handle('materials:pickFile', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (r.canceled || !r.filePaths[0]) return null
    const p = r.filePaths[0]
    return { path: p, name: basename(p, extname(p)) }
  })

  ipcMain.handle('materials:create', async (_e, no: string, payload: import('../shared/types').CreateMaterialPayload) => {
    if (payload.source === 'file') return importer.addFile(no, payload.path, payload.name)
    // Re-read the clipboard at create time (the dialog's peek was only for preview); if it
    // changed to empty since the preview, surface an error so the user can retry.
    const src = readClipboardSource()
    if (!src) throw new Error('剪贴板没有可用的图片或文件')
    if (src.kind === 'image') return importer.addImageBuffer(no, src.buffer, payload.name)
    return importer.addFile(no, src.path, payload.name)
  })

  ipcMain.handle('export:folder', async (_e, ids: number[]) => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return false
    await exporter.toFolder(materials.getByIds(ids), r.filePaths[0])
    return true
  })

  ipcMain.handle('export:zip', async (_e, ids: number[]) => {
    const r = await dialog.showSaveDialog({ defaultPath: 'materials.zip' })
    if (r.canceled || !r.filePath) return false
    await exporter.toZip(materials.getByIds(ids), r.filePath)
    return true
  })

  ipcMain.handle('clipboard:copyImage', (_e, relPath: string) => {
    clipboard.writeImage(nativeImage.createFromPath(join(dataRoot, relPath)))
    return true
  })

  ipcMain.handle('scan:calibrate', (_e, no: string) => scanner.calibrateTicket(no))

  ipcMain.handle('settings:getDataRoot', () => settings.getDataRoot())
  ipcMain.handle('settings:chooseDataRoot', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return false
    const newRoot = r.filePaths[0]
    if (newRoot === dataRoot) return false
    // If the chosen folder already holds a vhelper library, point to it; otherwise copy the current library in.
    if (!existsSync(join(newRoot, 'vhelper.db'))) {
      cpSync(dataRoot, newRoot, { recursive: true })
    }
    settings.setDataRoot(newRoot)
    await dialog.showMessageBox({ message: '数据目录已更改,应用将重启以生效。' })
    app.relaunch()
    app.exit(0)
    return true
  })

  ipcMain.handle('shell:showItem', (_e, relPath: string) => shell.showItemInFolder(join(dataRoot, relPath)))
}
