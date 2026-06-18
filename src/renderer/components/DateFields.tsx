import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { zhCN } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import { IconCalendar, IconClose } from './icons'
import { startOfDayMs, endOfDayMs, dateLabel, splitLocalInput, joinLocalInput } from '../date-util'

// Tint react-day-picker with the app's terracotta/paper tokens.
const CAL_VARS = {
  '--rdp-accent-color': 'var(--accent)',
  '--rdp-accent-background-color': 'var(--accent-soft)',
  '--rdp-today-color': 'var(--accent)',
  '--rdp-range_middle-background-color': 'var(--accent-soft)',
  '--rdp-range_middle-color': 'var(--accent-ink)',
  fontSize: '13px'
} as CSSProperties

/** Close-on-outside-click popover. */
function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return { open, setOpen, ref }
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="absolute left-0 top-full z-50 mt-1 rounded-xl2 border border-line bg-surface p-2 shadow-card" style={CAL_VARS}>{children}</div>
}

/** Date-range picker for the filter bar; from/to are epoch ms (day bounds) or null. */
export function DateRangeField({ from, to, onChange }: { from: number | null; to: number | null; onChange: (from: number | null, to: number | null) => void }) {
  const { open, setOpen, ref } = usePopover()
  const selected: DateRange | undefined = from != null ? { from: new Date(from), to: to != null ? new Date(to) : undefined } : undefined
  const active = from != null
  const label = active ? `${dateLabel(new Date(from!))} — ${to != null ? dateLabel(new Date(to)) : '…'}` : '申请时间'

  return (
    <div ref={ref} className="relative">
      <button className={`btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-sm ${active ? 'border-accent text-accent-ink' : ''}`} onClick={() => setOpen((o) => !o)}>
        <IconCalendar className="text-[15px]" />
        {label}
        {active && (
          <span role="button" tabIndex={0} className="ml-0.5 grid h-4 w-4 place-items-center rounded hover:bg-paper-2"
            title="清除" onClick={(e) => { e.stopPropagation(); onChange(null, null) }}>
            <IconClose className="text-[11px]" />
          </span>
        )}
      </button>
      {open && (
        <Panel>
          <DayPicker
            mode="range" locale={zhCN} showOutsideDays selected={selected}
            onSelect={(r) => onChange(r?.from ? startOfDayMs(r.from) : null, r?.to ? endOfDayMs(r.to) : null)}
          />
        </Panel>
      )}
    </div>
  )
}

/** Date + time picker for 申请时间; value/onChange use the datetime-local string (YYYY-MM-DDTHH:mm:ss). */
export function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { open, setOpen, ref } = usePopover()
  const { date, time } = splitLocalInput(value)

  return (
    <div ref={ref} className="relative">
      <button className="field tnum flex w-full items-center justify-between py-1.5 text-left" onClick={() => setOpen((o) => !o)}>
        <span className={date ? 'text-ink' : 'text-muted'}>{date ? `${dateLabel(date)} ${time}` : '未填写'}</span>
        <IconCalendar className="text-[15px] text-muted" />
      </button>
      {open && (
        <Panel>
          <DayPicker
            mode="single" locale={zhCN} showOutsideDays selected={date} defaultMonth={date}
            onSelect={(d) => { if (d) onChange(joinLocalInput(d, time || '00:00:00')) }}
          />
          <div className="mt-1 flex items-center gap-2 border-t border-line px-1 pt-2">
            <span className="text-xs text-muted">时间</span>
            <input type="time" step="1" className="field tnum h-7 py-1 text-xs" value={time || '00:00:00'} disabled={!date}
              onChange={(e) => { if (date) onChange(joinLocalInput(date, e.target.value)) }} />
            {date && (
              <button className="ml-auto grid h-6 w-6 place-items-center rounded text-muted hover:bg-paper-2 hover:text-ink" title="清除"
                onClick={() => { onChange(''); setOpen(false) }}><IconClose className="text-[13px]" /></button>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}
