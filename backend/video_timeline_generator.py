"""
video_timeline_generator.py
Generates a final video from:
  - Main audio track
  - ZIP of video clips
  - Timeline CSV (start, end, video)

Batch 10B + 10C. Uses MoviePy 1.0.3 + Pillow + NumPy.

Critical bug fix (10C):
  raw.close() must NOT be called while derived subclips are still alive.
  We keep all raw VideoFileClip handles open until AFTER write_videofile
  completes. A _raw_clips list collects every VideoFileClip opened so they
  can be closed safely in the finally block.
"""

import csv
import io
import os
import shutil
import threading
import logging
import zipfile
from pathlib import Path
from typing import Optional, Callable, Any

import numpy as np
from PIL import Image, ImageEnhance, ImageDraw, ImageFont

from moviepy.editor import (
    VideoFileClip,
    AudioFileClip,
    ImageClip,
    CompositeVideoClip,
    concatenate_videoclips
)
from moviepy.video.fx.all import fadein, fadeout

logger = logging.getLogger(__name__)

from media_helpers import resolve_watermark_position
from text_overlay import make_text_overlay

# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------

FORMAT_DIMENSIONS: dict[str, dict[str, tuple[int, int]]] = {
    "9:16":  {"720p": (720,  1280), "1080p": (1080, 1920), "2K": (1440, 2560), "4K": (2160, 3840)},
    "16:9": {"720p": (1280, 720),  "1080p": (1920, 1080), "2K": (2560, 1440), "4K": (3840, 2160)},
    "1:1":  {"720p": (720,  720),  "1080p": (1080, 1080), "2K": (1440, 1440), "4K": (2160, 2160)},
}

ALLOWED_VIDEO_EXTS = {".mp4", ".mov", ".webm"}

PROFILE_SETTINGS = {
    "fast_preview": {"fps": 24, "preset": "ultrafast", "crf": 28, "audio_bitrate": "128k"},
    "balanced":     {"fps": 30, "preset": "medium",    "crf": 23, "audio_bitrate": "192k"},
    "high_quality": {"fps": 30, "preset": "slow",      "crf": 18, "audio_bitrate": "256k"},
}

# Transitions that use overlap compositing vs. fade-only
OVERLAP_TRANSITIONS = {
    "crossfade", "slide_left", "slide_right", "slide_up", "slide_down",
    "push_left", "push_right", "zoom_in", "zoom_out", "blur_crossfade",
}
FADE_TRANSITIONS = {"fade", "fade_black", "fade_white", "flash"}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class VideoTimelineCancelled(Exception):
    pass


class VideoTimelineError(Exception):
    pass


# ---------------------------------------------------------------------------
# Pillow compatibility shim
# ---------------------------------------------------------------------------

try:
    from PIL import Image
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
# Safe black clip factory  (ImageClip-backed, never ColorClip)
# ---------------------------------------------------------------------------

def _make_black_clip(width: int, height: int, duration: float, fps: int):
    """
    A solid-black clip backed by a numpy array. Works reliably with
    concatenate_videoclips(method='chain') and get_frame().
    """
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    clip = ImageClip(frame, duration=duration)
    clip = clip.set_fps(fps)
    return clip


# ---------------------------------------------------------------------------
# Clip validation
# ---------------------------------------------------------------------------

def _validate_clip(clip: Any, label: str) -> None:
    """Raise VideoTimelineError with a clear message if the clip is invalid."""
    if clip is None:
        raise VideoTimelineError(f"Invalid clip at {label}: clip is None.")
    if not hasattr(clip, "get_frame"):
        raise VideoTimelineError(
            f"Invalid clip at {label}: type '{type(clip).__name__}' has no get_frame."
        )
    dur = getattr(clip, "duration", None)
    if dur is None or dur <= 0:
        raise VideoTimelineError(
            f"Invalid clip at {label}: duration is {dur!r} (must be > 0)."
        )
    # Actually call get_frame to prove the reader is still alive
    try:
        clip.get_frame(0.0)
    except Exception as e:
        raise VideoTimelineError(
            f"Invalid clip at {label}: get_frame(0) failed — {e}. "
            f"The source reader may have been closed prematurely."
        )


# ---------------------------------------------------------------------------
# ZIP extraction
# ---------------------------------------------------------------------------

def extract_videos_zip(zip_path: str, dest_dir: str) -> dict[str, str]:
    """
    Extract supported video files from the ZIP.
    Returns {filename_lower: abs_path}.
    Raises VideoTimelineError on duplicates or unsupported video formats.
    """
    video_map: dict[str, str] = {}
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    
    # Known video extensions that we don't support
    UNSUPPORTED_VIDEO_EXTS = {".avi", ".mkv", ".wmv", ".flv", ".m4v"}

    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.infolist():
            name = member.filename
            if member.is_dir():
                continue
            basename = Path(name).name
            if not basename or basename.startswith(".") or "__MACOSX" in name:
                continue
            ext = Path(basename).suffix.lower()
            
            if ext in UNSUPPORTED_VIDEO_EXTS:
                raise VideoTimelineError(f"Unsupported video file found: {basename}")
                
            if ext not in ALLOWED_VIDEO_EXTS:
                continue
                
            target_path = (dest / basename).resolve()
            if not str(target_path).startswith(str(dest.resolve())):
                logger.warning("Skipping unsafe zip entry: %s", name)
                continue
                
            if basename.lower() in video_map:
                raise VideoTimelineError(f"Duplicate video filename found in ZIP: {basename}")
                
            with zf.open(member) as src, open(target_path, "wb") as dst:
                shutil.copyfileobj(src, dst)
            video_map[basename.lower()] = str(target_path)
            logger.info("Extracted: %s", basename)

    if not video_map:
        raise VideoTimelineError("Videos ZIP does not contain any supported video files.")

    return video_map


