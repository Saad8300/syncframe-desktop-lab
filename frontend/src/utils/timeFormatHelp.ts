/**
 * SINGLE SOURCE OF TRUTH for the "Supported time formats" help shown to users.
 *
 * This text was previously duplicated verbatim in CsvGuide.tsx,
 * VideoTimelinePage.tsx and MediaTimelinePage.tsx, and all three had drifted
 * behind what the parser actually accepts — decimals below a second and the
 * decimal relative forms were supported but undocumented.
 *
 * Every entry below is covered by scripts/check_timeline_excel_parity.py, so
 * the documentation and the implementation are verified against each other
 * rather than kept in step by hand.
 */

export const TIME_FORMAT_HELP = {
  /** Absolute times, valid in both the start and end columns. */
  absolute: '5, 5.5, 0.5, 0.1, 0.01, 0.001, 00:05, 1:20, 00:01:20, 90s, 1m30s',

  /** Relative end times: "+" adds to that row's start. */
  relative: '+5, +0.5, +0.1, +0.01, +0.001, +1m30s',

  relativeExample:
    'Use + in the end column to add from the start. Example: start 00:10, end +5 means 10s to 15s.',

  /**
   * Excel-specific guidance. Formatting the timestamp columns as Text is the
   * reliable path, because Excel otherwise reinterprets what was typed.
   */
  excelNote:
    'Excel (.xlsx) accepts all of the above. For best results format the start/end columns as Text before typing, so Excel keeps your values exactly as entered.',

  /**
   * The one case Excel cannot represent, called out honestly rather than
   * failing silently. Matches MAX_SEGMENT_SECONDS in timelineFileReader.ts.
   */
  excelEdgeCase:
    'In a Time-formatted column, values are read as clock times when they represent under an hour, so durations below ~0.04 seconds need a Text-formatted column.',
} as const
