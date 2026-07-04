export type ParsedRow = {
  start: number;
  end: number;
  file: string;
  text: string;
};

export type ParseResult = {
  success: boolean;
  rows: ParsedRow[];
  totalDurationSeconds: number; // raw total duration
  errors: string[];
  warnings: string[];
  normalizedCsv: string; // The normalized CSV string that can be uploaded
};

export function parseTimeToSeconds(timeStr: string, options?: { allowRelative?: boolean }): number | null {
  if (!timeStr) return null;
  const t = timeStr.trim().toLowerCase();
  
  const isRelative = t.startsWith('+');
  const strToParse = isRelative ? t.substring(1) : t;
  
  if (isRelative && !options?.allowRelative) {
    return null; // rejected
  }

  // handle raw numbers or simple decimals
  if (/^\d+(\.\d+)?$/.test(strToParse)) {
    return parseFloat(strToParse);
  }

  // Check if Excel exported an AM/PM clock time
  if (t.includes('am') || t.includes('pm')) {
    return NaN; // Let validation handle this specifically later, or throw
  }

  // hh:mm:ss or mm:ss or mm:ss.ms
  const hmsRegex = /^(?:(?:(\d+):)?(\d{1,2}):)?(\d{1,2}(?:\.\d+)?)$/;
  const hmsMatch = strToParse.match(hmsRegex);
  if (hmsMatch) {
    const p1 = hmsMatch[1];
    const p2 = hmsMatch[2];
    const p3 = hmsMatch[3];

    // If 3 parts: HH:MM:SS
    if (p1 !== undefined) {
      const h = parseInt(p1, 10);
      const m = parseInt(p2, 10);
      const s = parseFloat(p3);
      return h * 3600 + m * 60 + s;
    }
    // If 2 parts: MM:SS
    else if (p2 !== undefined) {
      const m = parseInt(p2, 10);
      const s = parseFloat(p3);
      return m * 60 + s;
    }
    // If 1 part: SS (caught by simple decimals above, but just in case)
    else {
      return parseFloat(p3);
    }
  }

  // Handle s, m, min, sec formats
  const minSecRegex = /^(?:(\d+)\s*(?:m|min|mins|minutes))?\s*(?:(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds))?$/;
  const minSecMatch = strToParse.match(minSecRegex);
  if (minSecMatch && (minSecMatch[1] || minSecMatch[2])) {
    const m = parseInt(minSecMatch[1] || "0", 10);
    const s = parseFloat(minSecMatch[2] || "0");
    return m * 60 + s;
  }

  return null;
}

