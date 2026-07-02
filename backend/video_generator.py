"""
video_generator.py - Core video generation engine for Audio Image Sync Studio
Uses MoviePy 1.0.3 to assemble image clips, apply effects, and mux audio.
Batch 2: optional outro video and optional background music.
Batch 3: export resolution, render profiles, Pillow-based watermark.
Batch 9: new motion effects (zoom out, ken burns, pans, random, dynamic shorts).
"""

import os
import platform
import random
import time
import logging
import threading
from typing import Any, Callable, Optional

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from text_overlay import make_text_overlay

# ---------------------------------------------------------------------------
# Pillow compatibility shim — must come BEFORE MoviePy imports.
# ---------------------------------------------------------------------------
if not hasattr(Image, 'ANTIALIAS'):
    try:
        Image.ANTIALIAS = Image.Resampling.LANCZOS  # type: ignore[attr-defined]
    except AttributeError:
        try:
            Image.ANTIALIAS = Image.LANCZOS          # type: ignore[attr-defined]
        except AttributeError:
            Image.ANTIALIAS = Image.BICUBIC          # type: ignore[attr-defined]

# MoviePy 1.0.3 imports
from moviepy.editor import (
    ImageClip,
    VideoClip,
    VideoFileClip,
    AudioFileClip,
    CompositeVideoClip,
    CompositeAudioClip,
    concatenate_videoclips,
    concatenate_audioclips,
)
from moviepy.video.fx.all import fadein, fadeout
from moviepy.audio.fx.all import audio_fadein, audio_fadeout

