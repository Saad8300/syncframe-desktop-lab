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
#  expected parsed start, expected parsed end)
#
# Rows are compared after parse_timeline_csv, NOT after parse_time_to_seconds.
# That matters: parse_time_to_seconds returns 5.0 for both "+5" and "5", so a
# scalar comparison passed while the two produced completely different rows -
# which is exactly how the relative-end bug shipped. Every row here fixes
# start at 15 so a relative end (20.0) is distinguishable from an absolute
# one (5.0, which is invalid and would be rejected).
ROW_START = "15"

CASES = [
    ("plain int 5",           {"t": "n", "v": 20},                        "20",     15.0, 20.0),
    ("plain decimal 20.5",    {"t": "n", "v": 20.5},                      "20.5",   15.0, 20.5),
    ("number shown 2dp",      {"t": "n", "v": 30, "z": "0.00"},           "30",     15.0, 30.0),
    # THE REGRESSION THIS EXISTS FOR: Excel turns a typed "+5" into a formula
    # and caches the bare number 5. Reading the cache alone yields an absolute
    # 5s end, which is before the 15s start and gets rejected outright.
    ("+5 relative (formula)", {"t": "n", "v": 5, "f": "+5"},              "+5",     15.0, 20.0),
    ("+5.5 relative",         {"t": "n", "v": 5.5, "f": "+5.5"},          "+5.5",   15.0, 20.5),
    # A real computation: the cached result is the intended absolute value.
    ("=A1+5 computed",        {"t": "n", "v": 20, "f": "A1+5"},           "20",     15.0, 20.0),
    # Text-typed cells (user pre-formatted the column as Text).
    ("text 0:30",             {"t": "s", "v": "0:30"},                    "0:30",   15.0, 30.0),
    ("text 1:30.5",           {"t": "s", "v": "1:30.5"},                  "1:30.5", 15.0, 90.5),
    ("text 2m30s",            {"t": "s", "v": "2m30s"},                   "2m30s",  15.0, 150.0),
    ("text +5 relative",      {"t": "s", "v": "+5"},                      "+5",     15.0, 20.0),
    ("text w/ apostrophe",    {"t": "s", "v": "20.5", "w": "20.5"},       "20.5",   15.0, 20.5),
]

# Time-formatted NUMERIC cells are genuinely ambiguous: {t:'n', v:0.5,
# z:'h:mm:ss'} is byte-identical whether the user meant half a second or half
# a day. These must be REFUSED, never silently converted.
AMBIGUOUS_CASES = [
    ("0.5 in time-fmt cell",   {"t": "n", "v": 0.5, "z": "h:mm:ss"}),
    ("0.25 in time-fmt cell",  {"t": "n", "v": 0.25, "z": "h:mm:ss"}),
    ("time serial 0:30",       {"t": "n", "v": 30 / 1440.0, "z": "h:mm"}),
    ("AM/PM displayed",        {"t": "n", "v": 30 / 1440.0, "z": "h:mm AM/PM"}),
    ("time serial 1:02:03",    {"t": "n", "v": 3723 / 86400.0, "z": "h:mm:ss"}),
]

AMBIGUOUS_MARKER = "\u0000AMBIGUOUS_TIME"

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
const cases = JSON.parse(process.argv[3]);

