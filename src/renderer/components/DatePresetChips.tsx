import { PRESETS, type PresetKey } from '../date-presets'

interface Props { active: PresetKey | null; onSelect: (key: PresetKey) => void }

/** A row of quick-range chips; the active one is highlighted in the accent color. */
export function DatePresetChips({ active, onSelect }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((p) => {
        const on = p.key === active
        return (
          <button
            key={p.key}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(p.key)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              on ? 'bg-accent text-white' : 'btn-ghost text-ink-soft'
            }`}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
