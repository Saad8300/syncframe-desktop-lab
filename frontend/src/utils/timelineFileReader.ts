import * as XLSX from 'xlsx'
import { parseTimeToSeconds } from './timelineTimeParser'

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
      // z:'h:mm:ss'} for both `0.5` and `12:00:00`.
      //
      // Resolved by reading `w` - the string Excel actually displays, i.e. what
      // the user typed and sees - and parsing it with parseTimeToSeconds, the
      // very function the CSV path uses. That gives CSV/Excel parity by
      // construction rather than by a second implementation agreeing.
      //
      // Reading the raw serial instead was wrong twice over:
      //
      //   * Excel stores a typed "0:03" under an h:mm format as 3 MINUTES,
      //     so the serial says 180s while the CSV parser reads the identical
      //     text "0:03" as 3 seconds. Every segment came out 60x too long.
      //
      //   * The plausibility test ran per cell, so a column climbing past
      //     1:00 flipped interpretation mid-way: rows below the boundary
      //     became clock times and rows above became raw decimals, producing
      //     "End time must be greater than start time" partway down a file
      //     that was perfectly consistent. Display strings are monotonic in
      //     the user's reading, so the whole column now parses one way.
      //
      // The raw number is still the fallback: a literal 0.5 in a time-formatted
      // cell displays as "12:00:00", which reads as 43,200s - implausible for
      // one segment - so the literal 0.5 seconds is used instead. That is the
      // 86,400x bug this guard exists for.
      const shown = typeof cell.w === 'string' ? cell.w.trim() : ''
      if (shown) {
        const secs = parseTimeToSeconds(shown, { allowRelative: false })
        if (secs !== null && secs <= MAX_SEGMENT_SECONDS) return shown
      } else {
        // No display string. SheetJS renders `w` from the number format when
        // cellNF is on, so this is rare, but an exotic format it cannot render
        // would otherwise drop straight to the raw serial and read a genuine
        // clock time as a tiny decimal. Fall back to interpreting the serial.
        const asSeconds = Math.round((cell.v - Math.floor(cell.v)) * 86400 * 1000) / 1000
        if (asSeconds > 0 && asSeconds <= MAX_SEGMENT_SECONDS) {
          const h = Math.floor(asSeconds / 3600)
          const m = Math.floor((asSeconds % 3600) / 60)
          const sec = asSeconds - h * 3600 - m * 60
          return `${h}:${String(m).padStart(2, '0')}:${(Math.round(sec * 100) / 100).toFixed(2).padStart(5, '0')}`
        }
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
    // Excel's "CSV UTF-8" export prepends a byte-order mark. file.text()
    // preserves it, so the first header arrives as "\uFEFFimage" rather than
    // "image", the required-column check fails to match it, and the upload is
    // rejected with "CSV missing required columns" - which is why some CSVs
    // worked and others did not, purely by how they were saved.
    //
    // Note this app writes BOMs itself: Script Timestamp's CSV export adds one
    // so Excel opens non-ASCII text correctly. Without stripping here, the app
    // could not read back a file it had just written.
    const raw = await file.text()
    return { csvText: raw.replace(/^\uFEFF/, ''), warnings: [] }
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
