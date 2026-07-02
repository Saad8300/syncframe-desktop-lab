"""
media_timeline_generator.py
Generates a final video from:
  - Main audio track
  - ZIP of media files (images and videos)
  - Timeline CSV (start, end, asset, text)

Batch 11B. Uses MoviePy 1.0.3 + Pillow + NumPy.
"""

import csv
import io
import os
import shutil
import threading
import logging
import zipfile
import textwrap
from pathlib import Path
from typing import Optional, Callable, Any, Dict, List, Tuple

import numpy as np
from moviepy.editor import (
    VideoFileClip,
    ImageClip,
    CompositeVideoClip,
    concatenate_videoclips,
    AudioFileClip
)
from moviepy.video.fx.all import resize, loop

from video_timeline_generator import (
    _apply_visual_style_to_clip,
    _apply_transition_to_pair,
    _load_media_clip,
    _make_watermark_overlay,
)

from media_helpers import apply_motion_to_clip, mix_background_music, pad_clip_to_size

logger = logging.getLogger(__name__)

# Pillow compatibility shim
try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    if not hasattr(Image, "ANTIALIAS"):
        try:
            Image.ANTIALIAS = Image.Resampling.LANCZOS
        except AttributeError:
            try:
                Image.ANTIALIAS = Image.LANCZOS
            except AttributeError:
                Image.ANTIALIAS = Image.BICUBIC
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Tables & Constants
# ---------------------------------------------------------------------------

FORMAT_DIMENSIONS: Dict[str, Dict[str, Tuple[int, int]]] = {
    "9:16":  {"720p": (720,  1280), "1080p": (1080, 1920), "2K": (1440, 2560), "4K": (2160, 3840)},
    "16:9": {"720p": (1280, 720),  "1080p": (1920, 1080), "2K": (2560, 1440), "4K": (3840, 2160)},
    "1:1":  {"720p": (720,  720),  "1080p": (1080, 1080), "2K": (1440, 1440), "4K": (2160, 2160)},
}

