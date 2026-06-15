import { useEffect, useState } from 'react'
import type { Customer, CustomerRow, NewCustomer } from '@shared/types'
import { api } from '../api'
import { SearchBar } from '../components/SearchBar'
import { CustomerTable } from '../components/CustomerTable'
import { CustomerDetail } from '../components/CustomerDetail'
import { CustomerDialog } from '../components/CustomerDialog'

export function CustomersView({ onOpenTicket }: { onOpenTicket: (no: string) => void }) {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [selected, setSelected] = useState<number | undefined>()
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<{ open: boolean; editing?: Customer }>({ open: false })
  const [refreshTick, setRefreshTick] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function load(q = query) { setCustomers(q ? await api.searchCustomers(q) : await api.listCustomers()) }
  useEffect(() => { load('') }, [])
  function onSearch(q: string) { setQuery(q); load(q) }

  async function save(c: NewCustomer) {
    try {
      if (dialog.editing) await api.updateCustomer(dialog.editing.id, c)
      else await api.createCustomer(c)
      setDialog({ open: false })
      setError(null)
      setRefreshTick((t) => t + 1)
      await load()
    } catch (e) {
      setError(`保存失败:${(e as Error).message}`)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="flex items-center justify-between gap-3 border-b border-danger-soft bg-danger-soft px-4 py-2 text-sm text-danger">
          <span>{error}</span>
          <button className="text-danger" onClick={() => setError(null)}>×</button>
        </div>
      )}
      {view === 'detail' && selected != null ? (
        <div className="flex-1 overflow-auto">
          <CustomerDetail
            id={selected}
            onBack={() => setView('list')}
            onEdit={(c) => setDialog({ open: true, editing: c })}
            onDeleted={() => { setView('list'); load() }}
            onOpenTicket={onOpenTicket}
            refreshTick={refreshTick}
          />
        </div>
      ) : (
        <>
          <div className="border-b border-line bg-paper-2 px-6 py-3"><div className="max-w-xl"><SearchBar onSearch={onSearch} /></div></div>
          <div className="flex-1 overflow-auto">
            <CustomerTable customers={customers} query={query} onOpen={(id) => { setSelected(id); setView('detail') }} onNew={() => setDialog({ open: true })} />
          </div>
        </>
      )}
      <CustomerDialog open={dialog.open} editing={dialog.editing} onSave={save} onCancel={() => setDialog({ open: false })} />
    </div>
  )
}
