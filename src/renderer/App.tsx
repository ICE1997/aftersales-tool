import { useEffect, useState } from 'react'
import type { Ticket, NewTicket } from '@shared/types'
import { api } from './api'
import { SearchBar } from './components/SearchBar'
import { TicketList } from './components/TicketList'
import { TicketDetail } from './components/TicketDetail'
import { SettingsDialog } from './components/SettingsDialog'
import { NewTicketDialog } from './components/NewTicketDialog'

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selected, setSelected] = useState<string | undefined>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  async function load(q = '') { setTickets(q ? await api.searchTickets(q) : await api.listTickets()) }
  useEffect(() => { load() }, [])

  async function createTicket(t: NewTicket) {
    await api.createTicket(t); setNewOpen(false); await load(); setSelected(t.aftersaleNo)
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b p-2">
        <div className="flex-1"><SearchBar onSearch={load} /></div>
        <button className="rounded border px-3 py-2" onClick={() => setSettingsOpen(true)}>设置</button>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r"><TicketList tickets={tickets} selected={selected} onSelect={setSelected} onNew={() => setNewOpen(true)} /></aside>
        <main className="flex-1 overflow-hidden">
          {selected ? <TicketDetail aftersaleNo={selected} onChanged={() => load()} /> : <div className="p-6 text-gray-500">选择或新建一个售后单</div>}
        </main>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewTicketDialog open={newOpen} onCreate={createTicket} onCancel={() => setNewOpen(false)} />
    </div>
  )
}
