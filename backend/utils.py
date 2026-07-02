"""
utils.py - Utility functions for Audio Image Sync Studio
Handles CSV validation, time parsing, ZIP extraction, and image preprocessing.
Batch 3: RESOLUTION_MAP for aspect ratio × export resolution combinations.
"""

import os
import re
import zipfile
import shutil
from pathlib import Path
from typing import Any

import pandas as pd
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw

def make_clean_filename(raw_name: str, default_name: str = "output", extension: str = "") -> str:
    """
    Clean output filenames safely:
    - remove invalid filename characters
    - avoid empty names
    - preserve clean extensions
    - avoid duplicate extensions like `.mp4.mp4`
    - return a safe local filename
    """
    name = raw_name.strip() if raw_name and raw_name.strip() else default_name
    if extension and name.lower().endswith(extension.lower()):
        name = name[:-len(extension)]
    name = "".join(c for c in name if c.isalnum() or c in "-_ ")
    name = name.strip().replace(" ", "_")
    if not name:
        name = default_name
    return f"{name}{extension}"

# ---------------------------------------------------------------------------
# Time parsing helpers
# ---------------------------------------------------------------------------

from timeline_time_parser import parse_time_to_seconds

def parse_time(time_str: str) -> float:
    """
    Deprecated wrapper around parse_time_to_seconds for legacy support.
    """
    res = parse_time_to_seconds(time_str, allow_relative=False)
    if res is None:
        raise ValueError(f"Cannot parse time string: '{time_str}'")
    return res

