import { useEffect, useState } from 'react'
import type { NewTicket, Ticket } from '@shared/types'
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
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load(q = query) { setTickets(q ? await api.searchTickets(q) : await api.listTickets()) }
  useEffect(() => { load('') }, [])

  function onSearch(q: string) { setQuery(q); load(q) }

  async function createTicket(t: NewTicket) {
    try {
      await api.createTicket(t)
      setNewOpen(false)
      setError(null)
      await load()
      setSelected(t.aftersaleNo)
    } catch (e) {
      setError(`创建失败:${(e as Error).message}`)
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b p-2">
        <div className="flex-1"><SearchBar onSearch={onSearch} /></div>
        <button className="rounded border px-3 py-2" onClick={() => setSettingsOpen(true)}>设置</button>
      </header>
      {error && (
        <div className="flex items-center justify-between bg-red-50 px-3 py-1 text-sm text-red-700">
          <span>{error}</span>
          <button className="text-red-500" onClick={() => setError(null)}>×</button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r"><TicketList tickets={tickets} selected={selected} onSelect={setSelected} onNew={() => setNewOpen(true)} /></aside>
        <main className="flex-1 overflow-hidden">
          {selected ? <TicketDetail aftersaleNo={selected} onChanged={() => load()} onDeleted={() => { setSelected(undefined); load() }} /> : <div className="p-6 text-gray-500">选择或新建一个售后单</div>}
        </main>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewTicketDialog open={newOpen} onCreate={createTicket} onCancel={() => setNewOpen(false)} />
    </div>
  )
}
