import { useState } from 'react'
import type { NewTicket } from '@shared/types'
import { IconClose } from './icons'

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
    <div className="scrim">
      <div className="modal-card max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">新建售后单</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={() => { reset(); onCancel() }} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">售后单号 <span className="text-accent">*</span></span>
            <input className="field tnum" value={aftersaleNo} onChange={(e) => setAftersaleNo(e.target.value)} placeholder="必填" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">订单号</span>
            <input className="field tnum" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">发货单号</span>
            <input className="field tnum" value={shippingNo} onChange={(e) => setShippingNo(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">退货单号</span>
            <input className="field tnum" value={returnNo} onChange={(e) => setReturnNo(e.target.value)} />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => { reset(); onCancel() }}>取消</button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!aftersaleNo.trim()} onClick={submit}>创建</button>
        </div>
      </div>
    </div>
  )
}
