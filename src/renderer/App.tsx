import { useState } from 'react'
import { SettingsDialog } from './components/SettingsDialog'
import { TicketsView } from './views/TicketsView'
import { CustomersView } from './views/CustomersView'
import { StatsView } from './views/StatsView'
import { IconSettings, IconBox } from './components/icons'

type Tab = 'tickets' | 'customers' | 'stats'

export default function App() {
  const [tab, setTab] = useState<Tab>('tickets')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [jumpTicket, setJumpTicket] = useState<string | undefined>()

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl2 bg-accent text-white shadow-sm"><IconBox className="text-[18px]" /></span>
          <div className="leading-tight">
            <div className="font-display text-[17px] font-extrabold tracking-tight">vhelper</div>
            <div className="-mt-0.5 text-[11px] text-muted">售后材料管理</div>
          </div>
        </div>
        <nav className="ml-2 inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          <button className={`rounded-md px-3 py-1.5 ${tab === 'tickets' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setTab('tickets')}>售后单</button>
          <button className={`rounded-md px-3 py-1.5 ${tab === 'customers' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setTab('customers')}>客户</button>
          <button className={`rounded-md px-3 py-1.5 ${tab === 'stats' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setTab('stats')}>统计</button>
        </nav>
        <div className="flex-1" />
        <button className="btn-ghost shrink-0 px-3" onClick={() => setSettingsOpen(true)} aria-label="设置">
          <IconSettings className="text-[16px]" /><span className="hidden sm:inline">设置</span>
        </button>
      </header>

      <main className="flex-1 overflow-hidden">
        {tab === 'tickets'
          ? <TicketsView jumpTo={jumpTicket} onJumpHandled={() => setJumpTicket(undefined)} />
          : tab === 'customers'
          ? <CustomersView onOpenTicket={(no) => { setJumpTicket(no); setTab('tickets') }} />
          : <StatsView />}
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
