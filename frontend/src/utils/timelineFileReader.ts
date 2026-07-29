import * as XLSX from 'xlsx'

export interface TimelineFileText {
  csvText: string
  warnings: string[]
}

/**
 * Reads a timestamp table file as CSV text, accepting either a real .csv
 * (read directly) or an .xlsx workbook (converted via SheetJS, first sheet
 * only). Feeds the exact same string shape into the existing, unchanged
 * parseTimelineCsv — so .xlsx input gets identical validation to .csv,
 * whichever tool called it.
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
  const workbook = XLSX.read(buffer, { type: 'array' })

  const warnings: string[] = []
  if (workbook.SheetNames.length > 1) {
    warnings.push(
      `This workbook has ${workbook.SheetNames.length} sheets (${workbook.SheetNames.join(', ')}) — only the first sheet ("${workbook.SheetNames[0]}") was used.`
    )
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const csvText = XLSX.utils.sheet_to_csv(sheet)
  return { csvText, warnings }
}
