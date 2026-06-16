import { app, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

/** Pure: the Chinese application-menu template. Unit-testable (does not use Electron runtime values). */
export function menuTemplate(
  opts: { isMac: boolean; isDev: boolean },
  onAbout: () => void = () => {}
): MenuItemConstructorOptions[] {
  const { isMac, isDev } = opts
  const t: MenuItemConstructorOptions[] = []

  if (isMac) {
    t.push({
      label: '售后酱',
      submenu: [
        { label: '关于售后酱', role: 'about' },
        { type: 'separator' },
        { label: '服务', role: 'services' },
        { type: 'separator' },
        { label: '隐藏售后酱', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出售后酱', role: 'quit' }
      ]
    })
  }

  t.push({
    label: '编辑',
    submenu: [
      { label: '撤销', role: 'undo' },
      { label: '重做', role: 'redo' },
      { type: 'separator' },
      { label: '剪切', role: 'cut' },
      { label: '复制', role: 'copy' },
      { label: '粘贴', role: 'paste' },
      { label: '全选', role: 'selectAll' }
    ]
  })

  const view: MenuItemConstructorOptions[] = [
    { label: '重新加载', role: 'reload' },
    { label: '强制重新加载', role: 'forceReload' },
    { type: 'separator' },
    { label: '实际大小', role: 'resetZoom' },
    { label: '放大', role: 'zoomIn' },
    { label: '缩小', role: 'zoomOut' },
    { type: 'separator' },
    { label: '进入全屏', role: 'togglefullscreen' }
  ]
  if (isDev) view.push({ type: 'separator' }, { label: '开发者工具', role: 'toggleDevTools' })
  t.push({ label: '视图', submenu: view })

  t.push({
    label: '窗口',
    submenu: isMac
      ? [
          { label: '最小化', role: 'minimize' },
          { label: '缩放', role: 'zoom' },
          { type: 'separator' },
          { label: '关闭', role: 'close' }
        ]
      : [
          { label: '最小化', role: 'minimize' },
          { label: '关闭', role: 'close' }
        ]
  })

  t.push({
    label: '帮助',
    submenu: [{ label: '关于售后酱', click: onAbout }]
  })

  return t
}

export function buildAppMenu(): Menu {
  return Menu.buildFromTemplate(
    menuTemplate({ isMac: process.platform === 'darwin', isDev: !app.isPackaged }, () => app.showAboutPanel())
  )
}
