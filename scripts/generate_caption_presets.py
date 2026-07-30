#!/usr/bin/env python3
"""
Generate the Python and TypeScript caption-preset tables from the single
source of truth at shared/caption_presets.json.

The same 28 presets are needed by the Python renderer (caption_engine.py) and
by the React preview/Studio UI. They used to be two hand-maintained literals
that had to be kept byte-identical by hand; any drift between them meant the
preview lied about the render. Both are now generated.

    python scripts/generate_caption_presets.py          # write both files
    python scripts/generate_caption_presets.py --check  # verify they're current

--check is the CI-friendly mode: it exits non-zero if either generated file
differs from what the source would produce, so a hand-edit can't slip through.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "shared" / "caption_presets.json"
PY_OUT = ROOT / "backend" / "caption_presets_generated.py"
TS_OUT = ROOT / "frontend" / "src" / "utils" / "captionPresetsGenerated.ts"

BANNER_LINES = [
    "AUTO-GENERATED FILE - DO NOT EDIT BY HAND.",
    "",
    "Source:    shared/caption_presets.json",
    "Generator: scripts/generate_caption_presets.py",
    "",
    "Edit the JSON and re-run the generator; hand edits here will be",
    "overwritten and will silently desync the renderer from the preview.",
]


def load():
    with open(SOURCE, "r", encoding="utf-8") as f:
        return json.load(f)


def py_literal(value, indent=0):
    pad = " " * indent
    if isinstance(value, dict):
        if not value:
            return "{}"
        inner = ",\n".join(
            f'{pad}    {json.dumps(k)}: {py_literal(v, indent + 4)}'
            for k, v in value.items()
        )
        return "{\n" + inner + f",\n{pad}}}"
    if isinstance(value, list):
        return "[" + ", ".join(py_literal(v) for v in value) + "]"
    if isinstance(value, bool):
        return "True" if value else "False"
    if value is None:
        return "None"
    return json.dumps(value)


def render_python(doc):
    lines = ['"""']
    lines += BANNER_LINES
    lines += ['"""', "", "from typing import Any, Dict, List", ""]
    lines.append(f'SCHEMA_VERSION = {doc["schemaVersion"]}')
    lines.append("")
    lines.append(f'FALLBACK_DEFAULTS: Dict[str, Any] = {py_literal(doc["defaults"])}')
    lines.append("")
    styles = {k: v["style"] for k, v in doc["presets"].items()}
    lines.append(f'BUILT_IN_DEFINITIONS: Dict[str, Dict[str, Any]] = {py_literal(styles)}')
    lines.append("")
    meta = {k: {"name": v["name"], "categories": v["categories"]}
            for k, v in doc["presets"].items()}
    lines.append(f'PRESET_META: Dict[str, Dict[str, Any]] = {py_literal(meta)}')
    lines.append("")
    karaoke = [k for k, v in doc["presets"].items()
               if v["style"].get("karaokeMode", "none") != "none"]
    lines.append(f'KARAOKE_PRESET_IDS: List[str] = {py_literal(karaoke)}')
    lines.append("")
    return "\n".join(lines)


def ts_literal(value, indent=0):
    pad = " " * indent
    if isinstance(value, dict):
        if not value:
            return "{}"
        inner = ",\n".join(
            f'{pad}  {json.dumps(k)}: {ts_literal(v, indent + 2)}'
            for k, v in value.items()
        )
        return "{\n" + inner + f",\n{pad}}}"
    if isinstance(value, list):
        return "[" + ", ".join(ts_literal(v) for v in value) + "]"
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return json.dumps(value)


def render_typescript(doc):
    lines = ["/**"]
    lines += [f" * {ln}".rstrip() for ln in BANNER_LINES]
    lines += [" */", ""]
    lines.append("export interface GeneratedPresetMeta {")
    lines.append("  name: string")
    lines.append("  categories: string[]")
    lines.append("}")
    lines.append("")
    lines.append(f'export const CAPTION_SCHEMA_VERSION = {doc["schemaVersion"]}')
    lines.append("")
    lines.append(
        "export const FALLBACK_DEFAULTS: Record<string, any> = "
        + ts_literal(doc["defaults"])
    )
    lines.append("")
    styles = {k: v["style"] for k, v in doc["presets"].items()}
    lines.append(
        "export const BUILT_IN_DEFINITIONS: Record<string, Record<string, any>> = "
        + ts_literal(styles)
    )
    lines.append("")
    meta = {k: {"name": v["name"], "categories": v["categories"]}
            for k, v in doc["presets"].items()}
    lines.append(
        "export const PRESET_META: Record<string, GeneratedPresetMeta> = "
        + ts_literal(meta)
    )
    lines.append("")
    order = list(doc["presets"].keys())
    lines.append(f"export const PRESET_ORDER: string[] = {ts_literal(order)}")
    lines.append("")
    cats = []
    for v in doc["presets"].values():
        for c in v["categories"]:
            if c not in cats:
                cats.append(c)
    lines.append(f"export const PRESET_CATEGORIES: string[] = {ts_literal(sorted(cats))}")
    lines.append("")
    karaoke = [k for k, v in doc["presets"].items()
               if v["style"].get("karaokeMode", "none") != "none"]
    lines.append(f"export const KARAOKE_PRESET_IDS: string[] = {ts_literal(karaoke)}")
    lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="verify generated files match the source; exit 1 if not")
    args = ap.parse_args()

    doc = load()
    targets = [(PY_OUT, render_python(doc)), (TS_OUT, render_typescript(doc))]

    if args.check:
        stale = []
        for path, content in targets:
            current = path.read_text(encoding="utf-8") if path.exists() else None
            if current != content:
                stale.append(path.relative_to(ROOT))
        if stale:
            print("Generated caption presets are out of date:")
            for s in stale:
                print(f"  - {s}")
            print("Run: python scripts/generate_caption_presets.py")
            return 1
        print(f"Caption presets up to date ({len(doc['presets'])} presets).")
        return 0

    for path, content in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)}")
    print(f"{len(doc['presets'])} presets generated for both runtimes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