def seconds_to_mmss(seconds: float) -> str:
    """Format seconds as MM:SS.mmm"""
    m = int(seconds // 60)
    s = seconds - m * 60
    return f"{m:02d}:{s:06.3f}"


# ---------------------------------------------------------------------------
# Resolution system (Batch 3)
# ---------------------------------------------------------------------------

# Full resolution lookup: (aspect_ratio, export_resolution) → (width, height)
RESOLUTION_MAP: dict[tuple[str, str], tuple[int, int]] = {
    # 16:9 landscape
    ("16:9", "720p"):  (1280,  720),
    ("16:9", "1080p"): (1920, 1080),
    ("16:9", "2K"):    (2560, 1440),
    ("16:9", "4K"):    (3840, 2160),
    # 9:16 portrait (Shorts / Reels / TikTok)
    ("9:16", "720p"):  ( 720, 1280),
    ("9:16", "1080p"): (1080, 1920),
    ("9:16", "2K"):    (1440, 2560),
    ("9:16", "4K"):    (2160, 3840),
    # 1:1 square
    ("1:1",  "720p"):  ( 720,  720),
    ("1:1",  "1080p"): (1080, 1080),
    ("1:1",  "2K"):    (1440, 1440),
    ("1:1",  "4K"):    (2160, 2160),
}

# Legacy alias: maps old video_format strings to 1080p dimensions.
# Used only by the legacy /api/generate endpoint for backward compatibility.
FORMAT_DIMENSIONS: dict[str, tuple[int, int]] = {
    ar: RESOLUTION_MAP[(ar, "1080p")]
    for ar in ("16:9", "9:16", "1:1")
}


def get_resolution(aspect_ratio: str, export_resolution: str) -> tuple[int, int]:
    """
    Return (width, height) for the given aspect_ratio + export_resolution combo.
    Falls back to 1080p 16:9 if the combination is unknown.
    """
    return RESOLUTION_MAP.get((aspect_ratio, export_resolution), (1920, 1080))


# ---------------------------------------------------------------------------
# CSV parsing & validation
# ---------------------------------------------------------------------------

def parse_and_validate_csv(csv_path: str) -> tuple[bool, list[dict], float, list[str], list[str], str]:
    """
    Load the timestamp CSV and return (rows, warnings, errors).

    Required columns: image, start, end
    Optional column:  text
    """
    warnings: list[str] = []
    errors: list[str] = []
    rows: list[dict] = []

    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        errors.append(f"Failed to read CSV: {e}")
        return False, rows, 0.0, errors, warnings, ""

    # Normalise column names
    df.columns = [c.strip().lower() for c in df.columns]

    required = {"image", "start", "end"}
    missing_cols = required - set(df.columns)
    if missing_cols:
        errors.append(f"CSV is missing required columns: {', '.join(missing_cols)}")
        return False, rows, 0.0, errors, warnings, ""

    if "text" not in df.columns:
        df["text"] = ""

    for idx, row in df.iterrows():
        row_num = idx + 2  # 1-indexed, row 1 = header
        image_name = str(row["image"]).strip()
        text = str(row.get("text", "")).strip()

        # Parse start time
        try:
            start_sec = parse_time(str(row["start"]))
        except ValueError as e:
            errors.append(f"Row {row_num}: invalid start time — {e}")
            continue

        # Parse end time
        try:
            end_sec = parse_time(str(row["end"]))
        except ValueError as e:
            errors.append(f"Row {row_num}: invalid end time — {e}")
            continue

        # Validate end > start
        if end_sec <= start_sec:
            errors.append(
                f"Row {row_num} ({image_name}): end time ({row['end']}) must be after start time ({row['start']})"
            )
            continue

        rows.append(
            {
                "image": image_name,
                "start": start_sec,
                "end": end_sec,
                "duration": round(end_sec - start_sec, 4),
                "text": text,
                "row_num": row_num,
            }
        )

    # Check for timeline gaps and overlaps (only on valid rows)
    rows_sorted = sorted(rows, key=lambda r: r["start"])
    for i in range(1, len(rows_sorted)):
        prev, curr = rows_sorted[i - 1], rows_sorted[i]
        gap = round(curr["start"] - prev["end"], 4)
        if gap > 0.01:
            warnings.append(
                f"Timeline gap of {gap:.3f}s between '{prev['image']}' (ends {seconds_to_mmss(prev['end'])}) "
                f"and '{curr['image']}' (starts {seconds_to_mmss(curr['start'])})"
            )
        elif gap < -0.01:
            warnings.append(
                f"Timeline overlap of {-gap:.3f}s between '{prev['image']}' (ends {seconds_to_mmss(prev['end'])}) "
                f"and '{curr['image']}' (starts {seconds_to_mmss(curr['start'])})"
            )

    if errors:
        return False, rows, 0.0, errors, warnings, ""

    # Format normalized_csv
    out_csv_lines = ["image,start,end,text"]
    for r in rows:
        img_name = r["image"]
        if "," in img_name or '"' in img_name or "\n" in img_name or "\r" in img_name:
            img_name = f'"{img_name.replace(chr(34), chr(34)+chr(34))}"'
            
        text_str = r["text"]
        if "," in text_str or '"' in text_str or "\n" in text_str or "\r" in text_str:
            text_str = f'"{text_str.replace(chr(34), chr(34)+chr(34))}"'
            
        out_csv_lines.append(f'{img_name},{r["start"]},{r["end"]},{text_str}')
        
    normalized_csv = "\n".join(out_csv_lines)
    total_dur = rows[-1]["end"] if rows else 0.0
    return True, rows, total_dur, errors, warnings, normalized_csv


# ---------------------------------------------------------------------------
# ZIP extraction
# ---------------------------------------------------------------------------

def extract_zip_safely(zip_path: str, extract_to: str) -> tuple[set[str], list[str]]:
    """
    Extract an images ZIP to extract_to directory.
    Returns (set of extracted filenames, list of errors).
    """
    errors: list[str] = []
    extracted: set[str] = set()
    allowed_extensions = {".jpg", ".jpeg", ".png", ".webp"}

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.namelist():
                # Security: skip paths with directory traversal
                member_path = Path(member)
                if member_path.is_absolute() or ".." in member_path.parts:
                    errors.append(f"Skipped unsafe ZIP entry: {member}")
                    continue

                ext = member_path.suffix.lower()
                if ext not in allowed_extensions:
                    # Skip directories and non-image files silently
                    continue

                # Flatten: use only the filename, not subdirectory structure
                filename = member_path.name
                dest = os.path.join(extract_to, filename)
                with zf.open(member) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                extracted.add(filename)
    except zipfile.BadZipFile:
        errors.append("The uploaded file is not a valid ZIP archive.")
    except Exception as e:
        errors.append(f"ZIP extraction failed: {e}")

    return extracted, errors


# ---------------------------------------------------------------------------
# Image preprocessing & Visual Styles
# ---------------------------------------------------------------------------

def apply_visual_style(img: Image.Image, visual_effect: str, effect_strength: str) -> Image.Image:
    if visual_effect == "none":
        return img

    s = {"low": 0.6, "medium": 1.0, "high": 1.4}.get(effect_strength, 1.0)

    if visual_effect == "black_and_white":
        img = img.convert("L").convert("RGB")
        img = ImageEnhance.Contrast(img).enhance(1.0 + 0.2 * s)
        return img

    elif visual_effect == "high_contrast":
        img = ImageEnhance.Contrast(img).enhance(1.0 + 0.3 * s)
        img = ImageEnhance.Sharpness(img).enhance(1.0 + 0.5 * s)
        img = ImageEnhance.Color(img).enhance(1.0 + 0.1 * s)
        return img

    elif visual_effect == "clean_bright":
        img = ImageEnhance.Brightness(img).enhance(1.0 + 0.12 * s)
        img = ImageEnhance.Contrast(img).enhance(1.0 + 0.1 * s)
        return img

    elif visual_effect == "warm":
        img = ImageEnhance.Color(img).enhance(1.0 + 0.15 * s)
        overlay = Image.new("RGB", img.size, (255, 170, 0))
        img = Image.blend(img, overlay, 0.08 * s)
        return img

    elif visual_effect == "cinematic":
        img = ImageEnhance.Contrast(img).enhance(1.0 + 0.15 * s)
        img = ImageEnhance.Color(img).enhance(1.0 + 0.1 * s)
        
        overlay = Image.new("RGB", img.size, (255, 140, 0))
        img = Image.blend(img, overlay, 0.05 * s)
        
        # Fast Vignette
        w, h = img.size
        sw, sh = 256, 256
        mask = Image.new('L', (sw, sh), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((20, 20, 236, 236), fill=255)
        try:
            mask = mask.filter(ImageFilter.BoxBlur(20))
        except AttributeError:
            mask = mask.filter(ImageFilter.GaussianBlur(20))
        mask = mask.resize((w, h), Image.BILINEAR)
        
        black = Image.new("RGB", (w, h), (0, 0, 0))
        vignetted = Image.composite(img, black, mask)
        img = Image.blend(img, vignetted, 0.4 * s)

        return img

    return img


def preprocess_image(
    image_path: str,
    output_path: str,
    target_w: int,
    target_h: int,
    fit_mode: str = "cover",
    visual_effect: str = "none",
    effect_strength: str = "medium",
) -> None:
    """
    Resize/crop an image to match the exact target dimensions (target_w × target_h).

    fit_mode='cover'   -> fill canvas, crop center
    fit_mode='contain' -> fit inside canvas with blurred background
    """
    img = Image.open(image_path).convert("RGB")
    src_w, src_h = img.size

    if fit_mode == "cover":
        # Scale up so the shortest dimension fills the canvas, then center-crop
        scale = max(target_w / src_w, target_h / src_h)
        new_w = int(src_w * scale)
        new_h = int(src_h * scale)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        left = (new_w - target_w) // 2
        top = (new_h - target_h) // 2
        img = img.crop((left, top, left + target_w, top + target_h))

    elif fit_mode == "contain":
        # Scale so the longest dimension fits, centre on blurred background
        scale = min(target_w / src_w, target_h / src_h)
        new_w = int(src_w * scale)
        new_h = int(src_h * scale)

        # Blurred background: scale & crop cover-style, then heavy blur
        bg_scale = max(target_w / src_w, target_h / src_h)
        bg_w = int(src_w * bg_scale)
        bg_h = int(src_h * bg_scale)
        bg = img.resize((bg_w, bg_h), Image.LANCZOS)
        l_bg = (bg_w - target_w) // 2
        t_bg = (bg_h - target_h) // 2
        bg = bg.crop((l_bg, t_bg, l_bg + target_w, t_bg + target_h))
        bg = bg.filter(ImageFilter.GaussianBlur(radius=30))

        # Dim background slightly for depth
        bg_arr = np.array(bg, dtype=np.float32)
        bg_arr *= 0.5
        bg = Image.fromarray(bg_arr.astype(np.uint8))

        # Paste sharp foreground centred
        fg = img.resize((new_w, new_h), Image.LANCZOS)
        x = (target_w - new_w) // 2
        y = (target_h - new_h) // 2
        bg.paste(fg, (x, y))
        img = bg

    else:
        img = img.resize((target_w, target_h), Image.LANCZOS)

    # Apply visual style filter
    img = apply_visual_style(img, visual_effect, effect_strength)

    img.save(output_path, "JPEG", quality=95)
