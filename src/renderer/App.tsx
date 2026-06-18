import { useState } from 'react'
import { SettingsDialog } from './components/SettingsDialog'
import { TicketsView } from './views/TicketsView'
import { StatsView } from './views/StatsView'
import { IconSettings } from './components/icons'
import { Logo } from './components/Logo'
import { useSessionState } from './use-session-state'

type Tab = 'tickets' | 'stats'

export default function App() {
  const [tab, setTab] = useSessionState<Tab>('vh.tab', 'tickets')
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-line bg-paper-2 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2.5">
          <Logo size={36} className="shrink-0 drop-shadow-sm" />
          <div className="leading-tight">
            <div className="font-display text-[17px] font-extrabold tracking-tight">售后酱</div>
            <div className="-mt-0.5 text-[11px] text-muted">售后材料管理</div>
          </div>
        </div>
        <nav className="ml-2 inline-flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          <button className={`rounded-md px-3 py-1.5 ${tab === 'tickets' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setTab('tickets')}>售后单</button>
          <button className={`rounded-md px-3 py-1.5 ${tab === 'stats' ? 'bg-accent text-white shadow-sm' : 'text-muted'}`} onClick={() => setTab('stats')}>统计</button>
        </nav>
        <div className="flex-1" />
        <button className="btn-ghost shrink-0 px-3" onClick={() => setSettingsOpen(true)} aria-label="设置">
          <IconSettings className="text-[16px]" /><span className="hidden sm:inline">设置</span>
        </button>
      </header>

      <main className="flex-1 overflow-hidden">
        {tab === 'tickets' ? <TicketsView /> : <StatsView />}
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
