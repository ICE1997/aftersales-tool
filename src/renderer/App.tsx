import { useEffect, useState } from 'react'
import { api } from './api'
import { SettingsDialog } from './components/SettingsDialog'
import { AboutDialog } from './components/AboutDialog'
import { TicketsView } from './views/TicketsView'
import { Logo } from './components/Logo'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)

  // 设置 / 关于 now live in the native menu bar; the menu sends us an event to open them.
  useEffect(() => api.onMenu((which) => {
    if (which === 'settings') setSettingsOpen(true)
    else if (which === 'about') setAboutOpen(true)
  }), [])

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex items-center gap-3 border-b border-line bg-paper-2 px-4 py-3">
        <Logo size={36} className="shrink-0 drop-shadow-sm" />
        <div className="leading-tight">
          <div className="font-display text-[17px] font-extrabold tracking-tight">售后酱</div>
          <div className="-mt-0.5 text-[11px] text-muted">售后材料管理</div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <TicketsView />
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  )
}
