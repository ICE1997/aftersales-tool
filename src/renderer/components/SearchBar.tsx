interface Props { onSearch: (q: string) => void }

export function SearchBar({ onSearch }: Props) {
  return (
    <input
      className="w-full rounded border px-3 py-2"
      placeholder="搜索售后单号 / 订单号 / 发货单号 / 退货单号"
      onChange={(e) => onSearch(e.target.value)}
    />
  )
}