ALLOWED_EXTS = {".mp4", ".mov", ".webm", ".png", ".jpg", ".jpeg"}
VIDEO_EXTS = {".mp4", ".mov", ".webm"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg"}

PROFILE_SETTINGS = {
    "fast_preview": {"fps": 24, "preset": "ultrafast", "crf": 28, "audio_bitrate": "128k"},
    "balanced":     {"fps": 30, "preset": "medium",    "crf": 23, "audio_bitrate": "192k"},
    "high_quality": {"fps": 30, "preset": "slow",      "crf": 18, "audio_bitrate": "256k"},
}

class MediaTimelineCancelled(Exception):
    pass

class MediaTimelineError(Exception):
    pass

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_black_clip(width: int, height: int, duration: float, fps: int):
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    clip = ImageClip(frame, duration=duration)
    clip = clip.set_fps(fps)
    return clip

def _make_text_overlay_frame(
    width: int, height: int, text: str,
    pos: str, size: str, color: str, bg: str, width_mode: str, align: str
) -> tuple[np.ndarray, bool]:
    """Create a transparent image with styled text overlay."""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 1. Font Size
    pct = {"small": 0.03, "medium": 0.04, "large": 0.05, "extra_large": 0.06}.get(size, 0.04)
    fs = max(16, int(height * pct))
    
    font_reduced = False
    
    # Simple default font
    try:
        # standard fallback on mac/linux
        font_path = "/System/Library/Fonts/Supplemental/Arial.ttf" if os.path.exists("/System/Library/Fonts/Supplemental/Arial.ttf") else "Arial.ttf"
        font = ImageFont.truetype(font_path, fs)
    except Exception:
        font = ImageFont.load_default()
        if hasattr(font, 'size') and font.size < 20: fs = 20
        
    # 2. Colors
    c_map = {"white": (255,255,255), "yellow": (255,215,0), "black": (0,0,0), "accent": (139,92,246)}
    txt_col = c_map.get(color, (255,255,255))
    
    # 3. Text Wrapping
    w_map = {"narrow": 0.55, "medium": 0.70, "wide": 0.85}
    max_w = int(width * w_map.get(width_mode, 0.85))
    
    avg_char_w = draw.textlength("a", font=font) if hasattr(draw, "textlength") else fs * 0.6
    chars_per_line = max(10, int(max_w / avg_char_w))
    lines = textwrap.wrap(text, width=chars_per_line)
    
    try:
        lh = draw.textbbox((0,0), "A", font=font)[3] - draw.textbbox((0,0), "A", font=font)[1]
    except Exception:
        lh = fs
    
    line_spacing = int(lh * 1.3)
    total_h = line_spacing * len(lines)
    
    # 4. Box dimensions and Font Reduction Check
    pad_x = int(width * 0.03)
    pad_y = int(height * 0.02)
    
    # If text is too tall, reduce font size to fit safely
    safe_max_h = height * 0.8
    while total_h > safe_max_h and fs > 16:
        fs -= 4
        font_reduced = True
        try:
            font = ImageFont.truetype(font_path, fs)
        except Exception:
            break
        avg_char_w = draw.textlength("a", font=font) if hasattr(draw, "textlength") else fs * 0.6
        chars_per_line = max(10, int(max_w / avg_char_w))
        lines = textwrap.wrap(text, width=chars_per_line)
        try:
            lh = draw.textbbox((0,0), "A", font=font)[3] - draw.textbbox((0,0), "A", font=font)[1]
        except Exception:
            lh = fs
        line_spacing = int(lh * 1.3)
        total_h = line_spacing * len(lines)
    
    box_w = 0
    for line in lines:
        try:
            lw = draw.textlength(line, font=font)
        except Exception:
            lw = len(line) * fs * 0.6
        box_w = max(box_w, int(lw))
        
    box_w = min(box_w + pad_x*2, width)
    box_h = total_h + pad_y*2
    
    # 5. Positioning
    safe_x = int(width * 0.05)
    safe_y = int(height * 0.05)
    
    if pos == "center":
        box_x = (width - box_w) // 2
        box_y = (height - box_h) // 2
    elif pos == "top_center":
        box_x = (width - box_w) // 2
        box_y = safe_y
    elif pos == "bottom_left":
        box_x = safe_x
        box_y = height - box_h - safe_y
    elif pos == "bottom_right":
        box_x = width - box_w - safe_x
        box_y = height - box_h - safe_y
    elif pos == "lower_third":
        box_x = (width - box_w) // 2
        box_y = int(height * 0.66) - (box_h // 2)
    else: # bottom_center
        box_x = (width - box_w) // 2
        box_y = height - box_h - safe_y
        
    # 6. Draw Background
    if bg in ("dark_box", "light_box", "blur_box"):
        bg_col = (0, 0, 0, 180)
        if bg == "light_box":
            bg_col = (255, 255, 255, 200)
            if txt_col == (255, 255, 255): txt_col = (0, 0, 0)
        elif bg == "blur_box":
            bg_col = (20, 20, 20, 150) # softer translucent dark box fallback
            
        draw.rounded_rectangle([box_x, box_y, box_x+box_w, box_y+box_h], radius=int(height*0.015), fill=bg_col)
    
    # 7. Draw Text
    y = box_y + pad_y
    for line in lines:
        try:
            lw = draw.textlength(line, font=font)
        except Exception:
            lw = len(line) * fs * 0.6
            
        if align == "left":
            x = box_x + pad_x
        elif align == "right":
            x = box_x + box_w - pad_x - lw
        else: # center
            x = box_x + (box_w - lw) / 2
            
        if bg == "soft_shadow":
            shadow_offset = max(2, int(height * 0.003))
            draw.text((x + shadow_offset, y + shadow_offset), line, font=font, fill=(0,0,0,180))
            
        draw.text((x, y), line, font=font, fill=txt_col + (255,))
        y += line_spacing
        
    return np.array(img), font_reduced

def _make_text_clip(
    width: int, height: int, text: str, duration: float, fps: int,
    pos: str, size: str, color: str, bg: str, width_mode: str, align: str
):
    rgba_frame, font_reduced = _make_text_overlay_frame(width, height, text, pos, size, color, bg, width_mode, align)
    rgb_frame = rgba_frame[:, :, :3]
    alpha_frame = rgba_frame[:, :, 3] / 255.0
    
    clip = ImageClip(rgb_frame, duration=duration).set_fps(fps)
    mask = ImageClip(alpha_frame, duration=duration, ismask=True).set_fps(fps)
    clip = clip.set_mask(mask)
    return clip, font_reduced

def _validate_clip(clip: Any, label: str) -> None:
    if clip is None:
        raise MediaTimelineError(f"Invalid clip at {label}: clip is None.")
    if not hasattr(clip, "get_frame"):
        raise MediaTimelineError(f"Invalid clip at {label}: no get_frame.")
    dur = getattr(clip, "duration", None)
    if dur is None or dur <= 0:
        raise MediaTimelineError(f"Invalid clip at {label}: duration is {dur!r}.")
    try:
        clip.get_frame(0.0)
    except Exception as e:
        raise MediaTimelineError(f"Invalid clip at {label}: get_frame(0) failed — {e}.")

# ---------------------------------------------------------------------------
# Extraction & Parsing
# ---------------------------------------------------------------------------

def extract_media_zip(zip_path: str, dest_dir: str) -> dict[str, str]:
    media_map: dict[str, str] = {}
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.infolist():
                name = member.filename
                if member.is_dir(): continue
                basename = Path(name).name
                if not basename or basename.startswith(".") or "__MACOSX" in name or ".DS_Store" in name: 
                    continue
                ext = Path(basename).suffix.lower()
                
                if ext not in ALLOWED_EXTS:
                    continue
                    
                target_path = (dest / basename).resolve()
                if not str(target_path).startswith(str(dest.resolve())): 
                    continue
                    
                if basename.lower() in media_map:
                    raise MediaTimelineError(f"Duplicate media filename found in ZIP: {basename}")
                    
                with zf.open(member) as src, open(target_path, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                media_map[basename.lower()] = str(target_path)
    except zipfile.BadZipFile:
        raise MediaTimelineError("Uploaded ZIP file is invalid or corrupted.")
            
    if not media_map:
        raise MediaTimelineError("Media ZIP does not contain any supported images or videos.")
        
    return media_map

def parse_media_csv(csv_path: str, media_map: dict[str, str]) -> tuple[bool, list[dict], float, list[str], list[str], str]:
    rows: list[dict] = []
    warnings: list[str] = []
    errors: list[str] = []

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        content = f.read()

    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        errors.append("CSV is empty or has no header row.")
        return False, rows, 0.0, errors, warnings, ""

    lower_fields = [f.lower().strip() for f in reader.fieldnames]
    
    start_col = next((f for f in lower_fields if f == "start"), None)
    end_col   = next((f for f in lower_fields if f == "end"), None)
    asset_col = next((f for f in lower_fields if "asset" in f or "image" in f or "video" in f), None)
    text_col  = next((f for f in lower_fields if f == "text"), None)
    
    # Optional styling columns
    pos_col   = next((f for f in lower_fields if f == "text_position"), None)
    size_col  = next((f for f in lower_fields if f == "text_size"), None)
    color_col = next((f for f in lower_fields if f == "text_color"), None)
    bg_col    = next((f for f in lower_fields if f == "text_background"), None)
    align_col = next((f for f in lower_fields if f == "text_alignment"), None)

    if not start_col: errors.append("CSV is missing required column: start")
    if not end_col: errors.append("CSV is missing required column: end")
    if not asset_col: errors.append("CSV is missing required column: asset")
    if errors:
        return rows, warnings, errors

    reader.fieldnames = lower_fields

    parsed_raw_rows = []
    for idx, row in enumerate(reader, start=2):
        s_str = row.get(start_col, "").strip()
        e_str = row.get(end_col, "").strip()
        asset_str = row.get(asset_col, "").strip()
        text_str = row.get(text_col, "").strip() if text_col else ""
        
        # Override styles
        t_pos   = row.get(pos_col, "").strip() if pos_col else ""
        t_size  = row.get(size_col, "").strip() if size_col else ""
        t_col   = row.get(color_col, "").strip() if color_col else ""
        t_bg    = row.get(bg_col, "").strip() if bg_col else ""
        t_align = row.get(align_col, "").strip() if align_col else ""

        if not s_str and not e_str and not asset_str and not text_str:
            continue

        try:
            from backend.timeline_time_parser import parse_time_to_seconds
            start_parsed = parse_time_to_seconds(s_str, allow_relative=False)
            if start_parsed is None:
                errors.append(f"CSV row {idx} has invalid start time: {s_str}")
                continue
            start_sec = float(start_parsed)
        except Exception:
            errors.append(f"CSV row {idx} has invalid start time: {s_str}")
            continue
            
        try:
            end_parsed = parse_time_to_seconds(e_str, allow_relative=True)
            if end_parsed is None:
                errors.append(f"CSV row {idx} has invalid end time: {e_str}")
                continue
            end_sec = float(end_parsed)
        except Exception:
            errors.append(f"CSV row {idx} has invalid end time: {e_str}")
            continue

        if start_sec >= end_sec:
            errors.append(f"CSV row {idx} end time must be greater than start time")
            continue

        if not asset_str and not text_str:
            errors.append(f"CSV row {idx} has no asset and no text. Add an asset filename or text.")
            continue

        asset_path = None
        asset_type = "none"
        if asset_str:
            ext = Path(asset_str).suffix.lower()
            if ext not in ALLOWED_EXTS:
                errors.append(f"CSV row {idx} references \"{asset_str}\", but this file type is not supported.")
                continue
                
            asset_path = media_map.get(asset_str.lower())
            if not asset_path:
                errors.append(f"CSV row {idx} references \"{asset_str}\", but it was not found in the Media ZIP. Make sure the asset name in the CSV exactly matches the filename inside the ZIP.")
                continue
                
            if ext in VIDEO_EXTS:
                asset_type = "video"
            elif ext in IMAGE_EXTS:
                asset_type = "image"

        parsed_raw_rows.append({
            "idx": idx,
            "start": start_sec,
            "end": end_sec,
            "asset_str": asset_str,
            "asset_path": asset_path,
            "asset_type": asset_type,
            "text_str": text_str,
            "t_pos": t_pos, "t_size": t_size, "t_col": t_col, "t_bg": t_bg, "t_align": t_align,
        })

    if errors:
        return False, rows, 0.0, errors, warnings, ""

    # Safe sorting
    parsed_raw_rows.sort(key=lambda r: r["start"])

    prev_end = 0.0
    prev_idx = None
    for r in parsed_raw_rows:
        if r["start"] < prev_end:
            errors.append(f"CSV rows {prev_idx} and {r['idx']} overlap. Please fix timeline timings.")
            continue
            
        if r["start"] > prev_end:
            gap = r["start"] - prev_end
            rows.append({
                "type": "gap",
                "start": prev_end,
                "end": r["start"],
                "duration": gap,
            })

        rows.append({
            "type": "content",
            "start": r["start"],
            "end": r["end"],
            "duration": r["end"] - r["start"],
            "asset_name": r["asset_str"],
            "asset_path": r["asset_path"],
            "asset_type": r["asset_type"],
            "text": r["text_str"],
            "text_position": r["t_pos"],
            "text_size": r["t_size"],
            "text_color": r["t_col"],
            "text_background": r["t_bg"],
            "text_alignment": r["t_align"],
            "row_idx": r["idx"],
        })
        prev_end = r["end"]
        prev_idx = r["idx"]

    if not any(r["type"] == "content" for r in rows):
        if not errors:
            errors.append("No valid content rows found in CSV.")
            return False, rows, 0.0, errors, warnings, ""

    # Format normalized_csv
    out_csv_lines = ["start,end,asset,text"]
    for r in rows:
        if r["type"] == "content":
            asset_name = r["asset_name"]
            if "," in asset_name or '"' in asset_name or "\n" in asset_name or "\r" in asset_name:
                asset_name = f'"{asset_name.replace(chr(34), chr(34)+chr(34))}"'
            
            text_str = r["text"]
            if "," in text_str or '"' in text_str or "\n" in text_str or "\r" in text_str:
                text_str = f'"{text_str.replace(chr(34), chr(34)+chr(34))}"'
                
            out_csv_lines.append(f'{r["start"]},{r["end"]},{asset_name},{text_str}')
            
    normalized_csv = "\n".join(out_csv_lines)
    total_dur = rows[-1]["end"] if rows else 0.0
    return True, rows, total_dur, errors, warnings, normalized_csv

# ---------------------------------------------------------------------------
# Core Generator
# ---------------------------------------------------------------------------

def generate_media_timeline(
    audio_path: str,
    zip_path: str,
    csv_path: str,
    output_path: str,
    temp_dir: str,
    aspect_ratio: str = "9:16",
    export_resolution: str = "1080p",
    fit_mode: str = "cover",
    fill_mode: str = "loop",
    render_profile: str = "balanced",
    text_position: str = "bottom_center",
    text_size: str = "medium",
    text_color: str = "white",
    text_background: str = "soft_shadow",
    text_width: str = "wide",
    text_alignment: str = "center",
    transition: str = "none",
    transition_duration: float = 0.5,
    visual_effect: str = "none",
    effect_strength: str = "medium",
    watermark_text: str = "",
    watermark_position_mode: str = "preset",
    watermark_coordinate_mode: str = "design_canvas",
    watermark_position: str = "bottom_right",
    watermark_x: int = 50,
    watermark_y: int = 50,
    watermark_opacity: float = 0.65,
    watermark_size: int = 20,
    watermark_margin: int = 36,
    motion_style: str = "none",
    motion_intensity: str = "medium",
    background_music_path: Optional[str] = None,
    background_music_volume: float = 15.0,
    background_music_loop: bool = True,
    background_music_fade: bool = True,
    intro_path: Optional[str] = None,
    outro_path: Optional[str] = None,
    cancel_event: threading.Event = None,
    progress_callback: Callable[[int, str], None] = None,
) -> dict:
    
    def report(pct, msg):
        logger.info(f"MediaTimeline: {msg} ({pct}%)")
        if progress_callback:
            progress_callback(pct, msg)
            
    def check_cancel():
        if cancel_event and cancel_event.is_set():
            raise MediaTimelineCancelled("Job cancelled by user.")

    report(5, "Extracting media files from ZIP...")
    media_map = extract_media_zip(zip_path, temp_dir)
    check_cancel()

    report(10, "Parsing timeline CSV...")
    success, rows, total_dur, warnings, errors, norm_csv = parse_media_csv(csv_path, media_map)
    if errors:
        return {"success": False, "warnings": warnings, "errors": errors, "timeline": []}
        
    check_cancel()
    report(15, "Loading main audio...")
    
    main_audio = AudioFileClip(audio_path)
    audio_dur = main_audio.duration
    
    width, height = FORMAT_DIMENSIONS.get(aspect_ratio, {}).get(export_resolution, (1080, 1920))
    prof = PROFILE_SETTINGS.get(render_profile, PROFILE_SETTINGS["balanced"])
    fps = prof["fps"]

    report(20, "Building timeline clips...")
    
    final_clips = []
    _raw_clips = []
    
    try:
        timeline_report = []
        visual_dur = 0.0
        
        for idx, row in enumerate(rows):
            check_cancel()
            
            dur = row["duration"]
            c_type = row["type"]
            
            if dur <= 0:
                warnings.append(f"Skipping row with invalid duration: {dur}s")
                continue
            
            if c_type == "gap":
                if not any("Timeline contains gaps." in w for w in warnings):
                    warnings.append("Timeline contains gaps. Neutral filler clips were added.")
                clip = _make_black_clip(width, height, dur, fps)
                final_clips.append(clip)
                visual_dur += dur
                continue
                
            # It's a content row
            asset_type = row["asset_type"]
            asset_path = row["asset_path"]
            text_str = row["text"]
            
            base_clip = None
            
            if asset_type == "video":
                try:
                    raw = VideoFileClip(asset_path)
                    _raw_clips.append(raw)
                    
                    v_dur = raw.duration
                    if v_dur <= 0.1:
                        warnings.append(f"Row {row['row_idx']}: video too short ({v_dur}s).")
                        base_clip = _make_black_clip(width, height, dur, fps)
                    else:
                        if dur > v_dur:
                            if fill_mode == "loop":
                                base_clip = loop(raw, duration=dur)
                            elif fill_mode == "freeze":
                                freeze = raw.to_ImageClip(t=v_dur - 0.1).set_duration(dur - v_dur)
                                base_clip = concatenate_videoclips([raw, freeze], method="chain")
                            else: # trim_only -> leaves black
                                padding = _make_black_clip(raw.w, raw.h, dur - v_dur, fps)
                                base_clip = concatenate_videoclips([raw, padding], method="chain")
                        else:
                            base_clip = raw.subclip(0, dur)
                except Exception as e:
                    errors.append(f"Video asset \"{Path(asset_path).name}\" could not be processed.")
                    base_clip = _make_black_clip(width, height, dur, fps)
                        
            elif asset_type == "image":
                try:
                    base_clip = ImageClip(asset_path).set_duration(dur)
                except Exception as e:
                    errors.append(f"Image asset \"{Path(asset_path).name}\" could not be processed.")
                    base_clip = _make_black_clip(width, height, dur, fps)
            else: # none / text only
                # For text-only rows, we want a nice background
                # We will create a dark gradient or neutral surface
                # A simple dark gray works nicely and looks premium
                bg_frame = np.full((height, width, 3), (18, 18, 20), dtype=np.uint8)
                base_clip = ImageClip(bg_frame, duration=dur).set_fps(fps)
                
            # Resize
            if asset_type in ("video", "image"):
                base_clip = base_clip.without_audio()
                bw, bh = base_clip.w, base_clip.h
                if bw != width or bh != height:
                    target_ratio = width / height
                    src_ratio = bw / bh
                    
                    if fit_mode == "cover":
                        if src_ratio > target_ratio: # wider, crop sides
                            new_w = int(bh * target_ratio)
                            x_center = bw / 2
                            base_clip = base_clip.crop(x1=x_center - new_w/2, width=new_w)
                        else: # taller, crop top/bottom
                            new_h = int(bw / target_ratio)
                            y_center = bh / 2
                            base_clip = base_clip.crop(y1=y_center - new_h/2, height=new_h)
                        base_clip = base_clip.resize((width, height))
                    else: # contain
                        base_clip = base_clip.resize(width=width) if src_ratio > target_ratio else base_clip.resize(height=height)
                        if base_clip.w != width or base_clip.h != height:
                            # We let apply_background_to_clip handle the padding later instead of doing it here
                            pass

            if asset_type in ("video", "image"):
                # Apply motion FIRST (modifies internal framing/cropping)
                base_clip = apply_motion_to_clip(
                    base_clip, motion_style, motion_intensity, width, height
                )
                
                # Apply Visual Style (before background)
                base_clip = _apply_visual_style_to_clip(base_clip, visual_effect, effect_strength)
                
                # Pad clip to exactly width x height
                base_clip = pad_clip_to_size(base_clip, width, height)
                
            # Overlay Text
            if text_str:
                row_pos = row.get("text_position") or text_position
                row_sz  = row.get("text_size") or text_size
                row_col = row.get("text_color") or text_color
                row_bg  = row.get("text_background") or text_background
                row_wid = row.get("text_width") or text_width
                row_aln = row.get("text_alignment") or text_alignment
                
                txt_clip, font_reduced = _make_text_clip(
                    width, height, text_str, dur, fps,
                    pos=row_pos, size=row_sz, color=row_col, bg=row_bg, width_mode=row_wid, align=row_aln
                )
                if font_reduced:
                    warnings.append(f"Text on row {row['row_idx']} was very long, so font size was reduced to fit safely.")
                base_clip = CompositeVideoClip([base_clip, txt_clip])
                
            base_clip = base_clip.set_fps(fps)
            _validate_clip(base_clip, f"Row {row['row_idx']}")
            final_clips.append(base_clip)
            visual_dur += dur
            
            timeline_report.append({
                "image": row["asset_name"],
                "start": row["start"],
                "end": row["end"],
                "duration": dur,
                "text": text_str,
                "status": "ok",
            })
            
        report(60, "Padding audio/video to match durations...")
        
        # Match audio and visual duration
        if visual_dur < audio_dur:
            warnings.append("Visual timeline is shorter than audio. Padding was added until the audio ends.")
            pad = _make_black_clip(width, height, audio_dur - visual_dur, fps)
            final_clips.append(pad)
            visual_dur = audio_dur

        # Apply transitions
        if transition != "none" and len(final_clips) > 1:
            report(65, "Applying transitions...")
            modified = list(final_clips)
            overlaps = [0.0] * len(modified)

            transition_errors = set()
            transition_skips = {}
            for i in range(len(modified) - 1):
                try:
                    cp, cn, ov = _apply_transition_to_pair(
                        modified[i], modified[i+1],
                        transition, transition_duration,
                        width, height, fps,
                    )
                    modified[i]   = cp
                    modified[i+1] = cn
                    overlaps[i]   = ov
                except ValueError as ve:
                    tr_name = str(ve)
                    transition_skips[tr_name] = transition_skips.get(tr_name, 0) + 1
                except Exception as te:
                    transition_errors.add(str(te))
            
            for tr_name, count in transition_skips.items():
                warnings.append(f"{tr_name} transition was skipped for {count} clip pairs because of unsupported clip timing.")

            if transition_errors:
                err_str = "; ".join(list(transition_errors)[:3])
                warnings.append(
                    f"Transitions failed for some clips and were skipped. Details: {err_str}"
                )

            # Compose with overlaps
            if any(ov > 0 for ov in overlaps):
                start_times: list[float] = [0.0]
                for i in range(1, len(modified)):
                    start_times.append(start_times[-1] + modified[i-1].duration - overlaps[i-1])
                positioned = [c.set_start(s) for c, s in zip(modified, start_times)]
                total_dur  = start_times[-1] + modified[-1].duration
                try:
                    main_video = CompositeVideoClip(positioned, size=(width, height))
                    main_video = main_video.set_duration(total_dur)
                    visual_dur = total_dur
                except Exception as ce:
                    warnings.append(f"Transition compositing failed: {ce}. Falling back to simple concat.")
                    main_video = concatenate_videoclips(final_clips, method="chain")
            else:
                main_video = concatenate_videoclips(modified, method="chain")
        else:
            main_video = concatenate_videoclips(final_clips, method="chain")
            
        if visual_dur > audio_dur:
            warnings.append("Visual timeline is longer than audio. Final video was trimmed to match the main audio.")
            main_video = main_video.subclip(0, audio_dur)
            visual_dur = audio_dur
            
        final_audio = main_audio.set_duration(visual_dur)
        if background_music_path:
            try:
                final_audio, _ = mix_background_music(
                    main_audio_clip=final_audio,
                    music_path=background_music_path,
                    final_duration=visual_dur,
                    volume=background_music_volume,
                    loop=background_music_loop,
                    fade=background_music_fade
                )
            except Exception as m_e:
                warnings.append(str(m_e))

        main_video = main_video.set_audio(final_audio)

        # Watermark
        use_wm = bool(watermark_text.strip())
        if use_wm:
            report(70, "Applying watermark...")
            try:
                wm_overlay = _make_watermark_overlay(
                    width=width, height=height,
                    text=watermark_text,
                    position_mode=watermark_position_mode,
                    position=watermark_position,
                    coordinate_mode=watermark_coordinate_mode,
                    aspect_ratio=aspect_ratio,
                    x_pos=watermark_x, y_pos=watermark_y,
                    opacity=watermark_opacity,
                    size=watermark_size, margin=watermark_margin,
                )
                if watermark_position_mode == "custom" and watermark_coordinate_mode == "final_pixels":
                    # basic safety check for warning
                    if watermark_x < 0 or watermark_y < 0 or watermark_x > width * 0.9 or watermark_y > height * 0.9:
                        warnings.append("Watermark custom X/Y places the watermark partly outside the frame.")
                wm_clip = ImageClip(wm_overlay, ismask=False).set_duration(visual_dur).set_fps(fps)
                
                # Extract audio to preserve it during visual composite
                saved_audio = main_video.audio
                main_video = CompositeVideoClip([main_video.without_audio(), wm_clip], size=(width, height))
                if saved_audio:
                    main_video = main_video.set_audio(saved_audio)
            except Exception as e:
                warnings.append(f"Watermark failed to apply: {e}")


        # ── Step 7.5: Text Overlay (Batch 16A) ────────────────────────────────
        if text_overlay_config and text_overlay_config.get("enabled"):
            report(72, "Applying text overlay")
            overlay_arr = make_text_overlay(
                target_w=width,
                target_h=height,
                text=text_overlay_config.get("text", ""),
                font_family=text_overlay_config.get("font_family", "Inter"),
                font_size_percent=text_overlay_config.get("font_size_percent", 5.0),
                font_weight=text_overlay_config.get("font_weight", "Bold"),
                color=text_overlay_config.get("color", "#FFFFFF"),
                opacity=text_overlay_config.get("opacity", 100.0),
                x_percent=text_overlay_config.get("x_percent", 50.0),
                y_percent=text_overlay_config.get("y_percent", 90.0),
                align=text_overlay_config.get("align", "center"),
                max_width_percent=text_overlay_config.get("max_width_percent", 80.0),
                shadow_enabled=text_overlay_config.get("shadow_enabled", True),
                stroke_enabled=text_overlay_config.get("stroke_enabled", True),
                stroke_color=text_overlay_config.get("stroke_color", "#000000"),
                bg_enabled=text_overlay_config.get("background_enabled", False),
                bg_color=text_overlay_config.get("background_color", "#000000"),
                bg_opacity=text_overlay_config.get("background_opacity", 50.0)
            )
            if overlay_arr is not None:
                overlay_clip = ImageClip(overlay_arr).set_duration(visual_dur)
                saved_audio = main_video.audio
                main_video = CompositeVideoClip([main_video.without_audio(), overlay_clip], size=(width, height))
                if saved_audio:
                    main_video = main_video.set_audio(saved_audio)
            else:
                warnings.append("Text overlay could not be rendered; continuing without it.")
            check_cancel()

        # Intro / Outro
        use_intro = intro_path is not None and os.path.isfile(intro_path)
        use_outro = outro_path is not None and os.path.isfile(outro_path)

        if use_intro or use_outro:
            report(75, "Adding intro/outro...")
            clips_to_concat = []
            
            if use_intro:
                try:
                    intro_clip = _load_media_clip(intro_path, width, height, fps, _raw_clips)
                    clips_to_concat.append(intro_clip)
                except Exception as ie:
                    warnings.append(f"Intro video could not be loaded: {ie}. Skipping intro.")

            clips_to_concat.append(main_video)

            if use_outro:
                try:
                    outro_clip = _load_media_clip(outro_path, width, height, fps, _raw_clips)
                    clips_to_concat.append(outro_clip)
                except Exception as oe:
                    warnings.append(f"Outro video could not be loaded: {oe}. Skipping outro.")

            if len(clips_to_concat) > 1:
                try:
                    main_video = concatenate_videoclips(clips_to_concat, method="chain")
                except Exception as ce:
                    warnings.append(f"Could not merge intro/outro with main timeline: {ce}")

        report(85, "Encoding final MP4...")
        
        logger_func = "bar" if not progress_callback else None
        
        if main_video.audio is None:
            logger.error("CRITICAL: Final video clip has no audio track attached before export.")
            return {
                "success": False,
                "timeline": timeline_report,
                "warnings": warnings,
                "errors": ["Visual generation completed but the audio track was unexpectedly dropped before export. Generation aborted."],
                "cancelled": False
            }
        else:
            logger.info("Final clip has audio: true")
            logger.info(f"Final visual duration: {main_video.duration:.2f}s, Final audio duration: {main_video.audio.duration:.2f}s")
            
        temp_audio_f = os.path.join(temp_dir, "temp_audio.mp4")
        
        main_video.write_videofile(
            output_path,
            fps=fps,
            codec="libx264",
            preset=prof["preset"],
            ffmpeg_params=["-crf", str(prof["crf"]), "-pix_fmt", "yuv420p"],
            audio_codec="aac",
            temp_audiofile=temp_audio_f,
            remove_temp=True,
            audio_bitrate=prof["audio_bitrate"],
            threads=max(1, os.cpu_count() - 1),
            logger=logger_func
        )
        
        report(100, "Done.")
        
        return {
            "success": True,
            "timeline": timeline_report,
            "warnings": warnings,
            "errors": [],
            "visual_duration": visual_dur,
            "audio_duration": audio_dur,
        }
        
    finally:
        main_audio.close()
        for raw in _raw_clips:
            try: raw.close()
            except Exception: pass

