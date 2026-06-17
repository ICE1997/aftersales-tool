import { useEffect, useMemo, useState } from 'react'
import type { NewTicket, Ticket } from '@shared/types'
import type { ImportTicketsResult } from '@shared/types'
import { api } from '../api'
import { SearchBar } from '../components/SearchBar'
import { TicketTable } from '../components/TicketTable'
import { TicketDetail } from '../components/TicketDetail'
import { NewTicketDialog } from '../components/NewTicketDialog'
import { ImportResultDialog } from '../components/ImportResultDialog'
import { IconClose } from '../components/icons'
import { TicketFilterBar } from '../components/TicketFilterBar'
import { applyFilter, EMPTY_FILTER, type TicketFilter } from '../ticket-filter'

export function TicketsView() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selected, setSelected] = useState<string | undefined>()
  const [newOpen, setNewOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportTicketsResult | null>(null)
  const [filter, setFilter] = useState<TicketFilter>(EMPTY_FILTER)
  const filtered = useMemo(() => applyFilter(tickets, filter), [tickets, filter])

  async function load(q = query) { setTickets(q ? await api.searchTickets(q) : await api.listTickets()) }
  useEffect(() => { load('') }, [])

  function onSearch(q: string) { setQuery(q); load(q) }

  async function createTicket(t: NewTicket) {
    try { await api.createTicket(t); setNewOpen(false); setError(null); await load() }
    catch (e) { setError(`创建失败:${(e as Error).message}`) }
  }

  async function importTickets() {
    try {
      const r = await api.importTickets()
      if (r) { setImportResult(r); setError(null); await load() }
    } catch (e) { setError(`导入失败:${(e as Error).message}`) }
  }

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="flex animate-slidedown items-center justify-between gap-3 border-b border-danger-soft bg-danger-soft px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button className="rounded p-1 hover:bg-white/40" onClick={() => setError(null)} aria-label="关闭"><IconClose className="text-[14px]" /></button>
        </div>
      )}
      {/* List stays mounted (hidden in detail view) so pagination, sort and scroll position are preserved on return. */}
      <div className={`flex min-h-0 flex-1 flex-col ${view === 'detail' ? 'hidden' : ''}`}>
        <div className="shrink-0 border-b border-line bg-paper-2 px-6 py-3"><div className="max-w-xl"><SearchBar onSearch={onSearch} /></div></div>
        <TicketFilterBar filter={filter} onChange={setFilter} />
        <div className="flex min-h-0 flex-1 flex-col">
          <TicketTable tickets={filtered} selected={selected} onOpen={(no) => { setSelected(no); setView('detail') }} onNew={() => setNewOpen(true)} onImport={importTickets} />
        </div>
      </div>
      {view === 'detail' && selected && (
        <div className="flex-1 overflow-auto">
          <TicketDetail
            aftersaleNo={selected}
            onBack={() => setView('list')}
            onChanged={() => load()}
            onDeleted={() => { setView('list'); setSelected(undefined); load() }}
          />
        </div>
      )}
      <NewTicketDialog open={newOpen} onCreate={createTicket} onCancel={() => setNewOpen(false)} />
      <ImportResultDialog result={importResult} onClose={() => setImportResult(null)} />
    </div>
  )
}
