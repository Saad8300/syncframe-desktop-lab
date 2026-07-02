import re
import csv
import io
from typing import Optional, List, Dict, Any, Tuple

def parse_time_to_seconds(time_str: str, allow_relative: bool = False) -> Optional[float]:
    if not time_str:
        return None
        
    t = str(time_str).strip().lower()
    if not t:
        return None
        
    is_relative = t.startswith('+')
    str_to_parse = t[1:] if is_relative else t
    
    if is_relative and not allow_relative:
        return None
        
    # handle raw numbers or simple decimals
    if re.fullmatch(r'^\d+(\.\d+)?$', str_to_parse):
        return float(str_to_parse)
        
    # Check if Excel exported an AM/PM clock time
    if 'am' in t or 'pm' in t:
        return None

    # hh:mm:ss or mm:ss or mm:ss.ms
    hms_match = re.fullmatch(r'^(?:(?:(\d+):)?(\d{1,2}):)?(\d{1,2}(?:\.\d+)?)$', str_to_parse)
    if hms_match:
        p1 = hms_match.group(1)
        p2 = hms_match.group(2)
        p3 = hms_match.group(3)
        
        if p1 is not None:
            # 3 parts: HH:MM:SS
            h = int(p1)
            m = int(p2)
            s = float(p3)
            return h * 3600 + m * 60 + s
        elif p2 is not None:
            # 2 parts: MM:SS
            m = int(p2)
            s = float(p3)
            return m * 60 + s
        else:
            # 1 part: SS
            return float(p3)
            
    # Handle s, m, min, sec formats
    min_sec_match = re.fullmatch(r'^(?:(\d+)\s*(?:m|min|mins|minutes))?\s*(?:(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds))?$', str_to_parse)
    if min_sec_match and (min_sec_match.group(1) or min_sec_match.group(2)):
        m = int(min_sec_match.group(1) or "0")
        s = float(min_sec_match.group(2) or "0")
        return m * 60 + s
        
    return None

def parse_timeline_csv(csv_text: str, timeline_type: str) -> Tuple[bool, List[Dict[str, Any]], float, List[str], List[str], str]:
    """
    timeline_type: 'image', 'media', 'video'
    Returns: (success, rows, total_duration, errors, warnings, normalized_csv)
    """
    lines = [l for l in csv_text.splitlines() if l.strip()]
    if len(lines) < 2:
        return False, [], 0.0, ["Timeline CSV must contain a header and at least one row."], [], ""
        
    reader = csv.reader(io.StringIO(lines[0]))
    headers = []
    try:
        headers = next(reader)
        headers = [h.strip().lower() for h in headers]
    except StopIteration:
        pass
        
    start_col, end_col, file_col, text_col = -1, -1, -1, -1
    start_aliases = ['start', 'start_time', 'starttime']
    end_aliases = ['end', 'end_time', 'endtime']
    file_aliases = ['image', 'asset', 'video', 'file', 'media', 'path']
    text_aliases = ['text', 'caption', 'script']
    
    for i, h in enumerate(headers):
        if h in start_aliases: start_col = i
        elif h in end_aliases: end_col = i
        elif h in file_aliases: file_col = i
        elif h in text_aliases: text_col = i
        
    if start_col == -1 or end_col == -1 or file_col == -1:
        return False, [], 0.0, ["CSV missing required columns. Ensure it has start, end, and file/asset/video/image columns."], [], ""
        
    parsed_rows = []
    errors = []
    warnings = []
    previous_row_end = 0.0
    
    reader = csv.reader(io.StringIO("\n".join(lines[1:])))
    for idx, columns in enumerate(reader):
        row_num = idx + 2
        
        if len(columns) == 1 and columns[0].strip() == "":
            continue
            
        start_str = columns[start_col].strip() if start_col < len(columns) else ""
        end_str = columns[end_col].strip() if end_col < len(columns) else ""
        file_val = columns[file_col].strip() if file_col < len(columns) else ""
        text_val = columns[text_col].strip() if text_col != -1 and text_col < len(columns) else ""
        
        if not file_val:
            errors.append(f"Row {row_num}: File is missing.")
            continue
            
        if not end_str:
            errors.append(f"Row {row_num}: Missing end time.")
            continue
            
        if 'am' in end_str.lower() or 'pm' in end_str.lower() or 'am' in start_str.lower() or 'pm' in start_str.lower():
            errors.append("Excel converted your timestamp into a clock time. Format the start/end columns as Text before exporting CSV.")
            continue
            
        is_relative_end = end_str.startswith('+')
        parsed_end = parse_time_to_seconds(end_str, allow_relative=True)
        
        if parsed_end is None:
            errors.append(f"Row {row_num}: Invalid time format \"{end_str}\" in end column.")
            continue
            
        if not start_str:
            if len(parsed_rows) == 0:
                start_sec = 0.0
            else:
                start_sec = previous_row_end
        else:
            parsed_start = parse_time_to_seconds(start_str, allow_relative=False)
            if parsed_start is None:
                errors.append(f"Row {row_num}: Invalid time format \"{start_str}\" in start column.")
                continue
            start_sec = parsed_start
            
        if is_relative_end:
            end_sec = start_sec + parsed_end
        else:
            end_sec = parsed_end
            
        if end_sec <= start_sec:
            errors.append(f"Row {row_num}: End time must be greater than start time.")
            continue
            
        if len(parsed_rows) > 0:
            if start_sec < previous_row_end:
                errors.append(f"Row {row_num} overlaps the previous row.")
                continue
            if start_sec > previous_row_end:
                warnings.append(f"Row {row_num} starts after the previous row ends. This creates a gap.")
            
        parsed_rows.append({
            "start": start_sec,
            "end": end_sec,
            "file": file_val,
            "text": text_val
        })
        previous_row_end = end_sec
        
    if errors:
        return False, [], 0.0, errors, warnings, ""
        
    def escape_csv_field(field: str) -> str:
        if not field: return ""
        f = str(field)
        if "," in f or '"' in f or "\n" in f or "\r" in f:
            return '"{}"'.format(f.replace('"', '""'))
        return f

    out_csv_lines = []
    if timeline_type == 'image':
        out_csv_lines.append("image,start,end,text")
        for r in parsed_rows:
            out_csv_lines.append(f"{escape_csv_field(r['file'])},{r['start']},{r['end']},{escape_csv_field(r['text'])}")
    elif timeline_type == 'media':
        out_csv_lines.append("start,end,asset,text")
        for r in parsed_rows:
            out_csv_lines.append(f"{r['start']},{r['end']},{escape_csv_field(r['file'])},{escape_csv_field(r['text'])}")
    else:
        out_csv_lines.append("start,end,video")
        for r in parsed_rows:
            out_csv_lines.append(f"{r['start']},{r['end']},{escape_csv_field(r['file'])}")
            
    total_duration = parsed_rows[-1]["end"] if parsed_rows else 0.0
    normalized_csv = "\n".join(out_csv_lines)
    
    return True, parsed_rows, total_duration, [], warnings, normalized_csv
