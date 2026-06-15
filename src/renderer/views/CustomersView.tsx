export function CustomersView({ onOpenTicket }: { onOpenTicket: (no: string) => void }) {
  void onOpenTicket
  return <div className="p-6 text-sm text-muted">客户模块开发中…</div>
}
