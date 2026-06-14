import { useEffect, useState } from 'react'
import type { NewTicket, Ticket } from '@shared/types'
import { api } from './api'
import { SearchBar } from './components/SearchBar'
import { TicketList } from './components/TicketList'
import { TicketDetail } from './components/TicketDetail'
import { SettingsDialog } from './components/SettingsDialog'
import { NewTicketDialog } from './components/NewTicketDialog'
import { IconSettings, IconClose, IconBox } from './components/icons'

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
        <button
          className="btn-ghost shrink-0 px-3"
          onClick={() => setSettingsOpen(true)}
          aria-label="设置"
        >
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

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-line bg-paper-2">
          <TicketList tickets={tickets} selected={selected} onSelect={setSelected} onNew={() => setNewOpen(true)} />
        </aside>
        <main className="flex-1 overflow-hidden">
          {selected ? (
            <TicketDetail
              aftersaleNo={selected}
              onChanged={() => load()}
              onDeleted={() => { setSelected(undefined); load() }}
            />
          ) : (
            <EmptyState />
          )}
        </main>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewTicketDialog open={newOpen} onCreate={createTicket} onCancel={() => setNewOpen(false)} />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl border border-line bg-paper-2 text-muted shadow-card">
        <IconBox className="text-[28px]" />
      </div>
      <div>
        <div className="font-display text-lg font-bold text-ink">选择或新建一个售后单</div>
        <p className="mt-1 max-w-xs text-sm text-muted">从左侧选择售后单查看材料,或新建一个开始归档视频与图片证据。</p>
      </div>
    </div>
  )
}
