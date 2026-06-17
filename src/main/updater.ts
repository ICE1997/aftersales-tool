// No electron / electron-updater imports — all deps are injected (structural types),
// so this is unit-testable in plain node and compiles before electron-updater is installed.

interface MessageBoxOpts {
  type?: string; title?: string; message?: string; detail?: string
  buttons?: string[]; defaultId?: number; cancelId?: number
}

export interface UpdaterAutoUpdater {
  autoDownload: boolean
  on(event: string, listener: (...args: any[]) => void): void
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}
export interface UpdaterDialog {
  showMessageBox(opts: MessageBoxOpts): Promise<{ response: number }>
  showErrorBox(title: string, content: string): void
}
export interface UpdateDeps {
  autoUpdater: UpdaterAutoUpdater
  dialog: UpdaterDialog
  shell: { openExternal(url: string): Promise<unknown> }
  platform: NodeJS.Platform
  isPackaged: boolean
  releasePageUrl: string
}
export interface UpdateController { checkForUpdates(): Promise<void> }

export function createUpdateController(deps: UpdateDeps): UpdateController {
  const { autoUpdater, dialog, shell, platform, isPackaged, releasePageUrl } = deps
  let wired = false

  const confirm = async (message: string): Promise<boolean> => {
    const { response } = await dialog.showMessageBox({
      type: 'info', message, buttons: ['取消', '确定'], defaultId: 1, cancelId: 0,
    })
    return response === 1
  }

  const wire = () => {
    if (wired) return
    wired = true
    autoUpdater.on('update-available', (info: { version?: string }) => {
      const v = info?.version ?? ''
      if (platform === 'darwin') {
        void confirm(`发现新版本 v${v},前往下载?`).then((ok) => { if (ok) void shell.openExternal(releasePageUrl) })
      } else {
        void confirm(`发现新版本 v${v},是否下载?`).then((ok) => { if (ok) void autoUpdater.downloadUpdate() })
      }
    })
    autoUpdater.on('update-not-available', () => {
      void dialog.showMessageBox({ type: 'info', message: '已是最新版本', buttons: ['好的'] })
    })
    autoUpdater.on('download-progress', (p: unknown) => { console.log('[updater] download-progress', p) })
    autoUpdater.on('update-downloaded', () => {
      void confirm('新版本已下载完成,立即重启安装?').then((ok) => { if (ok) autoUpdater.quitAndInstall() })
    })
    autoUpdater.on('error', (err: unknown) => {
      dialog.showErrorBox('检查更新失败', String((err as Error)?.message ?? err))
    })
  }

  return {
    async checkForUpdates() {
      if (!isPackaged) {
        await dialog.showMessageBox({ type: 'info', message: '开发模式不支持检查更新', buttons: ['好的'] })
        return
      }
      autoUpdater.autoDownload = false
      wire()
      await autoUpdater.checkForUpdates()
    },
  }
}
