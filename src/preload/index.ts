import { contextBridge, ipcRenderer } from 'electron'
import type { Ticket, Material, PickedFile, CreateMaterialPayload, NewTicket, Customer, NewCustomer, CustomerRow, RegionLevel, RegionCount, StatsSummary } from '../shared/types'

const api = {
  listTickets: (): Promise<Ticket[]> => ipcRenderer.invoke('tickets:list'),
  searchTickets: (q: string): Promise<Ticket[]> => ipcRenderer.invoke('tickets:search', q),
  getTicket: (no: string): Promise<Ticket | undefined> => ipcRenderer.invoke('tickets:get', no),
  createTicket: (t: NewTicket): Promise<void> => ipcRenderer.invoke('tickets:create', t),
  updateTicket: (no: string, patch: Partial<Ticket>): Promise<void> => ipcRenderer.invoke('tickets:update', no, patch),
  deleteTicket: (no: string): Promise<void> => ipcRenderer.invoke('tickets:delete', no),
  listMaterials: (no: string): Promise<Material[]> => ipcRenderer.invoke('materials:list', no),
  removeMaterial: (id: number): Promise<void> => ipcRenderer.invoke('materials:remove', id),
  fileUrl: (relPath: string): Promise<string> => ipcRenderer.invoke('materials:fileUrl', relPath),
  pickFile: (): Promise<PickedFile | null> => ipcRenderer.invoke('materials:pickFile'),
  createMaterial: (no: string, payload: CreateMaterialPayload): Promise<Material> => ipcRenderer.invoke('materials:create', no, payload),
  exportFolder: (ids: number[]): Promise<boolean> => ipcRenderer.invoke('export:folder', ids),
  exportZip: (ids: number[]): Promise<boolean> => ipcRenderer.invoke('export:zip', ids),
  copyImage: (relPath: string): Promise<boolean> => ipcRenderer.invoke('clipboard:copyImage', relPath),
  calibrate: (no: string): Promise<number> => ipcRenderer.invoke('scan:calibrate', no),
  getDataRoot: (): Promise<string> => ipcRenderer.invoke('settings:getDataRoot'),
  chooseDataRoot: (): Promise<boolean> => ipcRenderer.invoke('settings:chooseDataRoot'),
  showItem: (relPath: string): Promise<void> => ipcRenderer.invoke('shell:showItem', relPath),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  listCustomers: (): Promise<CustomerRow[]> => ipcRenderer.invoke('customers:list'),
  searchCustomers: (q: string): Promise<CustomerRow[]> => ipcRenderer.invoke('customers:search', q),
  getCustomer: (id: number): Promise<Customer | undefined> => ipcRenderer.invoke('customers:get', id),
  createCustomer: (c: NewCustomer): Promise<number> => ipcRenderer.invoke('customers:create', c),
  updateCustomer: (id: number, patch: Partial<NewCustomer>): Promise<void> => ipcRenderer.invoke('customers:update', id, patch),
  deleteCustomer: (id: number): Promise<void> => ipcRenderer.invoke('customers:delete', id),
  customerTickets: (id: number): Promise<Ticket[]> => ipcRenderer.invoke('customers:ticketsOf', id),
  setTicketCustomer: (no: string, customerId: number | null): Promise<void> => ipcRenderer.invoke('tickets:setCustomer', no, customerId),
  regionCounts: (level: RegionLevel): Promise<RegionCount[]> => ipcRenderer.invoke('stats:regionCounts', level),
  statsSummary: (): Promise<StatsSummary> => ipcRenderer.invoke('stats:summary')
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