export function formatSecondsForDisplay(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  const sStr = s % 1 === 0 ? s.toString().padStart(2, '0') : s.toFixed(3).padStart(6, '0');
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${sStr}`;
  }
  return `${m}:${sStr}`;
}

export function validateTimelineRows(rows: ParsedRow[]): string[] {
  const errors: string[] = [];
  rows.forEach((r, i) => {
    if (r.end <= r.start) {
      errors.push(`Row ${i + 2}: End time must be greater than start time.`);
    }
  });
  return errors;
}

// simple CSV parser handling quotes
export function parseCSVLine(line: string): string[] {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function escapeCSVField(field: string): string {
  if (field === undefined || field === null) return "";
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function parseTimelineCsv(csvText: string, timelineType: 'image' | 'media' | 'video'): ParseResult {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) {
    return { success: false, rows: [], totalDurationSeconds: 0, errors: ["Timeline CSV must contain a header and at least one row."], warnings: [], normalizedCsv: "" };
  }

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  
  // Find column indices
  let startCol = -1, endCol = -1, fileCol = -1, textCol = -1;
  const startAliases = ['start', 'start_time', 'starttime'];
  const endAliases = ['end', 'end_time', 'endtime'];
  const fileAliases = ['image', 'asset', 'video', 'file', 'media', 'path'];
  const textAliases = ['text', 'caption', 'script'];

  headers.forEach((h, i) => {
    if (startAliases.includes(h)) startCol = i;
    else if (endAliases.includes(h)) endCol = i;
    else if (fileAliases.includes(h)) fileCol = i;
    else if (textAliases.includes(h)) textCol = i;
  });

  if (startCol === -1 || endCol === -1 || fileCol === -1) {
    return { success: false, rows: [], totalDurationSeconds: 0, errors: ["CSV missing required columns. Ensure it has start, end, and file/asset/video/image columns."], warnings: [], normalizedCsv: "" };
  }

  const parsedRows: ParsedRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let previousRowEnd = 0;

  for (let i = 1; i < lines.length; i++) {
    const rowLine = lines[i];
    const columns = parseCSVLine(rowLine);
    const rowNum = i + 1;

    if (columns.length === 1 && columns[0].trim() === "") continue;

    const startStr = (columns[startCol] || "").trim();
    const endStr = (columns[endCol] || "").trim();
    const file = (columns[fileCol] || "").trim();
    const text = textCol !== -1 ? (columns[textCol] || "").trim() : "";

    if (!file && !text) {
      errors.push(`Row ${rowNum}: Both File and Text are missing. At least one is required.`);
      continue;
    }

    if (!endStr) {
      errors.push(`Row ${rowNum}: Missing end time.`);
      continue;
    }
    
    // Check for Excel AM/PM format
    if (endStr.toLowerCase().includes('am') || endStr.toLowerCase().includes('pm') ||
        startStr.toLowerCase().includes('am') || startStr.toLowerCase().includes('pm')) {
      errors.push(`Excel converted your timestamp into a clock time. Format the start/end columns as Text before exporting CSV.`);
      continue;
    }

    let startSec: number;
    let endSec: number;

    const isRelativeEnd = endStr.startsWith('+');
    const parsedEnd = parseTimeToSeconds(endStr, { allowRelative: true });

    if (parsedEnd === null || isNaN(parsedEnd)) {
      errors.push(`Row ${rowNum}: Invalid time format "${endStr}" in end column.`);
      continue;
    }

    if (!startStr) {
      if (parsedRows.length === 0) { // First valid row
        startSec = 0;
      } else {
        startSec = previousRowEnd;
      }
    } else {
      const parsedStart = parseTimeToSeconds(startStr, { allowRelative: false });
      if (parsedStart === null || isNaN(parsedStart)) {
        errors.push(`Row ${rowNum}: Invalid time format "${startStr}" in start column.`);
        continue;
      }
      startSec = parsedStart;
    }

    if (isRelativeEnd) {
      endSec = startSec + parsedEnd;
    } else {
      endSec = parsedEnd;
    }

    if (endSec <= startSec) {
      errors.push(`Row ${rowNum}: End time must be greater than start time.`);
      continue;
    }
    
    if (parsedRows.length > 0) {
      if (startSec < previousRowEnd) {
        errors.push(`Row ${rowNum} overlaps the previous row.`);
        continue;
      }
      if (startSec > previousRowEnd) {
        warnings.push(`Row ${rowNum} starts after the previous row ends. This creates a gap.`);
      }
    }

    parsedRows.push({ start: startSec, end: endSec, file, text });
    previousRowEnd = endSec;
  }

  if (errors.length > 0) {
    return { success: false, rows: [], totalDurationSeconds: 0, errors, warnings, normalizedCsv: "" };
  }
  
  if (warnings.length > 0) {
    // We can surface warnings through errors array if UI expects strings, 
    // but user says "allow it, but show warning". Let's format it so UI can show it but not block.
    // Actually the return signature doesn't have `warnings`. We can append to a global state or add to ParseResult.
    // Let's add warnings to the return result.
  }

  // Generate normalized CSV
  let outCsvLines = [];
  if (timelineType === 'image') {
    outCsvLines.push("image,start,end,text");
    parsedRows.forEach(r => outCsvLines.push(`${escapeCSVField(r.file)},${r.start},${r.end},${escapeCSVField(r.text)}`));
  } else if (timelineType === 'media') {
    outCsvLines.push("start,end,asset,text");
    parsedRows.forEach(r => outCsvLines.push(`${r.start},${r.end},${escapeCSVField(r.file)},${escapeCSVField(r.text)}`));
  } else {
    outCsvLines.push("start,end,video");
    parsedRows.forEach(r => outCsvLines.push(`${r.start},${r.end},${escapeCSVField(r.file)}`));
  }

  const totalDuration = parsedRows.length > 0 ? parsedRows[parsedRows.length - 1].end : 0;

  return {
    success: true,
    rows: parsedRows,
    totalDurationSeconds: totalDuration,
    errors: [],
    warnings: warnings,
    normalizedCsv: outCsvLines.join("\n")
  };
}