from media_helpers import resolve_watermark_position
from utils import (
    parse_and_validate_csv,
    extract_zip_safely,
    preprocess_image,
    get_resolution,
    seconds_to_mmss,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Render profile constants
# ---------------------------------------------------------------------------

BASE_VIDEO_BITRATES: dict[str, int] = {
    "720p":  2500,
    "1080p": 5000,
    "2K":    10000,
    "4K":    20000,
}

RENDER_PROFILES: dict[str, dict] = {
    "fast_preview": {
        "fps":            24,
        "preset":         "ultrafast",
        "bitrate_factor": 0.55,
        "audio_bitrate":  "128k",
    },
    "balanced": {
        "fps":            30,
        "preset":         "medium",
        "bitrate_factor": 1.0,
        "audio_bitrate":  "192k",
    },
    "high_quality": {
        "fps":            30,
        "preset":         "slow",
        "bitrate_factor": 1.5,
        "audio_bitrate":  "256k",
    },
}


# ---------------------------------------------------------------------------
# Custom exception for clean cancellation
# ---------------------------------------------------------------------------

class GenerationCancelled(Exception):
    """Raised when a job cancel_event is set during generation."""
    pass


# ---------------------------------------------------------------------------
# Motion intensity multipliers
# ---------------------------------------------------------------------------

INTENSITY_FACTOR: dict[str, float] = {
    "low":    0.6,
    "medium": 1.0,
    "high":   1.5,
}


# ---------------------------------------------------------------------------
# Motion effect clip builders
# ---------------------------------------------------------------------------

def _load_image_padded(image_path: str, padded_w: int, padded_h: int) -> np.ndarray:
    """Load and resize image to padded dimensions. Returns (H, W, 3) ndarray."""
    img = Image.open(image_path).convert("RGB")
    img = img.resize((padded_w, padded_h), Image.LANCZOS)
    return np.array(img)


def make_zoom_in_clip(
    image_path: str, duration: float, target_w: int, target_h: int,
    intensity: str = "medium",
) -> VideoClip:
    """Slow zoom-in: start normal, end slightly zoomed. No black edges."""
    factor = 1.0 + 0.08 * INTENSITY_FACTOR.get(intensity, 1.0)
    padded_w = int(target_w * factor)
    padded_h = int(target_h * factor)
    img_array = _load_image_padded(image_path, padded_w, padded_h)

    def make_frame(t: float) -> np.ndarray:
        progress = min(t / max(duration, 0.001), 1.0)
        scale    = 1.0 + (factor - 1.0) * progress
        crop_w   = min(int(padded_w / scale), padded_w)
        crop_h   = min(int(padded_h / scale), padded_h)
        x0 = max((padded_w - crop_w) // 2, 0)
        y0 = max((padded_h - crop_h) // 2, 0)
        cropped = img_array[y0:y0 + crop_h, x0:x0 + crop_w]
        return np.array(Image.fromarray(cropped).resize((target_w, target_h), Image.BILINEAR))

    return VideoClip(make_frame, duration=duration).set_fps(30)


def make_zoom_out_clip(
    image_path: str, duration: float, target_w: int, target_h: int,
    intensity: str = "medium",
) -> VideoClip:
    """Slow zoom-out: start zoomed in, gradually reveal full image. No black edges."""
    factor = 1.0 + 0.08 * INTENSITY_FACTOR.get(intensity, 1.0)
    padded_w = int(target_w * factor)
    padded_h = int(target_h * factor)
    img_array = _load_image_padded(image_path, padded_w, padded_h)

    def make_frame(t: float) -> np.ndarray:
        progress = min(t / max(duration, 0.001), 1.0)
        # Zoom starts at factor and reduces to 1.0
        scale    = factor - (factor - 1.0) * progress
        crop_w   = min(int(padded_w / scale), padded_w)
        crop_h   = min(int(padded_h / scale), padded_h)
        x0 = max((padded_w - crop_w) // 2, 0)
        y0 = max((padded_h - crop_h) // 2, 0)
        cropped = img_array[y0:y0 + crop_h, x0:x0 + crop_w]
        return np.array(Image.fromarray(cropped).resize((target_w, target_h), Image.BILINEAR))

    return VideoClip(make_frame, duration=duration).set_fps(30)


def make_ken_burns_clip(
    image_path: str, duration: float, target_w: int, target_h: int,
    intensity: str = "medium", seed: int = 0,
) -> VideoClip:
    """Ken Burns: smooth pan + zoom together, documentary style."""
    rng = random.Random(seed)
    factor = 1.0 + 0.10 * INTENSITY_FACTOR.get(intensity, 1.0)
    padded_w = int(target_w * factor)
    padded_h = int(target_h * factor)
    img_array = _load_image_padded(image_path, padded_w, padded_h)

    # Random start and end crop positions (top-left corners)
    max_x = padded_w - target_w
    max_y = padded_h - target_h
    start_x = rng.randint(0, max(max_x, 0))
    start_y = rng.randint(0, max(max_y, 0))
    # End slightly different from start
    end_x   = rng.randint(0, max(max_x, 0))
    end_y   = rng.randint(0, max(max_y, 0))

    def make_frame(t: float) -> np.ndarray:
        progress = min(t / max(duration, 0.001), 1.0)
        # Smooth easing
        eased = progress * progress * (3 - 2 * progress)
        # Interpolate crop position
        cx = int(start_x + (end_x - start_x) * eased)
        cy = int(start_y + (end_y - start_y) * eased)
        cx = max(0, min(cx, max_x))
        cy = max(0, min(cy, max_y))
        cropped = img_array[cy:cy + target_h, cx:cx + target_w]
        if cropped.shape[0] != target_h or cropped.shape[1] != target_w:
            cropped = np.array(Image.fromarray(cropped).resize((target_w, target_h), Image.BILINEAR))
        return cropped

    return VideoClip(make_frame, duration=duration).set_fps(30)


def _make_pan_clip(
    image_path: str, duration: float, target_w: int, target_h: int,
    direction: str, intensity: str = "medium",
) -> VideoClip:
    """
    Generic pan: moves image in the given direction.
    direction: 'left' | 'right' | 'up' | 'down'
    Pads image in pan axis to allow movement without black edges.
    """
    pad_factor = 1.0 + 0.15 * INTENSITY_FACTOR.get(intensity, 1.0)

    if direction in ("left", "right"):
        padded_w = int(target_w * pad_factor)
        padded_h = target_h
    else:  # up, down
        padded_w = target_w
        padded_h = int(target_h * pad_factor)

    img_array = _load_image_padded(image_path, padded_w, padded_h)
    max_x = max(padded_w - target_w, 0)
    max_y = max(padded_h - target_h, 0)

    def make_frame(t: float) -> np.ndarray:
        progress = min(t / max(duration, 0.001), 1.0)
        eased    = progress * progress * (3 - 2 * progress)

        if direction == "left":
            cx = int(eased * max_x)
            cy = 0
        elif direction == "right":
            cx = int((1.0 - eased) * max_x)
            cy = 0
        elif direction == "up":
            cx = 0
            cy = int(eased * max_y)
        else:  # down
            cx = 0
            cy = int((1.0 - eased) * max_y)

        cx = max(0, min(cx, max_x))
        cy = max(0, min(cy, max_y))
        cropped = img_array[cy:cy + target_h, cx:cx + target_w]
        if cropped.shape[0] != target_h or cropped.shape[1] != target_w:
            cropped = np.array(Image.fromarray(cropped).resize((target_w, target_h), Image.BILINEAR))
        return cropped

    return VideoClip(make_frame, duration=duration).set_fps(30)


def make_pan_left_clip(image_path, duration, target_w, target_h, intensity="medium"):
    return _make_pan_clip(image_path, duration, target_w, target_h, "left", intensity)

def make_pan_right_clip(image_path, duration, target_w, target_h, intensity="medium"):
    return _make_pan_clip(image_path, duration, target_w, target_h, "right", intensity)

def make_pan_up_clip(image_path, duration, target_w, target_h, intensity="medium"):
    return _make_pan_clip(image_path, duration, target_w, target_h, "up", intensity)

def make_pan_down_clip(image_path, duration, target_w, target_h, intensity="medium"):
    return _make_pan_clip(image_path, duration, target_w, target_h, "down", intensity)


def make_subtle_random_clip(
    image_path: str, duration: float, target_w: int, target_h: int,
    intensity: str = "medium", seed: int = 0,
) -> VideoClip:
    """
    Each clip gets a small random motion from a pool: zoom-in, zoom-out, or
    one of the four pans. Keeps images alive without feeling chaotic.
    """
    options = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"]
    choice  = options[seed % len(options)]

    if choice == "zoom_in":
        return make_zoom_in_clip(image_path, duration, target_w, target_h, intensity)
    elif choice == "zoom_out":
        return make_zoom_out_clip(image_path, duration, target_w, target_h, intensity)
    elif choice == "pan_left":
        return make_pan_left_clip(image_path, duration, target_w, target_h, intensity)
    elif choice == "pan_right":
        return make_pan_right_clip(image_path, duration, target_w, target_h, intensity)
    elif choice == "pan_up":
        return make_pan_up_clip(image_path, duration, target_w, target_h, intensity)
    else:
        return make_pan_down_clip(image_path, duration, target_w, target_h, intensity)


def make_dynamic_shorts_clip(
    image_path: str, duration: float, target_w: int, target_h: int,
    intensity: str = "medium", seed: int = 0,
) -> VideoClip:
    """
    Slightly stronger motion for short-form vertical videos.
    Combines a gentle pan with a subtle zoom for energy.
    """
    # Increase intensity one step for shorts
    intensity_map = {"low": "medium", "medium": "high", "high": "high"}
    boosted = intensity_map.get(intensity, "high")

    # Alternate between ken burns and pan variants per clip
    if seed % 2 == 0:
        return make_ken_burns_clip(image_path, duration, target_w, target_h, boosted, seed)
    else:
        directions = ["left", "right", "up", "down"]
        direction  = directions[seed % len(directions)]
        return _make_pan_clip(image_path, duration, target_w, target_h, direction, boosted)


# ---------------------------------------------------------------------------
# Legacy zoom clip (Batch 3 compat — same as zoom_in, kept for clarity)
# ---------------------------------------------------------------------------

def make_zoom_clip(
    image_path: str,
    duration: float,
    target_w: int,
    target_h: int,
    zoom_factor: float = 1.08,
) -> VideoClip:
    """
    Create a VideoClip with a slow zoom-in effect (Ken Burns style).
    Kept for backward compatibility with Batch 3 zoom_effect='slow_zoom_in'.
    """
    padded_w = int(target_w * zoom_factor)
    padded_h = int(target_h * zoom_factor)
    img_array = _load_image_padded(image_path, padded_w, padded_h)

    def make_frame(t: float) -> np.ndarray:
        progress = min(t / max(duration, 0.001), 1.0)
        scale    = 1.0 + (zoom_factor - 1.0) * progress
        crop_w   = min(int(padded_w / scale), padded_w)
        crop_h   = min(int(padded_h / scale), padded_h)
        x0 = max((padded_w - crop_w) // 2, 0)
        y0 = max((padded_h - crop_h) // 2, 0)
        cropped  = img_array[y0:y0 + crop_h, x0:x0 + crop_w]
        return np.array(Image.fromarray(cropped).resize((target_w, target_h), Image.BILINEAR))

    return VideoClip(make_frame, duration=duration).set_fps(30)


# ---------------------------------------------------------------------------
# Watermark helpers (Pillow-based — no ImageMagick required)
# ---------------------------------------------------------------------------




# ---------------------------------------------------------------------------
# Media video helper (intro / outro)
# ---------------------------------------------------------------------------

def _load_media_clip(media_path: str, target_w: int, target_h: int) -> VideoFileClip:
    clip = VideoFileClip(media_path, audio=True)
    src_w, src_h = clip.size
    scale   = max(target_w / src_w, target_h / src_h)
    new_w   = int(src_w * scale)
    new_h   = int(src_h * scale)
    resized = clip.resize((new_w, new_h))
    x_off   = (new_w - target_w) // 2
    y_off   = (new_h - target_h) // 2
    cropped = resized.crop(x1=x_off, y1=y_off, x2=x_off + target_w, y2=y_off + target_h)
    if cropped.fps is None or cropped.fps <= 0:
        cropped = cropped.set_fps(30)
    return cropped


# ---------------------------------------------------------------------------
# Background music helper
# ---------------------------------------------------------------------------

def _build_music_track(
    music_path: str, target_duration: float, volume: float, fade: bool,
) -> Optional[AudioFileClip]:
    music = AudioFileClip(music_path)
    if music.duration < target_duration:
        copies = int(target_duration / music.duration) + 2
        try:
            music = concatenate_audioclips([music] * copies)
        except Exception:
            pass
    if music.duration > target_duration:
        music = music.subclip(0, target_duration)
    music = music.volumex(float(volume))
    if fade:
        fade_dur = min(1.5, target_duration / 4)
        try:
            music = audio_fadein(music, fade_dur)
            music = audio_fadeout(music, fade_dur)
        except Exception:
            pass
    return music


# ---------------------------------------------------------------------------
# Dispatch: build one clip with the chosen motion effect
# ---------------------------------------------------------------------------

def _build_motion_clip(
    image_path: str,
    duration: float,
    target_w: int,
    target_h: int,
    motion_effect: str,
    motion_intensity: str,
    fps: int,
    clip_index: int,
) -> Any:
    """
    Returns a VideoClip (or ImageClip) for the given motion effect.
    All motion clips are pre-sized to (target_w, target_h) with no black edges.
    """
    if motion_effect == "slow_zoom_in":
        return make_zoom_in_clip(image_path, duration, target_w, target_h, motion_intensity)
    elif motion_effect == "slow_zoom_out":
        return make_zoom_out_clip(image_path, duration, target_w, target_h, motion_intensity)
    elif motion_effect == "ken_burns":
        return make_ken_burns_clip(image_path, duration, target_w, target_h, motion_intensity, seed=clip_index)
    elif motion_effect == "pan_left":
        return make_pan_left_clip(image_path, duration, target_w, target_h, motion_intensity)
    elif motion_effect == "pan_right":
        return make_pan_right_clip(image_path, duration, target_w, target_h, motion_intensity)
    elif motion_effect == "pan_up":
        return make_pan_up_clip(image_path, duration, target_w, target_h, motion_intensity)
    elif motion_effect == "pan_down":
        return make_pan_down_clip(image_path, duration, target_w, target_h, motion_intensity)
    elif motion_effect == "subtle_random":
        return make_subtle_random_clip(image_path, duration, target_w, target_h, motion_intensity, seed=clip_index)
    elif motion_effect == "dynamic_shorts":
        return make_dynamic_shorts_clip(image_path, duration, target_w, target_h, motion_intensity, seed=clip_index)
    else:
        # No motion — static ImageClip
        clip = ImageClip(image_path, duration=duration)
        return clip.set_fps(fps)


# ---------------------------------------------------------------------------
# Main generator
# ---------------------------------------------------------------------------

def generate_video(
    audio_path: str,
    zip_path: str,
    csv_path: str,
    output_path: str,
    temp_dir: str,
    # Core settings
    aspect_ratio: str = "9:16",
    export_resolution: str = "1080p",
    fit_mode: str = "cover",
    transition: str = "fade",
    transition_duration: float = 0.5,
    zoom_effect: str = "none",      # kept for backward compat
    render_profile: str = "balanced",
    # Batch 9A — motion & style
    motion_effect: str = "slow_zoom_in",
    motion_intensity: str = "medium",
    visual_effect: str = "none",
    effect_strength: str = "medium",
    style_preset: str = "clean_default",
    # Batch 16A — Text Overlay
    text_overlay_config: Optional[dict] = None,
    # Batch 2/6 — optional features
    intro_path: Optional[str] = None,
    outro_path: Optional[str] = None,
    bg_music_path: Optional[str] = None,
    enable_bg_music: bool = False,
    music_volume: float = 0.12,
    music_fade: bool = True,
    # Cancellation + progress
    cancel_event: Optional[threading.Event] = None,
    progress_callback: Optional[Callable[[int, str], None]] = None,
) -> dict[str, Any]:
    """
    Main entry-point for video generation.
    Returns dict: success, timeline, warnings, errors, cancelled.
    """
    warnings: list[str] = []
    errors:   list[str] = []
    timeline: list[dict] = []

    # ── Resolve resolution & render profile ──────────────────────────────────
    target_w, target_h = get_resolution(aspect_ratio, export_resolution)
    profile       = RENDER_PROFILES.get(render_profile, RENDER_PROFILES["balanced"])
    fps           = profile["fps"]
    preset        = profile["preset"]
    base_kbps     = BASE_VIDEO_BITRATES.get(export_resolution, 5000)
    video_bitrate = f"{int(base_kbps * profile['bitrate_factor'])}k"
    audio_bitrate = profile["audio_bitrate"]

    # ── Clamp optional numeric params ────────────────────────────────────────
    music_volume      = max(0.0, min(1.0, music_volume))
    transition_duration = max(0.1, min(float(transition_duration), 2.0))

    # ── Effective motion and transition ───────────────────────────────────────
    effective_motion = motion_effect
    if effective_motion == "none" and zoom_effect == "slow_zoom_in":
        effective_motion = "slow_zoom_in"
    
    # Handle legacy 'none' transition as 'none', 'fade' remains 'fade'.
    effective_transition = transition

    # ── Feature flags ────────────────────────────────────────────────────────
    use_intro     = intro_path is not None and os.path.isfile(intro_path)
    use_outro     = outro_path is not None and os.path.isfile(outro_path)
    use_music     = enable_bg_music and bg_music_path is not None and os.path.isfile(bg_music_path)
    # use_text_overlay removed in Batch 16D
    use_motion    = effective_motion != "none"

    # ── Performance warnings ──────────────────────────────────────────────────
    is_heavy_motion = effective_motion in ("ken_burns", "dynamic_shorts", "subtle_random")
    
    # Visual Style Warnings
    if visual_effect != "none":
        if export_resolution == "4K" and render_profile == "high_quality" and effect_strength == "high":
            warnings.append("4K + High Quality + Visual Style High may significantly increase render time. For testing, use 720p Fast Preview first.")
        if effect_strength == "high": # The duration check will happen after CSV parse, so we might need to add a general warning here or move the warning check below CSV parse.
            pass # We don't have total_duration here!

    if export_resolution == "4K" and render_profile == "high_quality" and is_heavy_motion:
        warnings.append(
            "4K + High Quality + heavy motion effect is a very demanding combination. "
            "This may take significantly longer on your computer. "
            "Consider using 720p Fast Preview to check timing first."
        )
    elif export_resolution in ("2K", "4K") and render_profile == "high_quality":
        warnings.append(
            f"{export_resolution} + High Quality render may take a while. "
            "Consider Balanced profile for faster results."
        )
    elif is_heavy_motion and export_resolution == "4K":
        warnings.append(
            "Motion effects with 4K resolution will increase render time. "
            "Use 720p Fast Preview for a quick timing check."
        )

    logger.info(
        f"Starting job. Res: {export_resolution}, Profile: {render_profile}, "
        f"Motion: {effective_motion} ({motion_intensity}), "
        f"Aspect: {aspect_ratio}, TextOverlay: {text_overlay_config.get('enabled', False) if text_overlay_config else False}"
    )

    def _check_cancel():
        if cancel_event is not None and cancel_event.is_set():
            raise GenerationCancelled("Job was cancelled by user request.")

    def _progress(pct: int, step: str):
        if progress_callback is not None:
            try:
                progress_callback(pct, step)
            except Exception:
                pass

    _progress(5, "Preparing job")
    _check_cancel()

    # ------------------------------------------------------------------
    # 1. Extract images ZIP
    # ------------------------------------------------------------------
    _progress(10, "Extracting ZIP")
    images_dir = os.path.join(temp_dir, "images")
    os.makedirs(images_dir, exist_ok=True)
    extracted_files, zip_errors = extract_zip_safely(zip_path, images_dir)
    errors.extend(zip_errors)
    if zip_errors:
        return {"success": False, "timeline": [], "warnings": warnings, "errors": errors, "cancelled": False}
    _check_cancel()

    # ------------------------------------------------------------------
    # 2. Parse & validate CSV
    # ------------------------------------------------------------------
    _progress(20, "Reading CSV")
    success, rows, total_dur, csv_errors, csv_warnings, norm_csv = parse_and_validate_csv(csv_path)
    warnings.extend(csv_warnings)
    errors.extend(csv_errors)
    if csv_errors:
        return {"success": False, "timeline": timeline, "warnings": warnings, "errors": errors, "cancelled": False}
    if not rows:
        errors.append("CSV contains no valid rows.")
        return {"success": False, "timeline": timeline, "warnings": warnings, "errors": errors, "cancelled": False}

    total_duration = rows[-1]["end"] if rows else 0
    logger.info(f"Timeline loaded: {len(rows)} rows, duration: {seconds_to_mmss(total_duration)}")
    
    # ── Additional Performance Warnings based on duration ─────────────────────
    if visual_effect != "none" and effect_strength == "high" and total_duration > 1200:
        warnings.append("20+ minute video + Visual Style High may increase render time significantly. For testing, use 720p Fast Preview first.")
    if effective_motion == "dynamic_shorts" and visual_effect == "high_contrast" and total_duration > 300:
        warnings.append("Dynamic Shorts Motion + High Contrast + long video may increase render time. For testing, use 720p Fast Preview first.")
        
    _check_cancel()

    # ------------------------------------------------------------------
    # 3. Warn about unused images
    # ------------------------------------------------------------------
    _progress(30, "Validating images and timeline")
    used_images = {r["image"] for r in rows}
    unused = sorted(list(extracted_files - used_images))
    if unused:
        if len(unused) > 3:
            preview = ", ".join(unused[:3])
            warnings.append(f"There are {len(unused)} extra files in your ZIP that are not listed in the CSV (e.g. {preview}, and {len(unused) - 3} more). They were skipped.")
        else:
            warnings.append(f"The following files in your ZIP are not listed in the CSV and were skipped: {', '.join(unused)}")
    _check_cancel()

    # ------------------------------------------------------------------
    # 4. Preprocess images, calculate timings, and build clips
    # ------------------------------------------------------------------
    _progress(40, "Preparing clips & transitions")
    preprocessed_dir = os.path.join(temp_dir, "preprocessed")
    os.makedirs(preprocessed_dir, exist_ok=True)

    total_rows = len(rows)
    
    # Transition timings
    def get_transition_info(t_name: str, req_dur: float, d_prev: float, d_next: float):
        overlap_types = {"crossfade", "slide_left", "slide_right", "slide_up", "slide_down",
                         "push_left", "push_right", "zoom_in", "zoom_out", "blur_crossfade"}
        if t_name in overlap_types:
            return True, min(req_dur, d_prev / 2.0, d_next / 2.0), None
        elif t_name in ("fade", "fade_black"):
            return False, min(req_dur / 2.0, d_prev / 2.0, d_next / 2.0), [0, 0, 0]
        elif t_name == "fade_white":
            return False, min(req_dur / 2.0, d_prev / 2.0, d_next / 2.0), [255, 255, 255]
        elif t_name == "flash":
            return False, min(0.1, d_prev / 2.0, d_next / 2.0), [255, 255, 255]
        else:
            return False, 0.0, None

    overlaps  = [0.0] * total_rows
    fade_ins  = [(0.0, None)] * total_rows
    fade_outs = [(0.0, None)] * total_rows

    for i in range(total_rows - 1):
        d_curr = rows[i]["duration"]
        d_next = rows[i+1]["duration"]
        is_ov, dur, col = get_transition_info(effective_transition, transition_duration, d_curr, d_next)
        if is_ov:
            overlaps[i] = dur
        else:
            fade_outs[i]   = (dur, col)
            fade_ins[i+1] = (dur, col)

    base_clips = []
    start_times = []
    current_s = 0.0

    for idx, row in enumerate(rows):
        _check_cancel()
        img_name = row["image"]
        src_path = os.path.join(images_dir, img_name)
        if not os.path.isfile(src_path):
            errors.append(f"Image not found in ZIP: {img_name}")
            row["status"] = "missing"
            timeline.append(row)
            continue

        # Create a unique cache key based on all parameters that affect the image
        safe_ve = str(visual_effect).replace('_', '')
        safe_es = str(effect_strength).replace('_', '')
        pp_filename = f"pp_{target_w}x{target_h}_{fit_mode}_{safe_ve}_{safe_es}_{img_name}.jpg"
        preprocessed_path = os.path.join(preprocessed_dir, pp_filename)
        try:
            if not os.path.isfile(preprocessed_path):
                preprocess_image(
                    src_path, preprocessed_path, target_w, target_h, fit_mode,
                    visual_effect=visual_effect, effect_strength=effect_strength
                )
        except Exception as e:
            errors.append(f"Failed to preprocess {img_name}: {e}")
            row["status"] = "error"
            timeline.append(row)
            continue

        d_curr = row["duration"]
        t_over = overlaps[i] if idx < total_rows - 1 else 0.0
        clip_dur = d_curr + t_over

        try:
            if use_motion:
                clip = _build_motion_clip(
                    image_path=preprocessed_path, duration=clip_dur, target_w=target_w, target_h=target_h,
                    motion_effect=effective_motion, motion_intensity=motion_intensity, fps=fps, clip_index=idx,
                )
            else:
                clip = ImageClip(preprocessed_path, duration=clip_dur).set_fps(fps)

            f_in_dur, f_in_col = fade_ins[idx]
            if f_in_dur > 0 and f_in_col is not None:
                clip = fadein(clip, f_in_dur, initial_color=f_in_col)

            f_out_dur, f_out_col = fade_outs[idx]
            if f_out_dur > 0 and f_out_col is not None:
                clip = fadeout(clip, f_out_dur, final_color=f_out_col)

            base_clips.append(clip)
            start_times.append(current_s)
            current_s += d_curr
            row["status"] = "ok"

        except Exception as e:
            errors.append(f"Failed to build clip for {img_name}: {e}")
            row["status"] = "error"

        timeline.append(row)
        _progress(40 + int(10 * (idx + 1) / max(total_rows, 1)), f"Preparing clips ({idx + 1}/{total_rows})")

    if not base_clips:
        errors.append("No valid image clips could be created.")
        return {"success": False, "timeline": timeline, "warnings": warnings, "errors": errors, "cancelled": False}

    _check_cancel()

    # ------------------------------------------------------------------
    # 5. Apply overlap transitions and composite
    # ------------------------------------------------------------------
    _progress(52, "Applying transitions")
    for i in range(len(base_clips) - 1):
        t_o = overlaps[i]
        if t_o <= 0: continue

        c_prev = base_clips[i]
        c_next = base_clips[i+1]
        D_prev = rows[i]["duration"]
        T = effective_transition

        if T == "crossfade":
            c_next = c_next.crossfadein(t_o)
        elif T == "slide_left":
            def fl_sl(t, to=t_o, w=target_w): return (int(w * (1 - min(t/to, 1.0))), 0)
            c_next = c_next.set_pos(fl_sl)
        elif T == "slide_right":
            def fl_sr(t, to=t_o, w=target_w): return (int(-w * (1 - min(t/to, 1.0))), 0)
            c_next = c_next.set_pos(fl_sr)
        elif T == "slide_up":
            def fl_su(t, to=t_o, h=target_h): return (0, int(h * (1 - min(t/to, 1.0))))
            c_next = c_next.set_pos(fl_su)
        elif T == "slide_down":
            def fl_sd(t, to=t_o, h=target_h): return (0, int(-h * (1 - min(t/to, 1.0))))
            c_next = c_next.set_pos(fl_sd)
        elif T == "push_left":
            def fl_npl(t, to=t_o, w=target_w): return (int(w * (1 - min(t/to, 1.0))), 0)
            def fl_ppl(t, d=D_prev, to=t_o, w=target_w): return (int(-w * min(max(t - d, 0)/to, 1.0)), 0)
            c_next = c_next.set_pos(fl_npl)
            c_prev = c_prev.set_pos(fl_ppl)
        elif T == "push_right":
            def fl_npr(t, to=t_o, w=target_w): return (int(-w * (1 - min(t/to, 1.0))), 0)
            def fl_ppr(t, d=D_prev, to=t_o, w=target_w): return (int(w * min(max(t - d, 0)/to, 1.0)), 0)
            c_next = c_next.set_pos(fl_npr)
            c_prev = c_prev.set_pos(fl_ppr)
        elif T == "zoom_in":
            def fl_zi(gf, t, to=t_o):
                fr = gf(t)
                if t >= to: return fr
                sc = 1.3 - 0.3 * (t / max(to, 0.001))
                h, w = fr.shape[:2]
                cw, ch = int(w/sc), int(h/sc)
                x0, y0 = (w - cw)//2, (h - ch)//2
                cr = fr[y0:y0+ch, x0:x0+cw]
                return np.array(Image.fromarray(cr).resize((w, h), Image.BILINEAR))
            c_next = c_next.fl(fl_zi).crossfadein(t_o)
        elif T == "zoom_out":
            def fl_zo(gf, t, to=t_o):
                fr = gf(t)
                if t >= to: return fr
                sc = 0.7 + 0.3 * (t / max(to, 0.001))
                h, w = fr.shape[:2]
                nw, nh = int(w*sc), int(h*sc)
                rz = np.array(Image.fromarray(fr).resize((nw, nh), Image.BILINEAR))
                out = np.zeros_like(fr)
                x0, y0 = (w - nw)//2, (h - nh)//2
                out[y0:y0+nh, x0:x0+nw] = rz
                return out
            c_next = c_next.fl(fl_zo).crossfadein(t_o)
        elif T == "blur_crossfade":
            def fl_bc(gf, t, to=t_o):
                fr = gf(t)
                if t >= to: return fr
                prog = t / max(to, 0.001)
                rad = int(20 * (1.0 - prog))
                if rad < 1: return fr
                im = Image.fromarray(fr)
                sm = im.resize((max(1, fr.shape[1]//4), max(1, fr.shape[0]//4)), Image.BILINEAR)
                return np.array(sm.resize((fr.shape[1], fr.shape[0]), Image.BILINEAR))
            c_next = c_next.fl(fl_bc).crossfadein(t_o)

        base_clips[i] = c_prev
        base_clips[i+1] = c_next

    _progress(58, "Compositing video timeline")
    final_clips = [c.set_start(st) for c, st in zip(base_clips, start_times)]
    try:
        video = CompositeVideoClip(final_clips, size=(target_w, target_h))
    except Exception as e:
        errors.append(f"Failed to composite clips: {e}")
        return {"success": False, "timeline": timeline, "warnings": warnings, "errors": errors, "cancelled": False}

    _check_cancel()

    # ------------------------------------------------------------------
    # 6. Attach main audio
    # ------------------------------------------------------------------
    _progress(65, "Mixing audio")
    main_audio = None
    try:
        main_audio = AudioFileClip(audio_path)
        video_duration = video.duration
        if main_audio.duration > video_duration:
            main_audio = main_audio.subclip(0, video_duration)
        else:
            warnings.append(
                f"Audio ({seconds_to_mmss(main_audio.duration)}) is shorter than video "
                f"({seconds_to_mmss(video_duration)}). Video will be silent after audio ends."
            )
    except Exception as e:
        warnings.append(f"Could not load main audio: {e}. Video will be generated without audio.")
        main_audio = None

    _check_cancel()

    # ------------------------------------------------------------------
    # 7. Background music (optional)
    # ------------------------------------------------------------------
    if use_music:
        _progress(72, "Processing background music")
        try:
            music_track = _build_music_track(
                music_path=bg_music_path,
                target_duration=video.duration,
                volume=music_volume,
                fade=music_fade,
            )
            if music_track is not None:
                if main_audio is not None:
                    composite_audio = CompositeAudioClip([main_audio, music_track])
                    composite_audio = composite_audio.set_duration(video.duration)
                    video = video.set_audio(composite_audio)
                else:
                    video = video.set_audio(music_track)
                main_audio = None
        except Exception as e:
            warnings.append(f"Background music could not be applied: {e}. Continuing without music.")
        _check_cancel()

    if main_audio is not None:
        video = video.set_audio(main_audio)
        main_audio = None

    _check_cancel()

    # ------------------------------------------------------------------
    # 8. Text Overlay (Batch 16D)
    # ------------------------------------------------------------------
    intro_clip = None
    outro_clip = None
    if text_overlay_config and text_overlay_config.get("enabled"):
        mode = text_overlay_config.get("mode", "whole_video")
        _progress(78, f"Applying text overlay ({mode})")
        
        overlay_clips = []
        def create_overlay_clip(txt, start, end):
            overlay_arr = make_text_overlay(
                target_w=target_w, target_h=target_h,
                text=txt,
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
                return ImageClip(overlay_arr).set_start(start).set_end(end)
            return None

        if mode == "whole_video":
            c = create_overlay_clip(text_overlay_config.get("text", ""), 0, video.duration)
            if c: overlay_clips.append(c)
        elif mode == "timed_text":
            from utils import parse_time
            items = text_overlay_config.get("items", [])
            for idx, itm in enumerate(items):
                try:
                    s_str = str(itm.get("start", "00:00"))
                    e_str = str(itm.get("end", "00:05"))
                    if s_str.isdigit() or (s_str.replace('.','',1).isdigit()):
                        s = float(s_str)
                    else:
                        s = parse_time(s_str)
                    if e_str.isdigit() or (e_str.replace('.','',1).isdigit()):
                        e = float(e_str)
                    else:
                        e = parse_time(e_str)
                    
                    if e > s and itm.get("text"):
                        c = create_overlay_clip(itm.get("text"), s, e)
                        if c: overlay_clips.append(c)
                except Exception as ex:
                    warnings.append(f"Skipped invalid timed text item {idx+1}: {ex}")
        elif mode == "csv_text":
            for r in rows:
                txt = r.get("text", "").strip()
                if txt:
                    c = create_overlay_clip(txt, r["start"], r["end"])
                    if c: overlay_clips.append(c)

        if overlay_clips:
            saved_audio = video.audio
            video = CompositeVideoClip([video.without_audio()] + overlay_clips, size=(target_w, target_h))
            if saved_audio:
                video = video.set_audio(saved_audio)
        _check_cancel()

    # ------------------------------------------------------------------
    # 9. Append intro/outro videos (optional)
    # ------------------------------------------------------------------
    clips_to_concat = []

    if use_intro:
        _progress(80, "Adding intro video")
        try:
            intro_clip = _load_media_clip(intro_path, target_w, target_h)
            clips_to_concat.append(intro_clip)
        except GenerationCancelled:
            raise
        except Exception as e:
            errors.append(f"Failed to load intro video: {e}")
            if intro_clip is not None:
                try: intro_clip.close()
                except Exception: pass
            return {"success": False, "timeline": timeline, "warnings": warnings, "errors": errors, "cancelled": False}

    clips_to_concat.append(video)

    if use_outro:
        _progress(82, "Appending outro video")
        try:
            outro_clip = _load_media_clip(outro_path, target_w, target_h)
            clips_to_concat.append(outro_clip)
        except GenerationCancelled:
            raise
        except Exception as e:
            errors.append(f"Failed to load outro video: {e}")
            for c in [intro_clip, outro_clip]:
                if c is not None:
                    try: c.close()
                    except Exception: pass
            return {"success": False, "timeline": timeline, "warnings": warnings, "errors": errors, "cancelled": False}

    if len(clips_to_concat) > 1:
        _progress(85, "Concatenating videos")
        try:
            video = concatenate_videoclips(clips_to_concat, method="compose")
        except GenerationCancelled:
            raise
        except Exception as e:
            errors.append(f"Failed to concatenate videos: {e}")
            return {"success": False, "timeline": timeline, "warnings": warnings, "errors": errors, "cancelled": False}

    _check_cancel()

    # ------------------------------------------------------------------
    # 10. Write output MP4
    # ------------------------------------------------------------------
    _progress(88, "Encoding video")
    try:
        # Strict Pre-Export Audio Verification
        if video.audio is None:
            logger.error("CRITICAL: Final video clip has no audio track attached before export.")
            errors.append("Visual generation completed but the audio track was unexpectedly dropped before export. Generation aborted.")
            return {"success": False, "timeline": timeline, "warnings": warnings, "errors": errors, "cancelled": False}
        else:
            logger.info("Final clip has audio: true")
            logger.info(f"Final visual duration: {video.duration:.2f}s, Final audio duration: {video.audio.duration:.2f}s")
            final_duration = video.duration

        video.write_videofile(
            output_path,
            fps=fps,
            codec="libx264",
            audio_codec="aac",
            temp_audiofile=os.path.join(temp_dir, "temp_audio.mp4"),
            remove_temp=True,
            preset=preset,
            bitrate=video_bitrate,
            audio_bitrate=audio_bitrate,
            verbose=False,
            logger=None,
        )
    except Exception as e:
        logger.exception("Failed to write video file")
        errors.append(f"Failed to write video file: {e}")
        return {"success": False, "timeline": timeline, "warnings": warnings, "errors": errors, "cancelled": False}
    finally:
        logger.info("Closing MoviePy clips to free memory")
        try: video.close()
        except Exception: pass
        for c in base_clips:
            try: c.close()
            except Exception: pass
        if intro_clip is not None:
            try: intro_clip.close()
            except Exception: pass
        if outro_clip is not None:
            try: outro_clip.close()
            except Exception: pass

    _progress(95, "Finalizing output")
    _check_cancel()
    _progress(100, "Complete")

    logger.info("Video generation completed successfully")
    return {
        "success": True,
        "timeline": timeline,
        "warnings": warnings,
        "errors": errors,
        "cancelled": False,
        "duration": final_duration if 'final_duration' in locals() else 0
    }