# ---------------------------------------------------------------------------
# CSV parsing
# ---------------------------------------------------------------------------

def parse_timeline_csv(
    csv_path: str,
    video_map: dict[str, str],
) -> tuple[bool, list[dict], float, list[str], list[str], str]:
    """Parse start,end,video CSV. Returns (success, rows, total_dur, errors, warnings, norm_csv)."""
    rows: list[dict] = []
    warnings: list[str] = []
    errors: list[str] = []

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        content = f.read()

    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None:
        errors.append("CSV is empty or has no header row.")
        return rows, warnings, errors

    fieldnames_lower = [fn.strip().lower() for fn in reader.fieldnames]
    missing = {"start", "end", "video"} - set(fieldnames_lower)
    if missing:
        errors.append(f"CSV is missing required column: {', '.join(sorted(missing))}")
        return rows, warnings, errors

    col_map = {fn.strip().lower(): fn for fn in reader.fieldnames}

    for i, raw_row in enumerate(reader, start=2):
        start_str = raw_row.get(col_map.get("start", "start"), "").strip()
        end_str   = raw_row.get(col_map.get("end",   "end"),   "").strip()
        video_str = raw_row.get(col_map.get("video", "video"), "").strip()

        if not start_str and not end_str and not video_str:
            continue

        try:
            from backend.timeline_time_parser import parse_time_to_seconds
            sv_parsed = parse_time_to_seconds(start_str, allow_relative=False)
            if sv_parsed is None:
                errors.append(f"CSV row {i} has invalid start time: {start_str}")
                continue
            sv = float(sv_parsed)
        except Exception:
            errors.append(f"CSV row {i} has invalid start time: {start_str}")
            continue
            
        try:
            ev_parsed = parse_time_to_seconds(end_str, allow_relative=True)
            if ev_parsed is None:
                errors.append(f"CSV row {i} has invalid end time: {end_str}")
                continue
            ev = float(ev_parsed)
        except Exception:
            errors.append(f"CSV row {i} has invalid end time: {end_str}")
            continue
            
        if ev <= sv:
            errors.append(f"CSV row {i} end time must be greater than start time")
            continue
        if not video_str:
            errors.append(f"CSV row {i} 'video' column is empty.")
            continue

        vpath = video_map.get(video_str.lower())
        if vpath is None:
            errors.append(
                f"CSV row {i} references \"{video_str}\", but it was not found in the videos ZIP"
            )
            continue

        rows.append({"start": sv, "end": ev, "video": video_str, "video_path": vpath})

    if not rows and not errors:
        errors.append("CSV has no valid data rows.")
        return False, rows, 0.0, errors, warnings, ""

    if errors:
        return False, rows, 0.0, errors, warnings, ""

    rows.sort(key=lambda r: r["start"])

    # Overlap check
    for i in range(1, len(rows)):
        if rows[i]["start"] < rows[i-1]["end"]:
            # +2 because enumerate started at 2 and this is the i-th parsed row
            errors.append(
                f"CSV rows {i+1} and {i+2} overlap. Please fix timeline timings."
            )

    # Gap warnings
    for i in range(1, len(rows)):
        gap = rows[i]["start"] - rows[i-1]["end"]
        if gap > 0.05:
            warnings.append(
                f"Gap of {gap:.2f}s between row {i+1} and row {i+2}. "
                f"Black padding will be inserted."
            )

    # Format normalized_csv
    out_csv_lines = ["start,end,video"]
    for r in rows:
        vid_name = r["video"]
        if "," in vid_name or '"' in vid_name or "\n" in vid_name or "\r" in vid_name:
            vid_name = f'"{vid_name.replace(chr(34), chr(34)+chr(34))}"'
        out_csv_lines.append(f'{r["start"]},{r["end"]},{vid_name}')
        
    normalized_csv = "\n".join(out_csv_lines)
    total_dur = rows[-1]["end"] if rows else 0.0
    return True, rows, total_dur, errors, warnings, normalized_csv


# ---------------------------------------------------------------------------
# Visual style filter applied per-frame on video clips
# ---------------------------------------------------------------------------

