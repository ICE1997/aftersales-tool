import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
// Default import (not `{ autoUpdater }`): electron-updater is CommonJS, and
// Electron's ESM loader can't resolve named exports from CJS at runtime.
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { registerMediaScheme } from './media-protocol'
import { buildAppMenu } from './menu'
import { createUpdateController } from './updater'

// Must run before app 'ready' — registers the privileged scheme used to serve
// local media to the renderer (works from both the dev http:// origin and the
// packaged file:// origin).
registerMediaScheme()
app.setName('售后酱')

function createWindow(): void {
  const win = new BrowserWindow({
    title: '售后酱',
    width: 1320,
    height: 820,
    minWidth: 1040,
    minHeight: 640,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // required to load the ESM (.mjs) preload
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  try {
    await registerIpc()
  } catch (e) {
    dialog.showErrorBox('启动失败', `无法初始化数据存储:\n${(e as Error).message}`)
    app.quit()
    return
  }
  app.setAboutPanelOptions({
    applicationName: '售后酱',
    applicationVersion: app.getVersion(),
    copyright: '© 2026 售后酱'
  })
  const updater = createUpdateController({
    autoUpdater,
    dialog,
    shell,
    platform: process.platform,
    isPackaged: app.isPackaged,
    releasePageUrl: 'https://github.com/ICE1997/aftersales-tool/releases/latest'
  })
  Menu.setApplicationMenu(buildAppMenu(() => { void updater.checkForUpdates() }))
  createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
