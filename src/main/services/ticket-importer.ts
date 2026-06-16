import * as XLSX from 'xlsx'

/** Read the first worksheet of an .xlsx file into a 2-D array of trimmed-on-read strings.
 * `header:1` → array-of-arrays; `raw:false` → formatted text; `defval:''` → fill blanks. */
export function parseXlsx(path: string): string[][] {
  const wb = XLSX.readFile(path)
  const name = wb.SheetNames[0]
  const sheet = name ? wb.Sheets[name] : undefined
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
}
