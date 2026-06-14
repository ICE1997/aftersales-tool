import { useState } from 'react'
import type { NewTicket } from '@shared/types'

interface Props { open: boolean; onCreate: (t: NewTicket) => void; onCancel: () => void }

export function NewTicketDialog({ open, onCreate, onCancel }: Props) {
  const [aftersaleNo, setAftersaleNo] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [shippingNo, setShippingNo] = useState('')
  const [returnNo, setReturnNo] = useState('')
  if (!open) return null
  const reset = () => { setAftersaleNo(''); setOrderNo(''); setShippingNo(''); setReturnNo('') }
  const submit = () => {
    const no = aftersaleNo.trim()
    if (!no) return
    onCreate({ aftersaleNo: no, orderNo: orderNo.trim(), shippingNo: shippingNo.trim(), returnNo: returnNo.trim(), note: '' })
    reset()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded bg-white p-4">
        <h3 className="mb-3 font-semibold">新建售后单</h3>
        <label className="mb-1 block text-sm">售后单号 *</label>
        <input className="mb-3 w-full rounded border px-2 py-1" value={aftersaleNo} onChange={(e) => setAftersaleNo(e.target.value)} placeholder="必填" />
        <label className="mb-1 block text-sm">订单号</label>
        <input className="mb-3 w-full rounded border px-2 py-1" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
        <label className="mb-1 block text-sm">发货单号</label>
        <input className="mb-3 w-full rounded border px-2 py-1" value={shippingNo} onChange={(e) => setShippingNo(e.target.value)} />
        <label className="mb-1 block text-sm">退货单号</label>
        <input className="mb-4 w-full rounded border px-2 py-1" value={returnNo} onChange={(e) => setReturnNo(e.target.value)} />
        <div className="flex justify-end gap-2">
          <button className="rounded border px-3 py-1" onClick={() => { reset(); onCancel() }}>取消</button>
          <button className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50" disabled={!aftersaleNo.trim()} onClick={submit}>创建</button>
        </div>
      </div>
    </div>
  )
}
