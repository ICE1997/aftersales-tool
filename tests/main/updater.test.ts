import { describe, it, expect } from 'vitest'
import { createUpdateController } from '../../src/main/updater'

const flush = () => new Promise((r) => setTimeout(r, 0))

class FakeAuto {
  autoDownload = true
  listeners: Record<string, ((...a: any[]) => void)[]> = {}
  checks = 0; downloads = 0; installs = 0
  on(e: string, cb: (...a: any[]) => void) { (this.listeners[e] ||= []).push(cb) }
  emit(e: string, ...a: any[]) { (this.listeners[e] || []).forEach((f) => f(...a)) }
  async checkForUpdates() { this.checks++ }
  async downloadUpdate() { this.downloads++ }
  quitAndInstall() { this.installs++ }
}
function makeDialog(response = 1) {
  const messages: string[] = []
  const errors: [string, string][] = []
  return {
    messages, errors,
    showMessageBox: async (o: any) => { messages.push(String(o.message)); return { response } },
    showErrorBox: (t: string, c: string) => { errors.push([t, c]) },
  }
}
function makeShell() {
  const opened: string[] = []
  return { opened, openExternal: async (u: string) => { opened.push(u); return undefined } }
}
const URL = 'https://github.com/ICE1997/aftersales-tool/releases/latest'
const base = (over: any = {}) => ({
  autoUpdater: new FakeAuto(), dialog: makeDialog(), shell: makeShell(),
  platform: 'win32' as NodeJS.Platform, isPackaged: true, releasePageUrl: URL, ...over,
})

describe('createUpdateController', () => {
  it('dev (not packaged): warns and never calls autoUpdater', async () => {
    const d = base({ isPackaged: false })
    await createUpdateController(d).checkForUpdates()
    expect(d.dialog.messages).toContain('开发模式不支持检查更新')
    expect(d.autoUpdater.checks).toBe(0)
  })
  it('packaged: sets autoDownload=false and checks once', async () => {
    const d = base()
    await createUpdateController(d).checkForUpdates()
    expect(d.autoUpdater.autoDownload).toBe(false)
    expect(d.autoUpdater.checks).toBe(1)
  })
  it('mac update-available + confirm → opens release page, no download', async () => {
    const d = base({ platform: 'darwin', dialog: makeDialog(1) })
    const c = createUpdateController(d)
    await c.checkForUpdates()
    d.autoUpdater.emit('update-available', { version: '9.9.9' })
    await flush()
    expect(d.shell.opened).toEqual([URL])
    expect(d.autoUpdater.downloads).toBe(0)
  })
  it('mac update-available + cancel → does not open', async () => {
    const d = base({ platform: 'darwin', dialog: makeDialog(0) })
    const c = createUpdateController(d)
    await c.checkForUpdates()
    d.autoUpdater.emit('update-available', { version: '9.9.9' })
    await flush()
    expect(d.shell.opened).toEqual([])
  })
  it('win update-available + confirm → downloads; downloaded + confirm → quitAndInstall', async () => {
    const d = base({ platform: 'win32', dialog: makeDialog(1) })
    const c = createUpdateController(d)
    await c.checkForUpdates()
    d.autoUpdater.emit('update-available', { version: '1.2.3' })
    await flush()
    expect(d.autoUpdater.downloads).toBe(1)
    d.autoUpdater.emit('update-downloaded', { version: '1.2.3' })
    await flush()
    expect(d.autoUpdater.installs).toBe(1)
  })
  it('update-not-available → 已是最新版本', async () => {
    const d = base()
    const c = createUpdateController(d)
    await c.checkForUpdates()
    d.autoUpdater.emit('update-not-available', {})
    await flush()
    expect(d.dialog.messages).toContain('已是最新版本')
  })
  it('error → showErrorBox with message', async () => {
    const d = base()
    const c = createUpdateController(d)
    await c.checkForUpdates()
    d.autoUpdater.emit('error', new Error('boom'))
    await flush()
    expect(d.dialog.errors.some(([, c]) => c.includes('boom'))).toBe(true)
  })
  it('repeated checks register listeners once', async () => {
    const d = base()
    const c = createUpdateController(d)
    await c.checkForUpdates()
    await c.checkForUpdates()
    d.autoUpdater.emit('update-not-available', {})
    await flush()
    expect(d.dialog.messages.filter((m) => m === '已是最新版本')).toHaveLength(1)
  })
})
