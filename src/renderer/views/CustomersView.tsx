import { useEffect, useState } from 'react'
import type { CustomerSummary } from '@shared/types'
import { api } from '../api'
import { SearchBar } from '../components/SearchBar'
import { CustomerTable } from '../components/CustomerTable'
import { CustomerDetail } from '../components/CustomerDetail'

export function CustomersView({ onOpenTicket }: { onOpenTicket: (no: string) => void }) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [selected, setSelected] = useState<CustomerSummary | undefined>()
  const [query, setQuery] = useState('')

  async function load(q = query) { setCustomers(q ? await api.searchCustomers(q) : await api.listCustomers()) }
  useEffect(() => { load('') }, [])
  function onSearch(q: string) { setQuery(q); load(q) }

  return (
    <div className="flex h-full flex-col">
      {selected ? (
        <div className="flex-1 overflow-auto">
          <CustomerDetail summary={selected} onBack={() => setSelected(undefined)} onOpenTicket={onOpenTicket} />
        </div>
      ) : (
        <>
          <div className="border-b border-line bg-paper-2 px-6 py-3"><div className="max-w-xl"><SearchBar onSearch={onSearch} /></div></div>
          <div className="flex-1 overflow-auto">
            <CustomerTable customers={customers} query={query} onOpen={(nickname) => {
              const c = customers.find((x) => x.nickname === nickname)
              if (c) setSelected(c)
            }} />
          </div>
        </>
      )}
    </div>
  )
}
