interface Props {
  size?: number
  className?: string
}

// 售后酱 brand mark: the character 售 set in a terracotta squircle with a
// soft top sheen and rim light. Matches build/icon.svg (app icon) and
// public/favicon.svg. Gradient ids are scoped per-render to avoid clashes.
let seq = 0

export function Logo({ size = 36, className = '' }: Props) {
  const id = `logo${(seq = (seq + 1) % 1e6)}`
  const tile = `${id}t`
  const sheen = `${id}s`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="售后酱"
    >
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cf5b32" />
          <stop offset="1" stopColor="#a73b1e" />
        </linearGradient>
        <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.24" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="52" height="52" rx="15" fill={`url(#${tile})`} />
      <rect x="6" y="6" width="52" height="52" rx="15" fill={`url(#${sheen})`} />
      <rect
        x="6.9"
        y="6.9"
        width="50.2"
        height="50.2"
        rx="14.1"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.28"
        strokeWidth="1.3"
      />
      <text
        x="32"
        y="33.5"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif"
        fontSize="33"
        fontWeight="700"
        fill="#fdf3ea"
      >
        售
      </text>
    </svg>
  )
}
