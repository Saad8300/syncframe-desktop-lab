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
 * Longest duration a single timeline segment may be when resolving the Excel
 * Time-format ambiguity below. One hour sits far above any realistic image or
 * clip segment, and far below the multi-hour readings the mistaken
 * interpretation produces.
 */
const MAX_SEGMENT_SECONDS = 3600

/** Raw cell value above which the day-fraction reading exceeds one hour. */
const MAX_SERIAL_FRACTION = MAX_SEGMENT_SECONDS / 86400   // 0.0416667

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
 *      and unlike the others it "succeeded" silently. Resolved by the one-hour
 *      plausibility rule in the numeric branch below.
 *
 * Guarded by scripts/check_timeline_excel_parity.py.
 */
export function cellToText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return ''

  if (cell.t === 'e') return ''

  // Formula cell.
  //
  // Typing "+5" into a default-formatted cell makes Excel treat it as a
  // formula. It stores <f>+5</f> with a cached <v>5</v>, and SheetJS surfaces
  // that as {t:'n', v:5, f:'+5'}. Reading the cached value alone would hand
  // the parser "5", silently turning a RELATIVE end time (5s after the row's
  // start) into an ABSOLUTE one - a different clip length, or a row rejected
  // for ending before it starts. The leading sign only survives in `f`, so a
  // bare signed literal is read from there and passed through verbatim.
  //
  // Anything more complex (=A1+5, =SUM(...)) is a genuine computation whose
  // cached result IS the intended absolute number, so those fall through.
  if (cell.f !== undefined) {
    const body = String(cell.f).trim()
    if (/^[+-]?\d+(\.\d+)?$/.test(body)) return body
    if (cell.v === undefined && cell.w === undefined) return ''
  }

  if (cell.t === 'n' && typeof cell.v === 'number') {
    const fmt = typeof cell.z === 'string' ? cell.z : ''
    if (fmt && TIME_FORMAT_RE.test(fmt)) {
      // A time-formatted numeric cell is byte-identical whether the user typed
      // a clock time or a plain number of seconds: Excel stores {t:'n', v:0.5,
      // z:'h:mm:ss'} for both `0.5` and `12:00:00`. It is resolved by asking
      // which reading is plausible for a timeline segment.
      //
      //   day-fraction reading <= 1 hour  -> a real clock time, use it
      //   day-fraction reading  > 1 hour  -> absurd for one segment, so the
      //                                      user meant literal seconds
      //
      // 0.5 previously became 43,200s (12 hours) - wrong by 86,400x, and it
      // "succeeded", so nothing surfaced it. Under this rule 0.5 reads as
      // 0.5 seconds, while a genuine 0:01:26 (v=0.001) still reads as 86.4s.
      //
      // EDGE CASE, deliberate: raw values at or below 0.0416667 are read as
      // clock times, so a literal 0.001 or 0.01 seconds cannot be expressed in
      // a Time-formatted column - it would be indistinguishable from 0:01:26
      // and 0:14:24. Sub-0.04-second segments are not a real use case, and
      // every format still works from a Text-formatted column or a CSV. This
      // is documented for users in TIME_FORMAT_HELP.
      const asSeconds = serialToSeconds(cell.v)
      if (cell.v <= MAX_SERIAL_FRACTION && asSeconds <= MAX_SEGMENT_SECONDS) {
        return secondsToHms(asSeconds)
      }
      return String(cell.v)
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

  for (let r = range.s.r; r <= range.e.r; r++) {
    const cells: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      cells.push(csvEscape(cellToText(sheet[addr] as XLSX.CellObject | undefined)))
    }
    // Drop fully-blank rows; the CSV parser skips them too.
    if (cells.some(v => v !== '')) lines.push(cells.join(','))
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
