import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

/** Read the first worksheet of an .xlsx file into a 2-D array of trimmed-on-read strings.
 * `header:1` → array-of-arrays; `raw:false` → formatted text; `defval:''` → fill blanks.
 * Reads bytes via fs + `XLSX.read` rather than `XLSX.readFile`: SheetJS only attaches the
 * fs-backed `readFile` helper when it can resolve `fs` itself, which it cannot in the bundled
 * Electron main process — so `XLSX.readFile` is undefined there. `XLSX.read` is always present. */
export function parseXlsx(path: string): string[][] {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer' })
  const name = wb.SheetNames[0]
  const sheet = name ? wb.Sheets[name] : undefined
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
}

/** Read the first sheet of an .xlsx/.xls/.csv file into a 2-D string array. */
export function parseSheet(path: string): string[][] {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', codepage: 65001 })
  const name = wb.SheetNames[0]
  const sheet = name ? wb.Sheets[name] : undefined
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
}
