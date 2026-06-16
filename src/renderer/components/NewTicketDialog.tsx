import { useState } from 'react'
import type { NewTicket } from '@shared/types'
import { IconClose } from './icons'
import { RegionCascader, EMPTY_REGION, type RegionValue } from './RegionCascader'
import { extractContact } from '../contact-extract'

interface Props { open: boolean; onCreate: (t: NewTicket) => void; onCancel: () => void }

export function NewTicketDialog({ open, onCreate, onCancel }: Props) {
  const [aftersaleNo, setAftersaleNo] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [shippingNo, setShippingNo] = useState('')
  const [returnNo, setReturnNo] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [phone, setPhone] = useState('')
  const [region, setRegion] = useState<RegionValue>(EMPTY_REGION)
  const [addressDetail, setAddressDetail] = useState('')
  const [extension, setExtension] = useState('')
  const [pasteText, setPasteText] = useState('')

  if (!open) return null
  const reset = () => {
    setAftersaleNo(''); setOrderNo(''); setShippingNo(''); setReturnNo('')
    setRecipientName(''); setPhone(''); setRegion(EMPTY_REGION); setAddressDetail('')
    setExtension(''); setPasteText('')
  }
  const submit = () => {
    const no = aftersaleNo.trim()
    if (!no) return
    onCreate({
      aftersaleNo: no, orderNo: orderNo.trim(), shippingNo: shippingNo.trim(), returnNo: returnNo.trim(), note: '',
      recipientName: recipientName.trim(), phone: phone.trim(), extension: extension.trim(),
      ...region, addressDetail: addressDetail.trim()
    })
    reset()
  }
  const recognize = () => {
    const r = extractContact(pasteText)
    if (r.name) setRecipientName(r.name)
    if (r.phone) setPhone(r.phone)
    if (r.extension) setExtension(r.extension)
    if (r.addressDetail) setAddressDetail(r.addressDetail)
    if (r.provinceCode) setRegion({
      provinceCode: r.provinceCode, province: r.province, cityCode: r.cityCode,
      city: r.city, districtCode: r.districtCode, district: r.district
    })
  }

  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">新建售后单</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={() => { reset(); onCancel() }} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>

        <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">售后单号 <span className="text-accent">*</span></span>
            <input className="field tnum" value={aftersaleNo} onChange={(e) => setAftersaleNo(e.target.value)} placeholder="必填" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">订单号</span>
            <input className="field tnum" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">发货快递单号</span>
            <input className="field tnum" value={shippingNo} onChange={(e) => setShippingNo(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">退货快递单号</span>
            <input className="field tnum" value={returnNo} onChange={(e) => setReturnNo(e.target.value)} />
          </label>

          <div className="border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">客户信息(选填)</div>
          <div>
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">粘贴识别</span>
            <textarea
              className="field h-16 resize-none"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="粘贴收货地址,自动识别姓名/电话/地址"
            />
            <button className="btn-ghost mt-1.5 px-3 py-1 text-xs disabled:opacity-50" disabled={!pasteText.trim()} onClick={recognize}>识别</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">收货人姓名</span>
              <input className="field" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">手机号</span>
              <input className="field tnum" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">分机号</span>
              <input className="field tnum" value={extension} onChange={(e) => setExtension(e.target.value)} />
            </label>
          </div>
          <div>
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">联系地址</span>
            <RegionCascader value={region} onChange={setRegion} />
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">详细地址</span>
            <input className="field" value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)} placeholder="街道门牌等" />
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
