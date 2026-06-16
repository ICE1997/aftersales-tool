import { useEffect, useState } from 'react'
import type { NewTicket, Ticket } from '@shared/types'
import { api } from '../api'
import { SearchBar } from '../components/SearchBar'
import { TicketTable } from '../components/TicketTable'
import { TicketDetail } from '../components/TicketDetail'
import { NewTicketDialog } from '../components/NewTicketDialog'
import { IconClose } from '../components/icons'

export function TicketsView() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selected, setSelected] = useState<string | undefined>()
  const [newOpen, setNewOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load(q = query) { setTickets(q ? await api.searchTickets(q) : await api.listTickets()) }
  useEffect(() => { load('') }, [])

  function onSearch(q: string) { setQuery(q); load(q) }

  async function createTicket(t: NewTicket) {
    try { await api.createTicket(t); setNewOpen(false); setError(null); await load() }
    catch (e) { setError(`创建失败:${(e as Error).message}`) }
  }

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="flex animate-slidedown items-center justify-between gap-3 border-b border-danger-soft bg-danger-soft px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button className="rounded p-1 hover:bg-white/40" onClick={() => setError(null)} aria-label="关闭"><IconClose className="text-[14px]" /></button>
        </div>
      )}
      {view === 'detail' && selected ? (
        <div className="flex-1 overflow-auto">
          <TicketDetail
            aftersaleNo={selected}
            onBack={() => setView('list')}
            onChanged={() => load()}
            onDeleted={() => { setView('list'); load() }}
          />
        </div>
      ) : (
        <>
          <div className="border-b border-line bg-paper-2 px-6 py-3"><div className="max-w-xl"><SearchBar onSearch={onSearch} /></div></div>
          <div className="flex-1 overflow-auto">
            <TicketTable tickets={tickets} query={query} onOpen={(no) => { setSelected(no); setView('detail') }} onNew={() => setNewOpen(true)} />
          </div>
        </>
      )}
      <NewTicketDialog open={newOpen} onCreate={createTicket} onCancel={() => setNewOpen(false)} />
    </div>
  )
}
