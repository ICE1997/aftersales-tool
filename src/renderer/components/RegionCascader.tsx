import { childrenOf } from '../region'

export interface RegionValue {
  provinceCode: string; province: string
  cityCode: string; city: string
  districtCode: string; district: string
}

export const EMPTY_REGION: RegionValue = {
  provinceCode: '', province: '', cityCode: '', city: '', districtCode: '', district: ''
}

const selCls = 'rounded-lg border border-line bg-surface px-2 py-2 text-sm'

export function RegionCascader({ value, onChange }: { value: RegionValue; onChange: (v: RegionValue) => void }) {
  const provinces = childrenOf('')
  const cities = value.provinceCode ? childrenOf(value.provinceCode) : []
  const districts = value.cityCode ? childrenOf(value.cityCode) : []

  function pickProvince(code: string) {
    const r = provinces.find((x) => x.code === code)
    onChange({ ...value, provinceCode: code, province: r?.name ?? '', cityCode: '', city: '', districtCode: '', district: '' })
  }
  function pickCity(code: string) {
    const r = cities.find((x) => x.code === code)
    onChange({ ...value, cityCode: code, city: r?.name ?? '', districtCode: '', district: '' })
  }
  function pickDistrict(code: string) {
    const r = districts.find((x) => x.code === code)
    onChange({ ...value, districtCode: code, district: r?.name ?? '' })
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <select className={selCls} value={value.provinceCode} onChange={(e) => pickProvince(e.target.value)}>
        <option value="">省</option>
        {provinces.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </select>
      <select className={selCls} value={value.cityCode} disabled={!value.provinceCode} onChange={(e) => pickCity(e.target.value)}>
        <option value="">市</option>
        {cities.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </select>
      <select className={selCls} value={value.districtCode} disabled={!value.cityCode} onChange={(e) => pickDistrict(e.target.value)}>
        <option value="">区县</option>
        {districts.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
      </select>
    </div>
  )
}
