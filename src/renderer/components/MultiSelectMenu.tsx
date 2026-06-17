import { useEffect, useRef, useState } from 'react'

interface Props {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}

/** A button showing `label` (+ a count badge when any selected) that opens a
 * checkbox popover. Closes on outside click. Pure string options. */
export function MultiSelectMenu({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])

  return (
    <div ref={ref} className="relative">
      <button
        className={`btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm ${selected.length ? 'border-accent text-accent-ink' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {selected.length > 0 && (
          <span className="tnum rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-tight text-white">{selected.length}</span>
        )}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 min-w-[180px] overflow-auto rounded-xl2 border border-line bg-surface p-1.5 shadow-card">
          {options.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper-2">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              <span className="text-ink">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
