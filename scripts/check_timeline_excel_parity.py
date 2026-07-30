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
seconds — wrong by 86,400x, and it "succeeded", so nothing surfaced the
error. That case is asserted explicitly below and must never regress.

Requires node and the frontend's node_modules (esbuild + xlsx). When those
are absent — a backend-only build on a machine that never installed the
frontend — the check SKIPS loudly with exit 0 rather than failing the build
for a toolchain reason. A real divergence always exits 1.
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
sys.path.insert(0, str(ROOT / "backend"))

from timeline_time_parser import parse_time_to_seconds  # noqa: E402

# (label, how Excel stores it, equivalent CSV text, expected seconds)
#   cell = dict passed straight through as a SheetJS cell object
CASES = [
    ("plain int 5",            {"t": "n", "v": 5},                                   "5",        5.0),
    ("plain decimal 0.5",      {"t": "n", "v": 0.5},                                 "0.5",      0.5),
    ("decimal 5.5",            {"t": "n", "v": 5.5},                                 "5.5",      5.5),
    ("number shown 2dp",       {"t": "n", "v": 30, "z": "0.00"},                     "30",      30.0),
    # Formula coercion: typing +5 into a default cell.
    ("+5 cached formula",      {"t": "n", "v": 5, "f": "5"},                         "+5",       5.0),
    ("+5 uncached formula",    {"f": "5"},                                           "+5",       5.0),
    # Text-typed cells (user pre-formatted the column as Text).
    ("text 1:30",              {"t": "s", "v": "1:30"},                              "1:30",    90.0),
    ("text 1:30.5",            {"t": "s", "v": "1:30.5"},                            "1:30.5",  90.5),
    ("text 2m30s",             {"t": "s", "v": "2m30s"},                             "2m30s",  150.0),
    ("text 5s",                {"t": "s", "v": "5s"},                                "5s",       5.0),
    ("text w/ apostrophe",     {"t": "s", "v": "0.5", "w": "0.5"},                   "0.5",      0.5),
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

RUNNER = """
import { cellToText } from %(mod)s
const cases = JSON.parse(process.argv[2])
console.log(JSON.stringify(cases.map(c => cellToText(c))))
"""


def prerequisites_missing() -> str:
    """Return a reason string if the check cannot run here, else ""."""
    if shutil.which("node") is None:
        return "node is not installed or not on PATH"
    esbuild = FRONTEND / "node_modules" / ".bin" / "esbuild"
    if not esbuild.exists():
        return f"{esbuild.relative_to(ROOT)} not found (run npm install in frontend/)"
    if not (FRONTEND / "node_modules" / "xlsx").exists():
        return "frontend/node_modules/xlsx not found (run npm install in frontend/)"
    return ""


def xlsx_cell_texts(cells):
    """Run the real TypeScript cellToText over each cell object via esbuild."""
    mod = (FRONTEND / "src" / "utils" / "timelineFileReader.ts").as_posix()
    with tempfile.TemporaryDirectory() as td:
        entry = Path(td) / "entry.ts"
        entry.write_text(RUNNER % {"mod": json.dumps(mod)}, encoding="utf-8")
        out = Path(td) / "bundle.cjs"
        build = subprocess.run(
            [str(FRONTEND / "node_modules" / ".bin" / "esbuild"), str(entry),
             "--bundle", "--platform=node", "--format=cjs", "--log-level=error",
             f"--outfile={out}"],
            cwd=FRONTEND, capture_output=True, text=True,
        )
        if build.returncode != 0:
            print("esbuild failed:\n" + build.stderr)
            sys.exit(2)
        run = subprocess.run(["node", str(out), json.dumps(cells)],
                             cwd=FRONTEND, capture_output=True, text=True)
        if run.returncode != 0:
            print("node failed:\n" + run.stderr)
            sys.exit(2)
        return json.loads(run.stdout)


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

    print("PARITY — every format the CSV path accepts must parse identically from XLSX")
    print(f"{'case':24} {'CSV':10} -> {'sec':>9}  | {'XLSX text':12} -> {'sec':>9}  verdict")
    print("-" * 92)
    for (label, _cell, csv_text, expected), xlsx_text in zip(CASES, texts):
        csv_sec = parse_time_to_seconds(csv_text, allow_relative=True)
        xlsx_sec = parse_time_to_seconds(xlsx_text, allow_relative=True) if xlsx_text else None
        ok = (csv_sec == expected and xlsx_sec is not None
              and abs(xlsx_sec - expected) < 0.01)
        if not ok:
            failures.append(label)
        print(f"{label:24} {csv_text:10} -> {str(csv_sec):>9}  | "
              f"{(xlsx_text or '(empty)'):12} -> {str(xlsx_sec):>9}  "
              f"{'match' if ok else '*** DIVERGES ***'}")

    print()
    print("REFUSAL — ambiguous time-formatted numeric cells must never be guessed at")
    print("-" * 92)
    for (label, _cell), text in zip(AMBIGUOUS_CASES, amb_texts):
        refused = text == AMBIGUOUS_MARKER
        if not refused:
            failures.append(label)
            got = parse_time_to_seconds(text, allow_relative=True)
            print(f"{label:24} NOT REFUSED -> {text!r} parses as {got}s  *** UNSAFE ***")
        else:
            print(f"{label:24} refused with an actionable error  OK")

    # The specific 86,400x bug, named so it can never quietly come back.
    print()
    idx = [i for i, c in enumerate(AMBIGUOUS_CASES) if c[0] == "0.5 in time-fmt cell"][0]
    if amb_texts[idx] != AMBIGUOUS_MARKER:
        got = parse_time_to_seconds(amb_texts[idx], allow_relative=True)
        print(f"REGRESSION: 0.5s in a time-formatted cell yielded {got}s "
              f"instead of being refused. This is the 43,200s bug.")
        failures.append("0.5s guard")
    else:
        print("GUARD OK: 0.5s in a time-formatted cell is refused, "
              "not silently turned into 43,200s.")

    if failures:
        print(f"\nFAILED: {len(failures)} case(s) — {', '.join(failures)}")
        return 1
    print(f"\nAll {len(CASES)} parity cases match and all "
          f"{len(AMBIGUOUS_CASES)} ambiguous cases are refused.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