def _apply_visual_style_frame(frame, visual_effect: str, strength_factor: float):
    """
    Apply a visual style filter to a single RGB numpy frame.
    Returns a numpy array (H, W, 3) uint8.
    Uses only numpy + PIL — no ImageMagick.
    """
    if visual_effect == "none" or strength_factor <= 0:
        return frame

    img = Image.fromarray(frame.astype("uint8"), "RGB")
    s = strength_factor

    if visual_effect == "black_and_white":
        img = img.convert("L").convert("RGB")
        img = ImageEnhance.Contrast(img).enhance(1.0 + 0.2 * s)

    elif visual_effect == "high_contrast":
        img = ImageEnhance.Contrast(img).enhance(1.0 + 0.3 * s)
        img = ImageEnhance.Sharpness(img).enhance(1.0 + 0.5 * s)
        img = ImageEnhance.Color(img).enhance(1.0 + 0.1 * s)

    elif visual_effect == "clean_bright":
        img = ImageEnhance.Brightness(img).enhance(1.0 + 0.12 * s)
        img = ImageEnhance.Contrast(img).enhance(1.0 + 0.1 * s)

    elif visual_effect == "warm":
        img = ImageEnhance.Color(img).enhance(1.0 + 0.15 * s)
        overlay = Image.new("RGB", img.size, (255, 170, 0))
        img = Image.blend(img, overlay, 0.08 * s)

    elif visual_effect == "cinematic":
        img = ImageEnhance.Contrast(img).enhance(1.0 + 0.15 * s)
        img = ImageEnhance.Color(img).enhance(1.0 + 0.1 * s)
        overlay = Image.new("RGB", img.size, (255, 140, 0))
        img = Image.blend(img, overlay, 0.05 * s)
        # Lightweight vignette
        w, h = img.size
        sw, sh = 128, 128
        mask = Image.new("L", (sw, sh), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((10, 10, 118, 118), fill=255)
        try:
            mask = mask.filter(ImageFilter.BoxBlur(10))
        except AttributeError:
            mask = mask.filter(ImageFilter.GaussianBlur(10))
        mask = mask.resize((w, h), Image.BILINEAR)
        black = Image.new("RGB", (w, h), (0, 0, 0))
        vig = Image.composite(img, black, mask)
        img = Image.blend(img, vig, 0.4 * s)

    return np.array(img)


def _apply_visual_style_to_clip(clip, visual_effect: str, effect_strength: str):
    """
    Wrap a MoviePy clip with a per-frame visual style filter.
    Returns the same clip if visual_effect is 'none'.
    """
    if visual_effect == "none":
        return clip
    s = {"low": 0.6, "medium": 1.0, "high": 1.4}.get(effect_strength, 1.0)
    _ve = visual_effect
    _s  = s
    return clip.fl_image(lambda frame: _apply_visual_style_frame(frame, _ve, _s))


# ---------------------------------------------------------------------------
# Fit a video clip to target dimensions (cover or contain)
# ---------------------------------------------------------------------------

def _fit_clip_to_target(raw_clip, target_w: int, target_h: int, fit_mode: str, fps: int):
    """
    Resize/crop a VideoFileClip to exactly (target_w, target_h).
    Does NOT close raw_clip — caller is responsible for lifecycle.
    Returns a derived clip (subclip/crop/composite).
    """
    src_w, src_h = raw_clip.w, raw_clip.h
    target_ratio = target_w / target_h
    src_ratio    = src_w   / src_h

    if fit_mode == "contain":
        if src_ratio > target_ratio:
            new_w = target_w
            new_h = int(target_w / src_ratio)
        else:
            new_h = target_h
            new_w = int(target_h * src_ratio)
        new_w = max(2, new_w - (new_w % 2))
        new_h = max(2, new_h - (new_h % 2))
        resized = raw_clip.resize((new_w, new_h))
        bg = _make_black_clip(target_w, target_h, raw_clip.duration, fps)
        x_off = (target_w - new_w) // 2
        y_off = (target_h - new_h) // 2
        resized_pos = resized.set_position((x_off, y_off))
        fitted = CompositeVideoClip([bg, resized_pos], size=(target_w, target_h))
    else:  # cover
        if src_ratio > target_ratio:
            new_h = target_h
            new_w = int(target_h * src_ratio)
        else:
            new_w = target_w
            new_h = int(target_w / src_ratio)
        new_w = max(2, new_w + (new_w % 2))
        new_h = max(2, new_h + (new_h % 2))
        resized = raw_clip.resize((new_w, new_h))
        x_off = (new_w - target_w) // 2
        y_off = (new_h - target_h) // 2
        fitted = resized.crop(x1=x_off, y1=y_off, x2=x_off + target_w, y2=y_off + target_h)

    return fitted.set_fps(fps)


# ---------------------------------------------------------------------------
# Build one segment clip — raw stays open until caller closes it
# ---------------------------------------------------------------------------

def _build_segment_clip(
    video_path: str,
    segment_duration: float,
    fill_mode: str,
    target_w: int,
    target_h: int,
    fit_mode: str,
    fps: int,
    row_label: str,
    raw_clips_registry: list,   # caller appends raw handle here
) -> Any:
    """
    Open a video file, fit it to target resolution, and fill segment_duration.

    IMPORTANT: raw VideoFileClip is NOT closed here. It is appended to
    raw_clips_registry so the caller can close it AFTER write_videofile.
    This prevents the 'NoneType get_frame' bug caused by premature close.
    """
    raw = VideoFileClip(video_path, audio=False)
    raw_clips_registry.append(raw)  # track for deferred close
    source_dur = raw.duration

    if source_dur is None or source_dur <= 0:
        raise VideoTimelineError(
            f"Invalid clip at {row_label}: source video has no duration (corrupt/unreadable)."
        )

    fitted = _fit_clip_to_target(raw, target_w, target_h, fit_mode, fps)

    # Fill to segment_duration
    if source_dur >= segment_duration:
        result = fitted.subclip(0, segment_duration)
    else:
        if fill_mode == "loop":
            parts = []
            accumulated = 0.0
            while accumulated < segment_duration - 0.001:
                remaining = segment_duration - accumulated
                part_dur  = min(source_dur, remaining)
                part = fitted.subclip(0, part_dur).set_fps(fps)
                parts.append(part)
                accumulated += part_dur
            result = concatenate_videoclips(parts, method="chain")
        elif fill_mode == "freeze":
            freeze_dur = segment_duration - source_dur
            freeze_t   = max(0.0, source_dur - (1.0 / fps))
            last_frame  = fitted.to_ImageClip(t=freeze_t)
            freeze_part = last_frame.set_duration(freeze_dur).set_fps(fps)
            result = concatenate_videoclips([fitted, freeze_part], method="chain")
        else:  # trim_only
            pad_dur = segment_duration - source_dur
            black   = _make_black_clip(target_w, target_h, pad_dur, fps)
            result  = concatenate_videoclips([fitted, black], method="chain")

    result = result.set_fps(fps).set_duration(segment_duration)
    return result


# ---------------------------------------------------------------------------
# Apply one cross-fade transition between two sequential clips
# ---------------------------------------------------------------------------

def _apply_transition_to_pair(
    clip_prev, clip_next,
    transition: str,
    t_dur: float,
    target_w: int,
    target_h: int,
    fps: int,
) -> tuple:  # (modified_clip_prev, modified_clip_next, overlap_seconds)
    """
    For overlap transitions: returns modified clips and the overlap duration.
    For fade transitions: applies fade-out/fade-in and returns (prev, next, 0.0).
    For 'none': returns clips unchanged with 0.0 overlap.
    """

    if transition == "none" or t_dur <= 0:
        return clip_prev, clip_next, 0.0

    dur_prev = clip_prev.duration
    dur_next = clip_next.duration
    safe_t   = min(t_dur, dur_prev / 2.0, dur_next / 2.0)

    if safe_t <= 0.01:
        raise ValueError(transition.replace("_", " ").title())

    if transition == "crossfade":
        c_next = clip_next.crossfadein(safe_t)
        return clip_prev, c_next, safe_t

    elif transition == "slide_left":
        W = target_w
        def pos_fn(t, to=safe_t, w=W): return (int(w * (1 - min(t/to, 1.0))), 0)
        return clip_prev, clip_next.set_pos(pos_fn), safe_t

    elif transition == "slide_right":
        W = target_w
        def pos_fn(t, to=safe_t, w=W): return (int(-w * (1 - min(t/to, 1.0))), 0)
        return clip_prev, clip_next.set_pos(pos_fn), safe_t

    elif transition == "slide_up":
        H = target_h
        def pos_fn(t, to=safe_t, h=H): return (0, int(h * (1 - min(t/to, 1.0))))
        return clip_prev, clip_next.set_pos(pos_fn), safe_t

    elif transition == "slide_down":
        H = target_h
        def pos_fn(t, to=safe_t, h=H): return (0, int(-h * (1 - min(t/to, 1.0))))
        return clip_prev, clip_next.set_pos(pos_fn), safe_t

    elif transition == "push_left":
        W, D = target_w, dur_prev
        def pos_next(t, to=safe_t, w=W): return (int(w * (1 - min(t/to, 1.0))), 0)
        def pos_prev(t, d=D, to=safe_t, w=W): return (int(-w * min(max(t-d,0)/to, 1.0)), 0)
        return clip_prev.set_pos(pos_prev), clip_next.set_pos(pos_next), safe_t

    elif transition == "push_right":
        W, D = target_w, dur_prev
        def pos_next(t, to=safe_t, w=W): return (int(-w * (1 - min(t/to, 1.0))), 0)
        def pos_prev(t, d=D, to=safe_t, w=W): return (int(w * min(max(t-d,0)/to, 1.0)), 0)
        return clip_prev.set_pos(pos_prev), clip_next.set_pos(pos_next), safe_t

    elif transition == "zoom_in":
        def fl_zi(gf, t, to=safe_t):
            fr = gf(t)
            if t >= to: return fr
            sc = 1.3 - 0.3 * (t / max(to, 0.001))
            h, w = fr.shape[:2]
            cw, ch = int(w/sc), int(h/sc)
            x0, y0 = (w-cw)//2, (h-ch)//2
            cr = fr[y0:y0+ch, x0:x0+cw]
            return np.array(Image.fromarray(cr).resize((w, h), Image.BILINEAR))
        return clip_prev, clip_next.fl(fl_zi).crossfadein(safe_t), safe_t

    elif transition == "zoom_out":
        def fl_zo(gf, t, to=safe_t):
            fr = gf(t)
            if t >= to: return fr
            sc = 0.7 + 0.3 * (t / max(to, 0.001))
            h, w = fr.shape[:2]
            nw, nh = int(w*sc), int(h*sc)
            rz = np.array(Image.fromarray(fr).resize((nw, nh), Image.BILINEAR))
            out = np.zeros_like(fr)
            x0, y0 = (w-nw)//2, (h-nh)//2
            out[y0:y0+nh, x0:x0+nw] = rz
            return out
        return clip_prev, clip_next.fl(fl_zo).crossfadein(safe_t), safe_t

    elif transition == "blur_crossfade":
        def fl_bc(gf, t, to=safe_t):
            fr = gf(t)
            if t >= to: return fr
            prog = t / max(to, 0.001)
            if prog > 0.99: return fr
            sm = Image.fromarray(fr).resize(
                (max(1, fr.shape[1]//4), max(1, fr.shape[0]//4)), Image.BILINEAR
            )
            return np.array(sm.resize((fr.shape[1], fr.shape[0]), Image.BILINEAR))
        return clip_prev, clip_next.fl(fl_bc).crossfadein(safe_t), safe_t

    elif transition in ("fade", "fade_black"):
        c_prev = fadeout(clip_prev, safe_t, final_color=[0, 0, 0])
        c_next = fadein(clip_next,  safe_t, initial_color=[0, 0, 0])
        return c_prev, c_next, 0.0

    elif transition == "fade_white":
        c_prev = fadeout(clip_prev, safe_t, final_color=[255, 255, 255])
        c_next = fadein(clip_next,  safe_t, initial_color=[255, 255, 255])
        return c_prev, c_next, 0.0

    elif transition == "flash":
        flash_t = min(0.1, safe_t)
        c_prev = fadeout(clip_prev, flash_t, final_color=[255, 255, 255])
        c_next = fadein(clip_next,  flash_t, initial_color=[255, 255, 255])
        return c_prev, c_next, 0.0

    # Unknown — no transition
    return clip_prev, clip_next, 0.0


# ---------------------------------------------------------------------------
# Watermark (reused from video_generator pattern)
# ---------------------------------------------------------------------------

def _make_watermark_overlay(
    target_w: int, target_h: int, text: str,
    position_mode: str = "preset", position: str = "bottom_right",
    coordinate_mode: str = "design_canvas", aspect_ratio: str = "16:9",
    x_pos: int = 50, y_pos: int = 50,
    opacity: float = 0.65, size: int = 20, margin: int = 36,
):
    import platform

    text = text.strip()
    if not text:
        return None

    size_factor = max(0.01, size * 0.0011)
    font_size   = max(14, int(target_h * size_factor))

    candidates: list[str] = []
    if platform.system() == "Darwin":
        candidates = [
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/HelveticaNeue.ttc",
            "/Library/Fonts/Arial.ttf",
        ]
    else:
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]

    font = None
    for p in candidates:
        try:
            font = ImageFont.truetype(p, font_size)
            break
        except (IOError, OSError):
            pass
    if font is None:
        font = ImageFont.load_default()

    overlay = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        tx_off = -bbox[0]
        ty_off = -bbox[1]
    except AttributeError:
        tw, th = draw.textsize(text, font=font)
        tx_off = ty_off = 0

    px = max(int(font_size * 0.55), 8)
    py = max(int(font_size * 0.28), 4)
    pw = tw + px * 2
    ph = th + py * 2
    margin = max(5, min(margin, min(target_w, target_h) // 4))

    is_white_default = (position_mode == "preset" and position.lower().replace("-", "_") == "white_default")

    if position_mode == "custom":
        x, y = resolve_watermark_position(
            x_pos, y_pos, coordinate_mode, aspect_ratio, target_w, target_h, "custom"
        )
    else:
        pos = position.lower().replace("-", "_")
        if pos == "white_default":
            x = (target_w - tw) // 2
            y = int(target_h * 0.85)
        elif pos == "top_left":
            x, y = margin, margin
        elif pos == "top_right":
            x, y = target_w - pw - margin, margin
        elif pos == "bottom_left":
            x, y = margin, target_h - ph - margin
        elif pos == "center":
            x, y = (target_w - pw) // 2, (target_h - ph) // 2
        else:
            x, y = target_w - pw - margin, target_h - ph - margin
            
    if position_mode != "preset":
        pass
        
    bg_a  = int(opacity * 170)
    txt_a = int(opacity * 255)
    r = ph // 2
    
    if is_white_default:
        shadow_offset = max(1, int(font_size * 0.06))
        shadow_a = int(opacity * 220)
        # Drop shadow for subtle readability
        draw.text((x+tx_off+shadow_offset, y+ty_off+shadow_offset), text, font=font, fill=(0,0,0, shadow_a))
        # Main white text
        draw.text((x+tx_off, y+ty_off), text, font=font, fill=(255,255,255, txt_a))
    else:
        try:
            draw.rounded_rectangle([x, y, x+pw, y+ph], radius=r, fill=(0,0,0, bg_a))
        except AttributeError:
            draw.rectangle([x, y, x+pw, y+ph], fill=(0,0,0, bg_a))
        draw.text((x+px+tx_off, y+py+ty_off), text, font=font, fill=(255,255,255, txt_a))
        
    return np.array(overlay)


def _apply_wm_frame(frame, overlay) -> object:
    alpha = overlay[:, :, 3:4].astype(np.float32) / 255.0
    rgb   = overlay[:, :, :3].astype(np.float32)
    out   = frame.astype(np.float32) * (1.0 - alpha) + rgb * alpha
    return np.clip(out, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Load intro / outro video
# ---------------------------------------------------------------------------

def _load_media_clip(media_path: str, target_w: int, target_h: int, fps: int, raw_clips_registry: list):
    """Load and fit an intro/outro clip. Appended to raw_clips_registry for deferred close."""
    raw = VideoFileClip(media_path, audio=True)
    raw_clips_registry.append(raw)
    src_w, src_h = raw.size
    scale = max(target_w / src_w, target_h / src_h)
    nw = int(src_w * scale)
    nh = int(src_h * scale)
    resized = raw.resize((nw, nh))
    x_off = (nw - target_w) // 2
    y_off = (nh - target_h) // 2
    cropped = resized.crop(x1=x_off, y1=y_off, x2=x_off+target_w, y2=y_off+target_h)
    if cropped.fps is None or cropped.fps <= 0:
        cropped = cropped.set_fps(fps)
    return cropped


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def generate_video_timeline(
    audio_path:          str,
    zip_path:            str,
    csv_path:            str,
    output_path:         str,
    temp_dir:            str,
    # Core
    aspect_ratio:        str   = "9:16",
    export_resolution:   str   = "1080p",
    fit_mode:            str   = "cover",
    fill_mode:           str   = "loop",
    render_profile:      str   = "balanced",
    # Batch 10C — style
    transition:          str   = "none",
    transition_duration: float = 0.5,
    visual_effect:       str   = "none",
    effect_strength:     str   = "medium",
    # Batch 10C — watermark
    watermark_text:          str   = "",
    watermark_position_mode: str   = "preset",
    watermark_coordinate_mode: str = "design_canvas",
    watermark_position:      str   = "bottom_right",
    watermark_x:             int   = 50,
    watermark_y:             int   = 50,
    watermark_opacity:       float = 0.65,
    watermark_size:          int   = 20,
    watermark_margin:        int   = 36,
    # Batch 10C — intro / outro
    intro_path:          Optional[str] = None,
    outro_path:          Optional[str] = None,
    # Batch 12A — motion
    motion_style:            str   = "none",
    motion_intensity:        str   = "medium",
    # Background Music
    background_music_path:   Optional[str] = None,
    background_music_volume: float = 15.0,
    background_music_loop:   bool  = True,
    background_music_fade:   bool  = True,
    # Text overlay
    text_overlay_config:     Optional[dict] = None,
    # Cancellation
    cancel_event:        Optional[threading.Event]    = None,
    progress_callback:   Optional[Callable[[int, str], None]] = None,
) -> dict:
    """
    Full Video Timeline generation pipeline.
    Returns {success, warnings, errors, timeline, cancelled}.
    """
    warnings_out: list[str] = []
    errors_out:   list[str] = []
    timeline_out: list[dict] = []

    # Registry of ALL raw VideoFileClip handles — closed in the finally block
    # AFTER write_videofile completes. This is the fix for the NoneType bug.
    raw_clips_registry: list = []
    
    audio_dur_final = 0.0
    visual_dur_final = 0.0

    def report(pct: int, step: str) -> None:
        if progress_callback:
            progress_callback(pct, step)

    def check_cancel() -> None:
        if cancel_event and cancel_event.is_set():
            raise VideoTimelineCancelled()

    def close_all_raws() -> None:
        for rc in raw_clips_registry:
            try: rc.close()
            except Exception: pass

    try:
        # ── Step 1: Extract ZIP ───────────────────────────────────────────────
        report(3, "Extracting video ZIP")
        check_cancel()

        videos_dir = os.path.join(temp_dir, "videos")
        try:
            video_map = extract_videos_zip(zip_path, videos_dir)
        except Exception as e:
            return {"success": False, "warnings": warnings_out,
                    "errors": [f"Failed to extract videos ZIP: {e}"],
                    "timeline": [], "cancelled": False}

        if not video_map:
            return {"success": False, "warnings": warnings_out,
                    "errors": ["No valid video files found in ZIP. Supported: .mp4 .mov .webm"],
                    "timeline": [], "cancelled": False}

        logger.info("Extracted %d video(s)", len(video_map))
        report(10, "Reading timeline CSV")
        check_cancel()

        # ── Step 2: Parse CSV ─────────────────────────────────────────────────
        try:
            success, rows, total_dur, csv_errors, csv_warnings, norm_csv = parse_timeline_csv(csv_path, video_map)
        except Exception as e:
            return {"success": False, "warnings": warnings_out,
                    "errors": [f"Failed to parse CSV: {e}"],
                    "timeline": [], "cancelled": False}

        warnings_out.extend(csv_warnings)
        errors_out.extend(csv_errors)
        if errors_out:
            return {"success": False, "warnings": warnings_out,
                    "errors": errors_out, "timeline": [], "cancelled": False}
        if not rows:
            return {"success": False, "warnings": warnings_out,
                    "errors": ["No valid timeline rows in CSV."],
                    "timeline": [], "cancelled": False}

        logger.info("CSV: %d rows, %.2f–%.2fs", len(rows), rows[0]["start"], rows[-1]["end"])
        report(12, "Validating timeline")
        check_cancel()

        # ── Step 3: Dimensions / profile ──────────────────────────────────────
        dims = FORMAT_DIMENSIONS.get(aspect_ratio, FORMAT_DIMENSIONS["9:16"])
        target_w, target_h = dims.get(export_resolution, dims["1080p"])
        profile  = PROFILE_SETTINGS.get(render_profile, PROFILE_SETTINGS["balanced"])
        fps      = profile["fps"]
        t_dur    = max(0.1, min(float(transition_duration), 2.0))
        use_wm = (watermark_text != "")
        use_intro = intro_path is not None and os.path.isfile(intro_path)
        use_outro = outro_path is not None and os.path.isfile(outro_path)

        logger.info("Target %dx%d @ %dfps  profile=%s  transition=%s",
                    target_w, target_h, fps, render_profile, transition)

        # ── Performance warnings ───────────────────────────────────────────────
        total_visual_dur = rows[-1]["end"] - rows[0]["start"]
        visual_dur_final = total_visual_dur
        if total_visual_dur > 600:
            if export_resolution == "4K":
                warnings_out.append("4K + long video (>10 min) may be very slow. Consider Balanced profile or 720p.")
            if render_profile == "high_quality":
                warnings_out.append("High Quality + long video (>10 min) may take significant time to render.")
            if transition == "blur_crossfade":
                warnings_out.append("Blur Crossfade + long video (>10 min) can be computationally expensive. Use Fast Preview first.")
            if visual_effect != "none" and effect_strength == "high":
                warnings_out.append("Visual Style High + long video (>10 min) may significantly increase render time.")
            if use_intro or use_outro or use_wm:
                warnings_out.append("Long Video Timeline exports with watermark/intro/outro can take several minutes. Use 720p Fast Preview first for testing.")

        report(15, "Preparing clips")
        all_clips: list = []
        n = len(rows)

        for idx, row in enumerate(rows):
            check_cancel()
            pct = 15 + int((idx / n) * 35)
            report(pct, f"Preparing clip {idx + 1} of {n}")

            seg_dur   = row["end"] - row["start"]
            row_label = f"row {idx + 1} ({row['video']})"

            # Gap fill
            if idx > 0:
                gap = row["start"] - rows[idx-1]["end"]
                if gap > 0.05:
                    try:
                        gc = _make_black_clip(target_w, target_h, gap, fps)
                        _validate_clip(gc, f"gap before row {idx+1}")
                        all_clips.append(gc)
                    except Exception as ge:
                        return {"success": False, "warnings": warnings_out,
                                "errors": [f"Gap clip failed before row {idx+1}: {ge}"],
                                "timeline": timeline_out, "cancelled": False}

            # Segment clip
            try:
                clip = _build_segment_clip(
                    video_path=row["video_path"],
                    segment_duration=seg_dur,
                    fill_mode=fill_mode,
                    target_w=target_w, target_h=target_h,
                    fit_mode=fit_mode, fps=fps,
                    row_label=row_label,
                    raw_clips_registry=raw_clips_registry,
                )
                # Apply motion FIRST (modifies internal framing/cropping)
                clip = apply_motion_to_clip(
                    clip, motion_style, motion_intensity, target_w, target_h
                )
                # Apply visual style per-frame
                clip = _apply_visual_style_to_clip(clip, visual_effect, effect_strength)
                # Pad clip to ensure it fits the exact output dimensions
                clip = pad_clip_to_size(clip, target_w, target_h)
                all_clips.append(clip)
            except VideoTimelineError as vte:
                errors_out.append(str(vte))
                logger.error("Segment error at %s: %s", row_label, vte)
                try:
                    fb = _make_black_clip(target_w, target_h, seg_dur, fps)
                    all_clips.append(fb)
                except Exception:
                    return {"success": False, "warnings": warnings_out,
                            "errors": errors_out, "timeline": timeline_out, "cancelled": False}
            except Exception as e:
                errors_out.append(f'Video Timeline failed while preparing clip "{row["video"]}". The file may be corrupt or unsupported.')
                logger.exception("Segment error at %s", row_label)
                try:
                    fb = _make_black_clip(target_w, target_h, seg_dur, fps)
                    all_clips.append(fb)
                except Exception:
                    return {"success": False, "warnings": warnings_out,
                            "errors": errors_out, "timeline": timeline_out, "cancelled": False}

            timeline_out.append({
                "image":    row["video"],
                "start":    row["start"],
                "end":      row["end"],
                "duration": seg_dur,
                "text":     "",
                "status":   "error" if errors_out else "ok",
            })

        check_cancel()

        # ── Step 5: Apply transitions ─────────────────────────────────────────
        if transition != "none" and len(all_clips) > 1:
            report(52, "Applying transitions")
            modified = list(all_clips)
            overlaps = [0.0] * len(modified)

            transition_errors = set()
            for i in range(len(modified) - 1):
                try:
                    cp, cn, ov = _apply_transition_to_pair(
                        modified[i], modified[i+1],
                        transition, t_dur,
                        target_w, target_h, fps,
                    )
                    modified[i]   = cp
                    modified[i+1] = cn
                    overlaps[i]   = ov
                except Exception as te:
                    transition_errors.add(str(te))
            
            if transition_errors:
                err_str = "; ".join(list(transition_errors)[:3])
                warnings_out.append(
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
                    final_video = CompositeVideoClip(positioned, size=(target_w, target_h))
                    final_video = final_video.set_duration(total_dur)
                except Exception as ce:
                    warnings_out.append(f"Transition compositing failed: {ce}. Falling back to simple concat.")
                    final_video = concatenate_videoclips(all_clips, method="chain")
            else:
                # Fade transitions — just concatenate
                final_video = concatenate_videoclips(modified, method="chain")
        else:
            report(52, "Building video timeline")
            final_video = concatenate_videoclips(all_clips, method="chain")

        check_cancel()
        
        # ── Step 7: Watermark ─────────────────────────────────────────────────
        if use_wm:
            report(58, "Applying watermark")
            try:
                wm_overlay = _make_watermark_overlay(
                    target_w=target_w, target_h=target_h,
                    text=watermark_text,
                    position_mode=watermark_position_mode,
                    position=watermark_position,
                    coordinate_mode=watermark_coordinate_mode,
                    aspect_ratio=aspect_ratio,
                    x_pos=watermark_x,   y_pos=watermark_y,
                    opacity=watermark_opacity,
                    size=watermark_size, margin=watermark_margin,
                )
                if wm_overlay is not None:
                    _ov = wm_overlay
                    final_video = final_video.fl_image(lambda f: _apply_wm_frame(f, _ov))
                else:
                    warnings_out.append("Watermark could not be rendered; continuing without it.")
            except Exception as we:
                warnings_out.append(f"Watermark failed: {we}; continuing without it.")


        # ── Step 7.5: Text Overlay (Batch 16A) ────────────────────────────────
        if text_overlay_config and text_overlay_config.get("enabled"):
            report(60, "Applying text overlay")
            overlay_arr = make_text_overlay(
                target_w=target_w,
                target_h=target_h,
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
                overlay_clip = ImageClip(overlay_arr).set_duration(final_video.duration)
                final_video = CompositeVideoClip([final_video, overlay_clip])
            else:
                warnings_out.append("Text overlay could not be rendered; continuing without it.")
            check_cancel()

        # ── Step 8: Intro / Outro ─────────────────────────────────────────────
        clips_to_concat: list = []
        if use_intro:
            report(62, "Adding intro")
            try:
                intro_clip = _load_media_clip(intro_path, target_w, target_h, fps, raw_clips_registry)
                clips_to_concat.append(intro_clip)
            except Exception as ie:
                warnings_out.append(f"Intro video could not be loaded: {ie}. Skipping intro.")

        clips_to_concat.append(final_video)

        if use_outro:
            report(64, "Adding outro")
            try:
                outro_clip = _load_media_clip(outro_path, target_w, target_h, fps, raw_clips_registry)
                clips_to_concat.append(outro_clip)
            except Exception as oe:
                warnings_out.append(f"Outro video could not be loaded: {oe}. Skipping outro.")

        if len(clips_to_concat) > 1:
            report(66, "Concatenating intro/main/outro")
            try:
                final_video = concatenate_videoclips(clips_to_concat, method="chain")
            except Exception as ce:
                warnings_out.append(f"Intro/outro concat failed: {ce}. Using main timeline only.")
                final_video = clips_to_concat[1] if len(clips_to_concat) > 1 else final_video

        # ── Step 9: Main audio ────────────────────────────────────────────────
        report(70, "Adding main audio")
        try:
            main_audio = AudioFileClip(audio_path)
            audio_dur  = main_audio.duration
            audio_dur_final = audio_dur
            video_dur  = final_video.duration

            logger.info("Video: %.2fs  Audio: %.2fs", video_dur, audio_dur)

            if video_dur > audio_dur:
                final_video = final_video.subclip(0, audio_dur)
                warnings_out.append(
                    f"Visual timeline ({video_dur:.2f}s) longer than audio ({audio_dur:.2f}s). "
                    f"Video trimmed to match audio."
                )
            elif audio_dur > video_dur + 0.5:
                pad_dur = audio_dur - video_dur
                logger.info("Padding %.2fs black to match audio", pad_dur)
                black_pad = _make_black_clip(target_w, target_h, pad_dur, fps)
                final_video = concatenate_videoclips([final_video, black_pad], method="chain")
                warnings_out.append(
                    f"Visual timeline ({video_dur:.2f}s) shorter than audio ({audio_dur:.2f}s). "
                    f"Black padding ({pad_dur:.2f}s) added at the end."
                )

            final_audio = main_audio.subclip(0, min(main_audio.duration, final_video.duration))
            
            if background_music_path:
                try:
                    final_audio, bg_clip = mix_background_music(
                        main_audio_clip=final_audio,
                        music_path=background_music_path,
                        final_duration=final_audio.duration,
                        volume=background_music_volume,
                        loop=background_music_loop,
                        fade=background_music_fade
                    )
                except Exception as m_e:
                    warnings_out.append(str(m_e))

            final_video = final_video.set_audio(final_audio)

        except Exception as e:
            return {"success": False, "warnings": warnings_out,
                    "errors": [f"Failed to add main audio: {e}"],
                    "timeline": timeline_out, "cancelled": False}

        check_cancel()
        report(78, "Encoding video")

        # ── Step 10: Write output ─────────────────────────────────────────────
        codec         = "libx264"
        crf           = profile["crf"]
        preset_name   = profile["preset"]
        audio_bitrate = profile["audio_bitrate"]
        temp_audio_f  = os.path.join(temp_dir, "temp_audio.mp4")

        try:
            if final_video.audio is None:
                logger.error("CRITICAL: Final video clip has no audio track attached before export.")
                return {
                    "success": False, "warnings": warnings_out,
                    "errors": ["Visual generation completed but the audio track was unexpectedly dropped before export. Generation aborted."],
                    "timeline": timeline_out, "cancelled": False
                }
            else:
                logger.info("Final clip has audio: true")
                logger.info(f"Final visual duration: {final_video.duration:.2f}s, Final audio duration: {final_video.audio.duration:.2f}s")
            final_video.write_videofile(
                output_path,
                fps=fps,
                codec=codec,
                audio_codec="aac",
                audio_bitrate=audio_bitrate,
                preset=preset_name,
                ffmpeg_params=["-crf", str(crf)],
                temp_audiofile=temp_audio_f,
                remove_temp=True,
                logger=None,
                verbose=False,
            )
        except Exception as e:
            return {
                "success": False, "warnings": warnings_out,
                "errors": [
                    f"Failed to encode video: {e}. "
                    f"Try a simpler render profile (Fast Preview) or fewer clips."
                ],
                "timeline": timeline_out, "cancelled": False,
            }
        finally:
            # Close ALL raw handles AFTER write_videofile — this is the fix.
            close_all_raws()
            try: final_video.close()
            except Exception: pass

        report(100, "Finalizing export")
        logger.info("Video timeline complete: %s", output_path)

        return {
            "success":   True,
            "warnings":  warnings_out,
            "errors":    errors_out,
            "timeline":  timeline_out,
            "cancelled": False,
            "visual_duration": visual_dur_final,
            "audio_duration": audio_dur_final,
        }

    except VideoTimelineCancelled:
        logger.info("Cancelled.")
        close_all_raws()
        return {"success": False, "warnings": warnings_out, "errors": [],
                "timeline": timeline_out, "cancelled": True}

    except Exception as exc:
        logger.exception("Unexpected error in video timeline generation")
        close_all_raws()
        return {"success": False, "warnings": warnings_out,
                "errors": [f"Unexpected error: {exc}"],
                "timeline": timeline_out, "cancelled": False}
