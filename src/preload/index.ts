import { contextBridge, ipcRenderer } from 'electron'
import type { Ticket, Material, MaterialKind, PickedFile, CreateMaterialPayload, NewTicket, RegionLevel, RegionCount, StatsSummary, ImportTicketsResult } from '../shared/types'

const api = {
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  /** Subscribe to native-menu actions (设置/关于). Returns an unsubscribe fn. */
  onMenu: (cb: (which: string) => void): (() => void) => {
    const h = (_e: unknown, which: string): void => cb(which)
    ipcRenderer.on('menu:open', h)
    return () => ipcRenderer.removeListener('menu:open', h)
  },
  listTickets: (): Promise<Ticket[]> => ipcRenderer.invoke('tickets:list'),
  searchTickets: (q: string): Promise<Ticket[]> => ipcRenderer.invoke('tickets:search', q),
  getTicket: (no: string): Promise<Ticket | undefined> => ipcRenderer.invoke('tickets:get', no),
  createTicket: (t: NewTicket): Promise<void> => ipcRenderer.invoke('tickets:create', t),
  updateTicket: (no: string, patch: Partial<Ticket>): Promise<void> => ipcRenderer.invoke('tickets:update', no, patch),
  importTickets: (): Promise<ImportTicketsResult | null> => ipcRenderer.invoke('tickets:import'),
  deleteTicket: (no: string): Promise<void> => ipcRenderer.invoke('tickets:delete', no),
  listMaterials: (no: string): Promise<{ folders: string[]; materials: Material[] }> => ipcRenderer.invoke('materials:list', no),
  thumbFor: (relPath: string, kind: MaterialKind, mtimeMs: number, sizeBytes: number): Promise<string | null> => ipcRenderer.invoke('materials:thumb', relPath, kind, mtimeMs, sizeBytes),
  removeMaterial: (relPath: string): Promise<void> => ipcRenderer.invoke('materials:remove', relPath),
  fileUrl: (relPath: string): Promise<string> => ipcRenderer.invoke('materials:fileUrl', relPath),
  pickFile: (): Promise<PickedFile | null> => ipcRenderer.invoke('materials:pickFile'),
  createMaterial: (no: string, payload: CreateMaterialPayload): Promise<Material> => ipcRenderer.invoke('materials:create', no, payload),
  watchMaterials: (no: string): Promise<void> => ipcRenderer.invoke('materials:watch', no),
  unwatchMaterials: (): Promise<void> => ipcRenderer.invoke('materials:unwatch'),
  /** Subscribe to filesystem-change notifications for a ticket. Returns an unsubscribe fn. */
  onMaterialsChanged: (cb: (no: string) => void): (() => void) => {
    const h = (_e: unknown, no: string): void => cb(no)
    ipcRenderer.on('materials:changed', h)
    return () => ipcRenderer.removeListener('materials:changed', h)
  },
  exportFolder: (relPaths: string[], folders: string[] = []): Promise<boolean> => ipcRenderer.invoke('export:folder', relPaths, folders),
  exportZip: (relPaths: string[], folders: string[] = []): Promise<boolean> => ipcRenderer.invoke('export:zip', relPaths, folders),
  copyImage: (relPath: string): Promise<boolean> => ipcRenderer.invoke('clipboard:copyImage', relPath),
  copyMaterialPath: (relPath: string): Promise<string> => ipcRenderer.invoke('clipboard:copyMaterialPath', relPath),
  copyDirPath: (no: string, folder: string): Promise<string> => ipcRenderer.invoke('clipboard:copyDirPath', no, folder),
  getDataRoot: (): Promise<string> => ipcRenderer.invoke('settings:getDataRoot'),
  chooseDataRoot: (): Promise<boolean> => ipcRenderer.invoke('settings:chooseDataRoot'),
  showItem: (relPath: string): Promise<void> => ipcRenderer.invoke('shell:showItem', relPath),
  openInChrome: (url: string): Promise<void> => ipcRenderer.invoke('shell:openChrome', url),
  openMaterialDir: (no: string, folder: string): Promise<void> => ipcRenderer.invoke('shell:openMaterialDir', no, folder),
  regionCounts: (level: RegionLevel): Promise<RegionCount[]> => ipcRenderer.invoke('stats:regionCounts', level),
  statsSummary: (): Promise<StatsSummary> => ipcRenderer.invoke('stats:summary'),
  listFolders: (no: string): Promise<string[]> => ipcRenderer.invoke('folders:list', no),
  createFolder: (no: string, path: string): Promise<void> => ipcRenderer.invoke('folders:create', no, path),
  renameFolder: (no: string, path: string, newName: string): Promise<void> => ipcRenderer.invoke('folders:rename', no, path, newName),
  removeFolder: (no: string, path: string): Promise<void> => ipcRenderer.invoke('folders:remove', no, path),
  moveMaterial: (no: string, relPath: string, newFolder: string): Promise<void> => ipcRenderer.invoke('materials:move', no, relPath, newFolder),
  moveFolder: (no: string, path: string, newParent: string): Promise<void> => ipcRenderer.invoke('folders:move', no, path, newParent),
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
