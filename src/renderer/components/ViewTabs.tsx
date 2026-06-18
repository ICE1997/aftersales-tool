import type { ReactNode } from 'react'

export interface ViewTab { key: string; label: string; count?: number }

interface Props {
  tabs: ViewTab[]
  active: string
  onChange: (key: string) => void
  /** Optional tab-contextual controls pinned to the right of the bar. */
  right?: ReactNode
}

/**
 * In-page section switch (underline style) — intentionally quieter than the
 * top-level pill nav so the hierarchy reads as "a view within this page".
 */
export function ViewTabs({ tabs, active, onChange, right }: Props) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-line bg-paper-2 px-6">
      <div role="tablist" className="flex items-stretch gap-5">
        {tabs.map((t) => {
          const on = t.key === active
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => onChange(t.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 py-2.5 font-display text-sm transition-colors ${
                on ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink-soft'
              }`}
            >
              {t.label}
              {t.count != null && (
                <span
                  className={`tnum rounded-full px-1.5 text-[11px] leading-5 ${
                    on ? 'bg-accent-soft text-accent-ink' : 'bg-paper text-muted'
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}
