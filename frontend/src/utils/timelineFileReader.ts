import * as XLSX from 'xlsx'

export interface TimelineFileText {
  csvText: string
  warnings: string[]
}

/**
 * Excel time/date number formats. A numeric cell carrying one of these holds a
 * fraction-of-a-day serial, not a duration in seconds.
 */
const TIME_FORMAT_RE = /(\[)?[hH]+(\]|:)|AM\/PM|A\/P|\bmm?\b.*\bss\b|yy|dd/

/**
 * Marker emitted for a time-formatted numeric cell, whose intent cannot be
 * recovered from the file. sheetToCsvText turns these into a hard error naming
 * the offending cells rather than letting a wrong duration through.
 */
export const AMBIGUOUS_TIME = '\u0000AMBIGUOUS_TIME'

/** Excel serial (fraction of a 24h day) -> seconds. */
function serialToSeconds(serial: number): number {
  // Only the time-of-day part matters; a whole-day component would be a date,
  // which is not a valid timeline duration anyway.
  const frac = serial - Math.floor(serial)
  return Math.round(frac * 86400 * 1000) / 1000
}

/** Seconds -> "H:MM:SS.ss", a format the CSV parser already accepts. */
function secondsToHms(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total - h * 3600 - m * 60
  const ss = (Math.round(s * 100) / 100).toFixed(2).padStart(5, '0')
  return `${h}:${String(m).padStart(2, '0')}:${ss}`
}

function csvEscape(v: string): string {
  if (v === '') return ''
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * Convert one Excel cell to the text the CSV parser would have seen for the
 * same intent.
 *
 * Reading `sheet_to_csv`'s *display* strings instead of raw values caused three
 * separate defects:
 *
 *   1. `+5` typed into a default cell becomes a FORMULA (`=5`). SheetJS emitted
 *      an empty string, so relative end times silently vanished. Now recovered
 *      from the cached value or the formula text.
 *   2. A plain number rendered with a display format (`30` shown as `30.00`)
 *      round-tripped through its formatted string. Now read as the raw number.
 *   3. Worst: a plain number in a time-formatted cell. `0.5` (half a second)
 *      displays as `12:00:00` and parsed as 43,200 seconds — wrong by 86,400x,
 *      and unlike the others it "succeeded" silently. That whole class is now
 *      refused rather than guessed at; see AMBIGUOUS_TIME.
 *
 * Guarded by scripts/check_timeline_excel_parity.py.
 */
export function cellToText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return ''

  // Formula cell: prefer the cached result, fall back to the formula body.
  if (cell.t === 'e') return ''
  if (cell.f !== undefined && cell.v === undefined && cell.w === undefined) {
    const body = String(cell.f).trim()
    return /^[+-]?\d+(\.\d+)?$/.test(body) ? body : ''
  }

  if (cell.t === 'n' && typeof cell.v === 'number') {
    const fmt = typeof cell.z === 'string' ? cell.z : ''
    if (fmt && TIME_FORMAT_RE.test(fmt)) {
      // AMBIGUOUS — and deliberately not guessed at.
      //
      // A time-formatted numeric cell is byte-identical whether the user
      // typed 0.5 meaning half a second, or typed 12:00:00 meaning half a
      // day. Excel stores {t:'n', v:0.5, z:'h:mm:ss'} either way. There is no
      // signal in the file that separates them.
      //
      // The old code silently picked one reading and turned 0.5 seconds into
      // 43,200 — wrong by 86,400x, with no error. Refusing is the only safe
      // answer, and it matches how the CSV parser already handles Excel's
      // AM/PM coercion: tell the user to format the column as Text.
      return AMBIGUOUS_TIME
    }
    // A plain number is a plain number, whatever decimals the cell displays.
    return String(cell.v)
  }

  if (cell.t === 'b') return cell.v ? 'TRUE' : 'FALSE'
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v
    return secondsToHms(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000)
  }

  // Text cell: use the raw string, not the formatted one. Excel stores a
  // leading apostrophe as a format hint, never as content.
  const raw = cell.v !== undefined ? String(cell.v) : String(cell.w ?? '')
  return raw.replace(/^'/, '').trim()
}

/** Convert a worksheet to CSV text using raw cell values. */
export function sheetToCsvText(sheet: XLSX.WorkSheet): string {
  const ref = sheet['!ref']
  if (!ref) return ''
  const range = XLSX.utils.decode_range(ref)
  const lines: string[] = []
  const ambiguous: string[] = []

  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const text = cellToText(sheet[addr] as XLSX.CellObject | undefined)
      if (text === AMBIGUOUS_TIME) {
        ambiguous.push(addr)
        cells.push('')
      } else {
        cells.push(csvEscape(text))
      }
    }
    // Drop fully-blank rows; the CSV parser skips them too.
    if (cells.some(v => v !== '')) lines.push(cells.join(','))
  }

  if (ambiguous.length) {
    const shown = ambiguous.slice(0, 8).join(', ')
    const more = ambiguous.length > 8 ? ` (and ${ambiguous.length - 8} more)` : ''
    throw new Error(
      `Excel stored ${ambiguous.length} timestamp cell(s) as clock times, so their ` +
      `intended duration can't be read reliably: ${shown}${more}. ` +
      `Select the start/end columns in Excel, set their format to Text, re-enter ` +
      `the values, and save again.`
    )
  }
  return lines.join('\n')
}

/**
 * Reads a timestamp table file as CSV text, accepting either a real .csv
 * (read directly) or an .xlsx workbook (first sheet only). Feeds the exact
 * same string shape into the existing, unchanged parseTimelineCsv — so .xlsx
 * input gets identical validation to .csv, whichever tool called it.
 *
 * Multi-sheet workbooks use the first sheet and return a warning; there's
 * no reliable way to know which sheet the user intended.
 */
export async function readTimelineFileAsCsvText(file: File): Promise<TimelineFileText> {
  const isXlsx = file.name.toLowerCase().endsWith('.xlsx')

  if (!isXlsx) {
    return { csvText: await file.text(), warnings: [] }
  }

  const buffer = await file.arrayBuffer()
  // cellFormula/cellNF are needed to recover formula cells and to see each
  // cell's number format, which is how a real time serial is told apart from
  // a plain number that merely happens to be displayed as a time.
  const workbook = XLSX.read(buffer, { type: 'array', cellFormula: true, cellNF: true })

  const warnings: string[] = []
  if (workbook.SheetNames.length > 1) {
    warnings.push(
      `This workbook has ${workbook.SheetNames.length} sheets (${workbook.SheetNames.join(', ')}) — only the first sheet ("${workbook.SheetNames[0]}") was used.`
    )
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return { csvText: sheetToCsvText(sheet), warnings }
}
