#!/usr/bin/env python3
"""
Regression test: .xlsx timeline uploads must parse identically to .csv.

This spans two languages on purpose, because the real data flow does:
the browser converts a workbook to CSV text (frontend/src/utils/
timelineFileReader.ts) and the backend parses that text (timeline_time_parser
.py). Testing either half alone would miss exactly the bugs this guards.

    python scripts/check_timeline_excel_parity.py

Exits non-zero on any divergence.

THE CASE THIS EXISTS FOR
------------------------
A plain number in a time-formatted Excel cell. `0.5` meaning half a second
displays as "12:00:00", and reading display strings parsed it as 43,200
seconds - wrong by 86,400x, and it "succeeded", so nothing surfaced the
error. That case is asserted explicitly below and must never regress.

Requires node and the frontend's node_modules (esbuild + xlsx). When those
are absent — a backend-only build on a machine that never installed the
frontend — the check SKIPS loudly with exit 0 rather than failing the build
for a toolchain reason. A real divergence always exits 1.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
sys.path.insert(0, str(ROOT / "backend"))

from timeline_time_parser import parse_timeline_csv  # noqa: E402

# (label, how Excel stores the END cell, equivalent CSV end text,
#  row start constant, expected parsed start, expected parsed end)
#
# Rows are compared after parse_timeline_csv, NOT after parse_time_to_seconds.
# That matters: parse_time_to_seconds returns 5.0 for both "+5" and "5", so a
# scalar comparison passed while the two produced completely different rows -
# which is exactly how the relative-end bug shipped. Every row here fixes
# start at 15 so a relative end (20.0) is distinguishable from an absolute
# one (5.0, which is invalid and would be rejected).
ABS_START = "0"    # absolute ends only need to exceed the start
REL_START = "10"   # non-zero so a relative end is distinguishable

CASES = [
    # --- every absolute format the CSV parser accepts, from a TEXT cell ------
    ("text 5",                {"t": "s", "v": "5"}, "5", ABS_START, 0.0, 5.0),
    ("text 5.5",              {"t": "s", "v": "5.5"}, "5.5", ABS_START, 0.0, 5.5),
    ("text 0.5",              {"t": "s", "v": "0.5"}, "0.5", ABS_START, 0.0, 0.5),
    ("text 0.1",              {"t": "s", "v": "0.1"}, "0.1", ABS_START, 0.0, 0.1),
    ("text 0.01",             {"t": "s", "v": "0.01"}, "0.01", ABS_START, 0.0, 0.01),
    ("text 0.001",            {"t": "s", "v": "0.001"}, "0.001", ABS_START, 0.0, 0.001),
    ("text 00:05",            {"t": "s", "v": "00:05"}, "00:05", ABS_START, 0.0, 5.0),
    ("text 1:20",             {"t": "s", "v": "1:20"}, "1:20", ABS_START, 0.0, 80.0),
    ("text 00:01:20",         {"t": "s", "v": "00:01:20"}, "00:01:20", ABS_START, 0.0, 80.0),
    ("text 90s",              {"t": "s", "v": "90s"}, "90s", ABS_START, 0.0, 90.0),
    ("text 1m30s",            {"t": "s", "v": "1m30s"}, "1m30s", ABS_START, 0.0, 90.0),
    # --- relative end times ---------------------------------------------------
    ("text +5",               {"t": "s", "v": "+5"}, "+5", REL_START, 10.0, 15.0),
    ("text +0.5",             {"t": "s", "v": "+0.5"}, "+0.5", REL_START, 10.0, 10.5),
    ("text +0.1",             {"t": "s", "v": "+0.1"}, "+0.1", REL_START, 10.0, 10.1),
    ("text +0.01",            {"t": "s", "v": "+0.01"}, "+0.01", REL_START, 10.0, 10.01),
    ("text +0.001",           {"t": "s", "v": "+0.001"}, "+0.001", REL_START, 10.0, 10.001),
    ("text +1m30s",           {"t": "s", "v": "+1m30s"}, "+1m30s", REL_START, 10.0, 100.0),
    # --- plain NUMERIC cells (General format) ---------------------------------
    ("num 20",                {"t": "n", "v": 20}, "20", ABS_START, 0.0, 20.0),
    ("num 20.5",              {"t": "n", "v": 20.5}, "20.5", ABS_START, 0.0, 20.5),
    ("num 30 shown 2dp",      {"t": "n", "v": 30, "z": "0.00"}, "30", ABS_START, 0.0, 30.0),
    # --- formula cells: the leading sign only survives in `f` ------------------
    ("+5 formula",            {"t": "n", "v": 5, "f": "+5"}, "+5", REL_START, 10.0, 15.0),
    ("+5.5 formula",          {"t": "n", "v": 5.5, "f": "+5.5"}, "+5.5", REL_START, 10.0, 15.5),
    ("=A1+5 computed",        {"t": "n", "v": 20, "f": "A1+5"}, "20", ABS_START, 0.0, 20.0),
    # --- TIME-FORMATTED numeric cells, resolved by the one-hour rule -----------
    # Day-fraction reading would be absurd (>1h), so these are literal seconds.
    # Every fixture carries `w`, because real Excel always does - the reader
    # trusts the displayed string over the raw serial.
    ("time-fmt 0.5",          {"t": "n", "v": 0.5,  "z": "h:mm:ss", "w": "12:00:00"}, "0.5", ABS_START, 0.0, 0.5),
    ("time-fmt 0.1",          {"t": "n", "v": 0.1,  "z": "h:mm:ss", "w": "2:24:00"}, "0.1", ABS_START, 0.0, 0.1),
    ("time-fmt 5",            {"t": "n", "v": 5,    "z": "h:mm:ss", "w": "120:00:00"}, "5", ABS_START, 0.0, 5.0),
    ("time-fmt 90",           {"t": "n", "v": 90,   "z": "h:mm:ss", "w": "2160:00:00"}, "90", ABS_START, 0.0, 90.0),
    ("time-fmt 20.5",         {"t": "n", "v": 20.5, "z": "h:mm:ss", "w": "492:00:00"}, "20.5", ABS_START, 0.0, 20.5),
    # Display string is a plausible segment, so it is trusted.
    ("genuine 0:01:20",       {"t": "n", "v": 80/86400.0,   "z": "h:mm:ss", "w": "0:01:20"}, "00:01:20", ABS_START, 0.0, 80.0),
    ("genuine 0:00:05",       {"t": "n", "v": 5/86400.0,    "z": "h:mm:ss", "w": "0:00:05"}, "00:05", ABS_START, 0.0, 5.0),
    ("genuine 1:00:00",       {"t": "n", "v": 3600/86400.0, "z": "h:mm:ss", "w": "1:00:00"}, "1:00:00", ABS_START, 0.0, 3600.0),
    # The real-file case: Excel reads a typed "0:03" under h:mm as 3 MINUTES,
    # so the serial says 180s while CSV reads the same text as 3 seconds.
    # The displayed string is authoritative.
    ("h:mm 0:03 = 3 seconds", {"t": "n", "v": 3/1440.0,  "z": "h:mm", "w": "0:03"}, "0:03", ABS_START, 0.0, 3.0),
    ("h:mm 1:03 = 63 seconds",{"t": "n", "v": 63/1440.0, "z": "h:mm", "w": "1:03"}, "1:03", ABS_START, 0.0, 63.0),
    ("h:mm fractional 10:37.5",{"t": "n","v": 637.5/86400.0,"z": "h:mm","w": "10:37.5"}, "10:37.5", ABS_START, 0.0, 637.5),
]

# A single Node driver that bundles the TypeScript reader and runs cellToText
# over the supplied cells.
#
# It deliberately drives esbuild through its JavaScript API rather than the
# node_modules/.bin/esbuild shim. That shim is not portable: on macOS/Linux it
# is a native binary, and on Windows npm writes a .cmd batch wrapper that
# CreateProcess cannot execute, which produced
#   OSError: [WinError 193] %1 is not a valid Win32 application
# on the first real Windows build. esbuild's JS API locates the correct
# platform binary itself, so the only executable Python ever spawns is `node`,
# which is a real .exe on Windows and a real binary elsewhere.
RUNNER = """
const path = require('path');
const os = require('os');
const fs = require('fs');
const esbuild = require('esbuild');