const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tlparity-')), 'bundle.cjs');
const entry = path.join(path.dirname(outfile), 'entry.ts');
// Single line on purpose: no escape sequences to survive being written
// through Python, and none are needed.
fs.writeFileSync(entry, [
  'import { cellToText } from ' + JSON.stringify(modPath) + ';',
  'module.exports = { cellToText };',
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

const { cellToText } = require(outfile);
console.log(JSON.stringify(cases.map(c => cellToText(c))));
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


def xlsx_cell_texts(cells):
    """Run the real TypeScript cellToText over each cell object."""
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
            prefix + [node, str(driver), mod, json.dumps(cells)],
            cwd=str(FRONTEND), capture_output=True, text=True,
        )
        if run.returncode != 0:
            print("node driver failed:\n" + (run.stderr or run.stdout))
            sys.exit(2)
        return json.loads(run.stdout)


def parse_row(end_text):
    """Parse a one-row timeline through the real backend parser."""
    csv = f"start,end,image{chr(10)}{ROW_START},{end_text},a.png{chr(10)}"
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

    texts = xlsx_cell_texts([c[1] for c in CASES])
    amb_texts = xlsx_cell_texts([c[1] for c in AMBIGUOUS_CASES])
    failures = []

    print("PARITY - rows parsed from XLSX must match rows parsed from CSV")
    print(f"(every row starts at {ROW_START}s, so a relative end is distinguishable)")
    print(f"{'case':24} {'CSV end':10} {'CSV row':>16}  | {'XLSX end':10} {'XLSX row':>16}  verdict")
    print("-" * 104)
    for (label, _cell, csv_text, exp_start, exp_end), xlsx_text in zip(CASES, texts):
        csv_row, csv_err = parse_row(csv_text)
        xlsx_row, xlsx_err = parse_row(xlsx_text) if xlsx_text else (None, "empty cell")

        ok = (csv_row is not None and xlsx_row is not None
              and abs(csv_row[0] - exp_start) < 0.01 and abs(csv_row[1] - exp_end) < 0.01
              and abs(xlsx_row[0] - csv_row[0]) < 0.01
              and abs(xlsx_row[1] - csv_row[1]) < 0.01)
        if not ok:
            failures.append(label)

        def fmt(row, err):
            return f"{row[0]:.1f}->{row[1]:.1f}" if row else f"REJECTED"
        print(f"{label:24} {csv_text:10} {fmt(csv_row, csv_err):>16}  | "
              f"{(xlsx_text or '(empty)'):10} {fmt(xlsx_row, xlsx_err):>16}  "
              f"{'match' if ok else '*** DIVERGES ***'}")
        if not ok and (csv_err or xlsx_err):
            print(f"{'':24}   csv: {csv_err or '-'} | xlsx: {xlsx_err or '-'}")

    print()
    print("REFUSAL - ambiguous time-formatted numeric cells must never be guessed at")
    print("-" * 104)
    for (label, _cell), text in zip(AMBIGUOUS_CASES, amb_texts):
        refused = text == AMBIGUOUS_MARKER
        if not refused:
            failures.append(label)
            row, err = parse_row(text)
            print(f"{label:24} NOT REFUSED -> {text!r} parses as {row}  *** UNSAFE ***")
        else:
            print(f"{label:24} refused with an actionable error  OK")

    # Two named guards for the specific bugs that shipped.
    print()
    idx = [i for i, c in enumerate(AMBIGUOUS_CASES) if c[0] == "0.5 in time-fmt cell"][0]
    if amb_texts[idx] != AMBIGUOUS_MARKER:
        print("REGRESSION: 0.5s in a time-formatted cell was not refused. "
              "This is the 43,200s bug.")
        failures.append("0.5s guard")
    else:
        print("GUARD OK: 0.5s in a time-formatted cell is refused, "
              "not silently turned into 43,200s.")

    ridx = [i for i, c in enumerate(CASES) if c[0] == "+5 relative (formula)"][0]
    rel_row, _ = parse_row(texts[ridx])
    if rel_row is None or abs(rel_row[1] - 20.0) > 0.01:
        print(f"REGRESSION: a '+5' relative end from Excel produced {rel_row} "
              f"instead of 15.0->20.0. The leading '+' was lost.")
        failures.append("+5 relative guard")
    else:
        print("GUARD OK: a '+5' relative end from Excel stays relative "
              "(15.0->20.0), not an absolute 5s.")

    if failures:
        print(f"\nFAILED: {len(failures)} case(s) - {', '.join(failures)}")
        return 1
    print(f"\nAll {len(CASES)} parity rows match and all "
          f"{len(AMBIGUOUS_CASES)} ambiguous cases are refused.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
