import { ipcMain, app, dialog, clipboard, nativeImage, shell } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { createDatabase } from './db/database'
import { TicketRepo, type NewTicket } from './db/tickets'
import { MaterialRepo } from './db/materials'
import { Settings } from './services/settings'
import { Thumbnailer } from './services/thumbnails'
import { Importer } from './services/importer'
import { Exporter } from './services/exporter'
import { Scanner } from './services/scanner'
import type { Ticket } from '../shared/types'

export function registerIpc(): void {
  const settings = new Settings(app.getPath('userData'), join(app.getPath('documents'), 'vhelper-data'))
  const dataRoot = settings.getDataRoot()
  mkdirSync(dataRoot, { recursive: true })
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

  ipcMain.handle('materials:list', (_e, no: string) => materials.listByTicket(no))
  ipcMain.handle('materials:remove', (_e, id: number) => materials.remove(id))
  ipcMain.handle('materials:fileUrl', (_e, relPath: string) => `file://${join(dataRoot, relPath)}`)

  ipcMain.handle('import:pick', async (_e, no: string) => {
    const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (r.canceled) return { imported: [], skipped: [] }
    return importer.importFiles(no, r.filePaths)
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
    settings.setDataRoot(r.filePaths[0])
    await dialog.showMessageBox({ message: '数据目录已更改,应用将重启以生效。' })
    app.relaunch()
    app.exit(0)
    return true
  })

  ipcMain.handle('shell:showItem', (_e, relPath: string) => shell.showItemInFolder(join(dataRoot, relPath)))
}