const modPath = process.argv[2];

const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tlparity-')), 'bundle.cjs');
const entry = path.join(path.dirname(outfile), 'entry.ts');
// Single line on purpose: no escape sequences to survive being written
// through Python, and none are needed.
fs.writeFileSync(entry, [
  'import { cellToText, sheetToCsvText } from ' + JSON.stringify(modPath) + ';',
  'module.exports = { cellToText, sheetToCsvText };',
].join(String.fromCharCode(10)));

esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'error',
  absWorkingDir: __dirname,
  outfile,
});

const mod = require(outfile);
const payload = JSON.parse(process.argv[3]);
if (payload.sheet) {
  // Whole-sheet mode: build a worksheet from cell objects and run the real
  // sheetToCsvText, so multi-row behaviour is exercised end to end.
  const sheet = {};
  let maxR = 0;
  for (const [addr, cell] of Object.entries(payload.sheet)) {
    sheet[addr] = cell;
    maxR = Math.max(maxR, parseInt(addr.replace(/[A-Z]/g, ''), 10));
  }
  sheet['!ref'] = 'A1:C' + maxR;
  console.log(JSON.stringify({ csv: mod.sheetToCsvText(sheet) }));
} else {
  console.log(JSON.stringify(payload.map(c => mod.cellToText(c))));
}
"""


def prerequisites_missing() -> str:
    """Return a reason string if the check cannot run here, else ""."""
    if shutil.which("node") is None:
        return "node is not installed or not on PATH"
    # Check the packages themselves, not node_modules/.bin. The .bin entries
    # are platform-specific shims (native binary on macOS/Linux, .cmd wrapper
    # on Windows) and this script no longer touches them.
    if not (FRONTEND / "node_modules" / "esbuild" / "lib" / "main.js").exists():
        return "frontend/node_modules/esbuild not found (run npm install in frontend/)"
    if not (FRONTEND / "node_modules" / "xlsx").exists():
        return "frontend/node_modules/xlsx not found (run npm install in frontend/)"
    return ""


def run_driver(payload):
    """Run the real TypeScript reader over a payload (cell list or a sheet)."""
    node = shutil.which("node")
    mod = (FRONTEND / "src" / "utils" / "timelineFileReader.ts").as_posix()

    # Normally `node` resolves to node.exe on Windows and a real binary
    # elsewhere, both directly executable. A few Windows version managers
    # install it as a .cmd shim, which CreateProcess cannot run - the same
    # WinError 193 that the .bin/esbuild shim caused. Route those through the
    # command interpreter. subprocess quotes list arguments itself, which
    # matters here because the repo path can contain spaces.
    prefix = []
    if os.name == "nt" and Path(node).suffix.lower() in (".cmd", ".bat"):
        prefix = [os.environ.get("COMSPEC", "cmd.exe"), "/c"]

    # The driver lives under frontend/node_modules/.cache so Node's module
    # resolution walks up and finds esbuild and xlsx (a driver in the system
    # temp dir would not resolve them), and so a crash cannot leave a stray
    # directory in frontend/ that shows up in git status.
    cache = FRONTEND / "node_modules" / ".cache"
    cache.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=cache) as td:
        driver = Path(td) / "parity_driver.cjs"
        driver.write_text(RUNNER, encoding="utf-8")
        run = subprocess.run(
            prefix + [node, str(driver), mod, json.dumps(payload)],
            cwd=str(FRONTEND), capture_output=True, text=True,
        )
        if run.returncode != 0:
            print("node driver failed:\n" + (run.stderr or run.stdout))
            sys.exit(2)
        return json.loads(run.stdout)


def parse_row(end_text, row_start):
    """Parse a one-row timeline through the real backend parser."""
    csv = f"start,end,image{chr(10)}{row_start},{end_text},a.png{chr(10)}"
    ok, rows, _dur, errs, _warn, _norm = parse_timeline_csv(csv, "image")
    if not ok or not rows:
        return None, (errs[0] if errs else "rejected")
    return (rows[0]["start"], rows[0]["end"]), None


def main():
    reason = prerequisites_missing()
    if reason:
        print("=" * 72)
        print("SKIPPED: Excel/CSV timeline parity check did not run.")
        print(f"Reason:  {reason}")
        print("This check guards against Excel timestamps being misread by")
        print("86,400x. Run it before releasing:")
        print("  python scripts/check_timeline_excel_parity.py")
        print("=" * 72)
        return 0

    texts = run_driver([c[1] for c in CASES])
    failures = []

    print("PARITY - rows parsed from XLSX must match rows parsed from CSV")
    print(f"(absolute rows start at {ABS_START}s, relative rows at {REL_START}s)")
    print(f"{'case':24} {'CSV end':10} {'CSV row':>16}  | {'XLSX end':10} {'XLSX row':>16}  verdict")
    print("-" * 104)
    for (label, _cell, csv_text, row_start, exp_start, exp_end), xlsx_text in zip(CASES, texts):
        csv_row, csv_err = parse_row(csv_text, row_start)
        xlsx_row, xlsx_err = parse_row(xlsx_text, row_start) if xlsx_text else (None, "empty cell")

        # 1e-6, not 0.01: the format list includes 0.001 and +0.001, which a
        # 0.01 tolerance would pass even if the value came back as zero.
        TOL = 1e-6
        ok = (csv_row is not None and xlsx_row is not None
              and abs(csv_row[0] - exp_start) < TOL and abs(csv_row[1] - exp_end) < TOL
              and abs(xlsx_row[0] - csv_row[0]) < TOL
              and abs(xlsx_row[1] - csv_row[1]) < TOL)
        if not ok:
            failures.append(label)

        def fmt(row, err):
            return f"{row[0]:g}->{row[1]:g}" if row else "REJECTED"
        print(f"{label:24} {csv_text:10} {fmt(csv_row, csv_err):>16}  | "
              f"{(xlsx_text or '(empty)'):10} {fmt(xlsx_row, xlsx_err):>16}  "
              f"{'match' if ok else '*** DIVERGES ***'}")
        if not ok and (csv_err or xlsx_err):
            print(f"{'':24}   csv: {csv_err or '-'} | xlsx: {xlsx_err or '-'}")

    print()
    # Two named guards for the specific bugs that shipped.
    print()
    didx = [i for i, c in enumerate(CASES) if c[0] == "time-fmt 0.5"][0]
    drow, _ = parse_row(texts[didx], CASES[didx][3])
    if drow is None or abs(drow[1] - 0.5) > 0.001:
        print(f"REGRESSION: 0.5 in a time-formatted cell produced {drow} "
              f"instead of an end of 0.5s. This is the 43,200s bug.")
        failures.append("0.5s guard")
    else:
        print("GUARD OK: 0.5 in a time-formatted cell reads as 0.5s, "
              "not 43,200s.")

    ridx = [i for i, c in enumerate(CASES) if c[0] == "+5 formula"][0]
    rel_row, _ = parse_row(texts[ridx], CASES[ridx][3])
    if rel_row is None or abs(rel_row[1] - 15.0) > 0.01:
        print(f"REGRESSION: a '+5' relative end from Excel produced {rel_row} "
              f"instead of 10.0->15.0. The leading '+' was lost.")
        failures.append("+5 relative guard")
    else:
        print("GUARD OK: a '+5' relative end from Excel stays relative "
              "(10.0->15.0), not an absolute 5s.")

    # ---- Guard: a column whose values straddle the one-hour boundary --------
    # The real bug that shipped. Every case above is a single row, so a column
    # that changes interpretation partway down was never exercised. This sheet
    # climbs 0:56 -> 1:08 in h:mm, exactly like the file that failed.
    print()
    sheet = {"A1": {"t": "s", "v": "image"},
             "B1": {"t": "s", "v": "start"},
             "C1": {"t": "s", "v": "end"}}
    mins = [56, 59, 63, 66, 68]
    for i, (a, b) in enumerate(zip(mins, mins[1:]), start=2):
        sheet[f"A{i}"] = {"t": "s", "v": f"{i}.jpg"}
        sheet[f"B{i}"] = {"t": "n", "v": a / 1440.0, "z": "h:mm", "w": f"{a // 60}:{a % 60:02d}"}
        sheet[f"C{i}"] = {"t": "n", "v": b / 1440.0, "z": "h:mm", "w": f"{b // 60}:{b % 60:02d}"}
    res = run_driver({"sheet": sheet})
    ok_b, rows_b, _d, errs_b, _w, _n = parse_timeline_csv(res["csv"], "image")
    if not ok_b or len(rows_b) != 4 or abs(rows_b[0]["start"] - 56.0) > 1e-6 \
            or abs(rows_b[-1]["end"] - 68.0) > 1e-6:
        print("REGRESSION: a column crossing the one-hour serial boundary no longer "
              f"parses consistently. errors={errs_b[:2]}")
        failures.append("boundary-crossing column")
    else:
        print("GUARD OK: a column crossing 1:00 stays consistent "
              f"({rows_b[0]['start']}s -> {rows_b[-1]['end']}s across {len(rows_b)} rows).")

    # ---- Guard: CSV saved with a UTF-8 BOM ----------------------------------
    # Excel's "CSV UTF-8" export prepends one. Left in place it corrupts the
    # first header and the upload is rejected for "missing required columns".
    bom_csv = "\ufeff" + "image,start,end\n1.jpg,0,5\n2.jpg,5,10\n"
    stripped = bom_csv.replace("\ufeff", "", 1)
    ok_raw, _r, _d, _e, _w, _n = parse_timeline_csv(bom_csv, "image")
    ok_str, rows_s, _d, errs_s, _w, _n = parse_timeline_csv(stripped, "image")
    if ok_raw:
        print("NOTE: the parser now tolerates a BOM itself; the reader strip is redundant.")
    if not ok_str or len(rows_s) != 2:
        print(f"REGRESSION: BOM-stripped CSV still fails. errors={errs_s[:2]}")
        failures.append("BOM CSV")
    else:
        print("GUARD OK: a BOM-prefixed CSV parses once the reader strips it "
              f"({len(rows_s)} rows).")

    if failures:
        print(f"\nFAILED: {len(failures)} case(s) - {', '.join(failures)}")
        return 1
    print(f"\nAll {len(CASES)} parity rows match between CSV and XLSX.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
