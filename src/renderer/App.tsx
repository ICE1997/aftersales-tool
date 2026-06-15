import { useEffect, useState } from 'react'
import type { NewTicket, Ticket } from '@shared/types'
import { api } from './api'
import { SearchBar } from './components/SearchBar'
import { TicketTable } from './components/TicketTable'
import { TicketDetail } from './components/TicketDetail'
import { SettingsDialog } from './components/SettingsDialog'
import { NewTicketDialog } from './components/NewTicketDialog'
import { IconSettings, IconClose, IconBox } from './components/icons'

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [view, setView] = useState<'list' | 'detail'>('list')
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
    } catch (e) {
      setError(`创建失败:${(e as Error).message}`)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl2 bg-accent text-white shadow-sm">
            <IconBox className="text-[18px]" />
          </span>
          <div className="leading-tight">
            <div className="font-display text-[17px] font-extrabold tracking-tight">vhelper</div>
            <div className="-mt-0.5 text-[11px] text-muted">售后材料管理</div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-xl"><SearchBar onSearch={onSearch} /></div>
        <button className="btn-ghost shrink-0 px-3" onClick={() => setSettingsOpen(true)} aria-label="设置">
          <IconSettings className="text-[16px]" />
          <span className="hidden sm:inline">设置</span>
        </button>
      </header>

      {error && (
        <div className="flex animate-slidedown items-center justify-between gap-3 border-b border-danger-soft bg-danger-soft px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button className="rounded p-1 hover:bg-white/40" onClick={() => setError(null)} aria-label="关闭"><IconClose className="text-[14px]" /></button>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        {view === 'detail' && selected ? (
          <TicketDetail
            aftersaleNo={selected}
            onBack={() => setView('list')}
            onChanged={() => load()}
            onDeleted={() => { setView('list'); load() }}
          />
        ) : (
          <TicketTable
            tickets={tickets}
            query={query}
            onOpen={(no) => { setSelected(no); setView('detail') }}
            onNew={() => setNewOpen(true)}
          />
        )}
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewTicketDialog open={newOpen} onCreate={createTicket} onCancel={() => setNewOpen(false)} />
    </div>
  )
}
