import { contextBridge, ipcRenderer } from 'electron'
import type { Ticket, Material, PickedFile, CreateMaterialPayload, NewTicket, RegionLevel, RegionCount, StatsSummary, ImportTicketsResult } from '../shared/types'

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
  listMaterials: (no: string): Promise<Material[]> => ipcRenderer.invoke('materials:list', no),
  removeMaterial: (id: number): Promise<void> => ipcRenderer.invoke('materials:remove', id),
  fileUrl: (relPath: string): Promise<string> => ipcRenderer.invoke('materials:fileUrl', relPath),
  pickFile: (): Promise<PickedFile | null> => ipcRenderer.invoke('materials:pickFile'),
  createMaterial: (no: string, payload: CreateMaterialPayload): Promise<Material> => ipcRenderer.invoke('materials:create', no, payload),
  exportFolder: (ids: number[]): Promise<boolean> => ipcRenderer.invoke('export:folder', ids),
  exportZip: (ids: number[]): Promise<boolean> => ipcRenderer.invoke('export:zip', ids),
  copyImage: (relPath: string): Promise<boolean> => ipcRenderer.invoke('clipboard:copyImage', relPath),
  copyMaterialPath: (relPath: string): Promise<string> => ipcRenderer.invoke('clipboard:copyMaterialPath', relPath),
  copyDirPath: (no: string, folder: string): Promise<string> => ipcRenderer.invoke('clipboard:copyDirPath', no, folder),
  calibrate: (no: string): Promise<number> => ipcRenderer.invoke('scan:calibrate', no),
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
  moveMaterial: (id: number, folder: string): Promise<void> => ipcRenderer.invoke('materials:move', id, folder),
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
