import { useEffect, useState } from 'react'
import type { Customer, NewCustomer } from '@shared/types'
import { childrenOf } from '../region'
import { IconClose } from './icons'

interface Props { open: boolean; editing?: Customer; onSave: (c: NewCustomer) => void; onCancel: () => void }

const EMPTY: NewCustomer = {
  nickname: '', name: '', provinceCode: '', province: '', cityCode: '', city: '',
  districtCode: '', district: '', addressDetail: ''
}

export function CustomerDialog({ open, editing, onSave, onCancel }: Props) {
  const [f, setF] = useState<NewCustomer>(EMPTY)

  useEffect(() => {
    if (!open) return
    if (editing) {
      const { id, createdAt, updatedAt, ...rest } = editing
      void id; void createdAt; void updatedAt
      setF(rest)
    } else setF(EMPTY)
  }, [open, editing])

  if (!open) return null
  const valid = !!(f.nickname.trim() || f.name.trim())

  const provinces = childrenOf('')
  const cities = f.provinceCode ? childrenOf(f.provinceCode) : []
  const districts = f.cityCode ? childrenOf(f.cityCode) : []

  function pickProvince(code: string) {
    const r = provinces.find((x) => x.code === code)
    setF({ ...f, provinceCode: code, province: r?.name ?? '', cityCode: '', city: '', districtCode: '', district: '' })
  }
  function pickCity(code: string) {
    const r = cities.find((x) => x.code === code)
    setF({ ...f, cityCode: code, city: r?.name ?? '', districtCode: '', district: '' })
  }
  function pickDistrict(code: string) {
    const r = districts.find((x) => x.code === code)
    setF({ ...f, districtCode: code, district: r?.name ?? '' })
  }

  const selCls = 'rounded-lg border border-line bg-surface px-2 py-2 text-sm'

  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold tracking-tight">{editing ? '编辑客户' : '新建客户'}</h3>
          <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink" onClick={onCancel} aria-label="关闭"><IconClose className="text-[16px]" /></button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">昵称</span>
            <input className="field" value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} placeholder="昵称" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">姓名</span>
            <input className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="姓名" />
          </label>
          <div>
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">地区</span>
            <div className="grid grid-cols-3 gap-2">
              <select className={selCls} value={f.provinceCode} onChange={(e) => pickProvince(e.target.value)}>
                <option value="">省</option>
                {provinces.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
              <select className={selCls} value={f.cityCode} disabled={!f.provinceCode} onChange={(e) => pickCity(e.target.value)}>
                <option value="">市</option>
                {cities.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
              <select className={selCls} value={f.districtCode} disabled={!f.cityCode} onChange={(e) => pickDistrict(e.target.value)}>
                <option value="">区县</option>
                {districts.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">详细地址</span>
            <input className="field" value={f.addressDetail} onChange={(e) => setF({ ...f, addressDetail: e.target.value })} placeholder="详细地址" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel}>取消</button>
          <button className="btn-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!valid} onClick={() => onSave(f)}>保存</button>
        </div>
      </div>
    </div>
  )
}
