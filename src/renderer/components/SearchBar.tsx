import { IconSearch } from './icons'

interface Props { onSearch: (q: string) => void }

export function SearchBar({ onSearch }: Props) {
  return (
    <div className="group relative">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-muted transition-colors group-focus-within:text-accent" />
      <input
        className="field pl-9"
        placeholder="搜索 售后单号 / 订单号 / 快递单号 / 收货人 / 手机号 / 售后类型 / 物流状态 等"
        onChange={(e) => onSearch(e.target.value)}
      />
    </div>
  )
}
