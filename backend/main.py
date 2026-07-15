print("Starting main.py imports...", flush=True)

"""
main.py - FastAPI backend for Audio Image Sync Studio
Handles file uploads, triggers video generation, and serves outputs.
Batch 2: optional outro video and background music.
Batch 3: export resolution, render profiles, watermark.
"""

import os
import sys
import platform
import uuid

import subprocess
from typing import Optional

def _verify_mp4_audio(filepath: str) -> bool:
    import os
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            filepath
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip().lower() == "audio"
    except FileNotFoundError:
        logger.warning(f"ffprobe not found on PATH. Falling back to size check for {filepath}")
        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            return True
        return False
    except subprocess.CalledProcessError as e:
        logger.error(f"FFprobe process failed for {filepath}: {e}")
        return False
    except Exception as e:
        logger.error(f"FFprobe check failed for {filepath}: {e}")
        return False

def _get_media_duration(filepath: str) -> Optional[float]:
    import subprocess
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            filepath
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except Exception as e:
        # Avoid logger error here if logger is not defined yet, but logger is imported below.
        print(f"Could not get duration for {filepath}: {e}")
        return None

import shutil
import logging
import time
import threading
import re
from pathlib import Path
from typing import Optional, List

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from video_generator import generate_video, GenerationCancelled
from video_timeline_generator import generate_video_timeline, VideoTimelineCancelled
from media_timeline_generator import generate_media_timeline, MediaTimelineCancelled
from utils import seconds_to_mmss, FORMAT_DIMENSIONS
from audio_helpers import prepare_single_audio, prepare_zip_audio, merge_audio_parts_in_order
from transcription_helpers import transcribe_audio_backend, format_output
import caption_engine
import history_store
import batch_queue_store
import batch_queue_runner
import credit_estimator
from access_control import check_access
from pydantic import BaseModel


def safe_rmtree(path, *args, **kwargs):
    kwargs.pop("ignore_errors", None)
    if not os.path.exists(path):
        return
    retries = 3
    for i in range(retries):
        try:
            shutil.rmtree(path, *args, **kwargs)
            return
        except Exception as e:
            if i == retries - 1:
                logger.warning(f"safe_rmtree: Failed to clean up {path} after {retries} retries: {e}")
            else:
                time.sleep(0.5)

def make_clean_filename(raw_name: str, default_name: str, extension: str) -> str:
    name = raw_name.strip() if raw_name and raw_name.strip() else default_name
    if extension and name.lower().endswith(extension.lower()):
        name = name[:-len(extension)]
    name = "".join(c for c in name if c.isalnum() or c in "-_ ")
    name = name.strip().replace(" ", "_")
    if not name:
        name = default_name
    return f"{name}{extension}"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def get_data_dir() -> Path:
    """
    Returns a writable directory for runtime data (uploads/outputs/temp).
    - Packaged/frozen app: use the OS user-data folder (writable without
      admin rights), matching where desktop-backend.log already lives.
    - Local dev (python -m uvicorn ...): keep using the folder next to
      main.py, so nothing changes for the dev workflow.
    """
    is_frozen = getattr(sys, "frozen", False)

    if not is_frozen:
        return Path(__file__).parent

    if platform.system() == "Windows":
        base = Path(os.environ["APPDATA"]) / "syncframe-desktop"
    elif platform.system() == "Darwin":
        base = Path.home() / "Library" / "Application Support" / "syncframe-desktop"
    else:
        base = Path.home() / ".syncframe-desktop"

    base.mkdir(parents=True, exist_ok=True)
    return base


BASE_DIR    = get_data_dir()
UPLOADS_DIR = BASE_DIR / "uploads"
OUTPUTS_DIR = BASE_DIR / "outputs"
TEMP_DIR    = BASE_DIR / "temp"

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
TEMP_DIR.mkdir(parents=True, exist_ok=True)

for d in [UPLOADS_DIR, OUTPUTS_DIR, TEMP_DIR]:
    d.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Allowed values
# ---------------------------------------------------------------------------

ALLOWED_INTRO_EXTS      = {".mp4", ".mov", ".webm"}
ALLOWED_OUTRO_EXTS      = {".mp4", ".mov", ".webm"}
ALLOWED_MUSIC_EXTS      = {".mp3", ".wav", ".m4a", ".aac"}
VALID_ASPECT_RATIOS     = {"9:16", "16:9", "1:1"}
VALID_EXPORT_RESOLUTIONS = {"720p", "1080p", "2K", "4K"}
VALID_RENDER_PROFILES   = {"fast_preview", "balanced", "high_quality"}
VALID_WM_POSITIONS      = {"top_left", "top_right", "bottom_left", "bottom_right", "center"}
VALID_WM_SIZES          = {"small", "medium", "large"}
VALID_FILL_MODES        = {"loop", "trim_only", "freeze"}
ALLOWED_VIDEO_EXTS      = {".mp4", ".mov", ".webm"}

# ---------------------------------------------------------------------------
# Global Render Lock
# ---------------------------------------------------------------------------
from render_lock import get_render_lock_status, acquire_render_lock, release_render_lock

# ---------------------------------------------------------------------------
# In-memory job registry
# ---------------------------------------------------------------------------

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


def _new_job(job_id: str) -> dict:
    state = {
        "job_id":          job_id,
        "status":          "queued",
        "progress":        0,
        "current_step":    "Queued",
        "started_at":      None,
        "finished_at":     None,
        "warnings":        [],
        "errors":          [],
        "output_video_url": None,
        "output_filename": None,
        "timeline_report": [],
        "cancel_event":    threading.Event(),
        "temp_dir":        None,
    }
    with _jobs_lock:
        _jobs[job_id] = state
    return state


def _get_job(job_id: str) -> Optional[dict]:
    with _jobs_lock:
        return _jobs.get(job_id)


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Audio Image Sync Studio",
    description="Generate perfectly timed videos from audio, ordered images, and timestamps.",
    version="1.3.0",
)

app.include_router(credit_estimator.plans_router, prefix="/api/plans")
app.include_router(credit_estimator.credits_router, prefix="/api/credits")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1",
        "null",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    logger.info("Starting Audio Image Sync Studio Backend...")
    # Reset any jobs stuck in running state from a previous crash
    jobs = batch_queue_store.get_all_jobs()
    stuck_jobs = [j for j in jobs if j.get("status") == "running"]
    for j in stuck_jobs:
        logger.warning(f"Resetting stuck job {j['id']} to failed.")
        batch_queue_store.update_job(j["id"], {
            "status": "failed",
            "message": "Interrupted by backend restart."
        })
    release_render_lock(force=True)

app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")


# ---------------------------------------------------------------------------
# Routes — health
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "Audio Image Sync Studio", "version": "1.3.0"}

@app.get("/api/render-lock/status")
async def render_lock_status():
    return get_render_lock_status()

@app.post("/api/render-lock/release")
async def force_release_render_lock():
    release_render_lock(force=True)
    return {"status": "ok", "message": "Render lock forcefully released."}


# ---------------------------------------------------------------------------
# Routes — job system
# ---------------------------------------------------------------------------

@app.post("/api/jobs/start")
async def jobs_start(
    # Audio — mode selector + two upload slots
    audio_input_mode: str = Form("single"),          # 'single' | 'zip'
    audio_file:       Optional[UploadFile] = File(None),   # for mode=single
    audio_zip:        Optional[UploadFile] = File(None),   # for mode=zip
    audio_files:      Optional[List[UploadFile]] = File(None), # backward compatibility
    # Required uploads
    images_zip:      UploadFile = File(...),
    timestamp_csv:   UploadFile = File(...),
    # Core video settings
    aspect_ratio:      str   = Form("9:16"),
    export_resolution: str   = Form("1080p"),
    fit_mode:          str   = Form("cover"),
    transition:        str   = Form("fade"),
    transition_duration: float = Form(0.5),
    zoom_effect:       str   = Form("none"),
    render_profile:    str   = Form("balanced"),
    output_name:       Optional[str] = Form(None),
    # Batch 9A — motion & style
    motion_effect:    str = Form("slow_zoom_in"),
    motion_intensity: str = Form("medium"),
    visual_effect:    str = Form("none"),
    effect_strength:  str = Form("medium"),
    style_preset:     str = Form("clean_default"),
    # Watermark (Batch 3)
    # Optional intro/outro (Batch 2/6)
    intro_file:    Optional[UploadFile] = File(None),
    outro_file:    Optional[UploadFile] = File(None),
    # Optional background music (Batch 2)
    bg_music_file:     Optional[UploadFile] = File(None),
    enable_bg_music:   str   = Form("false"),
    music_volume:      float = Form(0.12),
    music_fade:        str   = Form("true"),
    # Batch 16A — Text Overlay
    text_overlay_enabled: str = Form("false"),
    text_overlay_text: str = Form(""),
    text_overlay_font_family: str = Form("Inter"),
    text_overlay_font_size_percent: float = Form(5.0),
    text_overlay_font_weight: str = Form("Medium"),
    text_overlay_color: str = Form("#FFFFFF"),
    text_overlay_opacity: float = Form(100.0),
    text_overlay_x_percent: float = Form(50.0),
    text_overlay_y_percent: float = Form(88.0),
    text_overlay_align: str = Form("center"),
    text_overlay_max_width_percent: float = Form(90.0),
    text_overlay_shadow_enabled: str = Form("true"),
    text_overlay_stroke_enabled: str = Form("false"),
    text_overlay_stroke_color: str = Form("#000000"),
    text_overlay_background_enabled: str = Form("false"),
    text_overlay_background_color: str = Form("#000000"),
    text_overlay_background_opacity: float = Form(50.0),
    text_overlay_mode: str = Form("whole_video"),
    text_overlay_items: str = Form("[]"),
    # Captions
    caption_source: str = Form("none"),
    caption_config_json: str = Form("{}"),
    caption_preset: str = Form("viral_bold"),
    caption_layout: str = Form("auto"),
    caption_font_scale: float = Form(1.0),
    caption_max_words: int = Form(5),
    caption_max_lines: int = Form(2),
    caption_max_width: int = Form(85),
    caption_vertical_offset: int = Form(0),
    caption_line_spacing: str = Form("normal"),
    caption_style: str = Form(""),
    caption_position: str = Form("lower_center"),
    caption_size: str = Form("large"),
    caption_appearance: str = Form("outline"),
    caption_primary_color: str = Form("#FFFFFF"),
    caption_highlight_color: str = Form("#FFE600"),
    srt_file: Optional[UploadFile] = File(None),
    credit_cost: Optional[int] = Form(None),
):
    """
    Accept uploaded files and settings, create a background job, return {job_id}.
    Client polls GET /api/jobs/{job_id}/status for progress.
    """

    # ── Validate core settings ────────────────────────────────────
    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise HTTPException(400, f"Invalid aspect_ratio '{aspect_ratio}'. Valid: {sorted(VALID_ASPECT_RATIOS)}")
    if export_resolution not in VALID_EXPORT_RESOLUTIONS:
        raise HTTPException(400, f"Invalid export_resolution '{export_resolution}'. Valid: {sorted(VALID_EXPORT_RESOLUTIONS)}")
    if render_profile not in VALID_RENDER_PROFILES:
        raise HTTPException(400, f"Invalid render_profile '{render_profile}'. Valid: {sorted(VALID_RENDER_PROFILES)}")

    # ── Placeholder Backend Access Control ────────────────────────
    # In the future, parse authorization JWT here to get user_id & plan.
    access = check_access(
        user_id="placeholder_user",
        plan_id="pro", # Mocking as pro to allow tests for now
        tool="video_export",
        options={
            "resolution": export_resolution,
            "duration_seconds": 60, # Mocking duration
            "is_premium_template": False
        }
    )
    if not access["allowed"]:
        raise HTTPException(403, access["reason"])

    # ── Normalise Batch 9A params ─────────────────────────────────
    valid_motion_effects   = {"none","slow_zoom_in","slow_zoom_out","ken_burns","pan_left","pan_right","pan_up","pan_down","subtle_random","dynamic_shorts"}
    valid_motion_intensity = {"low", "medium", "high"}
    valid_visual_effects   = {"none","cinematic","warm","high_contrast","black_and_white","clean_bright"}
    valid_effect_strength  = {"low", "medium", "high"}

    motion_effect_safe    = motion_effect    if motion_effect    in valid_motion_effects   else "slow_zoom_in"
    motion_intensity_safe = motion_intensity if motion_intensity in valid_motion_intensity else "medium"
    visual_effect_safe    = visual_effect    if visual_effect    in valid_visual_effects   else "none"
    effect_strength_safe  = effect_strength  if effect_strength  in valid_effect_strength  else "medium"
    transition_dur_safe   = max(0.1, min(float(transition_duration), 2.0))

    # ── Validate optional file types ────────────────────────────────────────
    if intro_file is not None and intro_file.filename:
        ext = Path(intro_file.filename).suffix.lower()
        if ext not in ALLOWED_INTRO_EXTS:
            raise HTTPException(400, f"Unsupported intro file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_INTRO_EXTS))}")

    if outro_file is not None and outro_file.filename:
        ext = Path(outro_file.filename).suffix.lower()
        if ext not in ALLOWED_OUTRO_EXTS:
            raise HTTPException(400, f"Unsupported outro file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_OUTRO_EXTS))}")

    if bg_music_file is not None and bg_music_file.filename:
        ext = Path(bg_music_file.filename).suffix.lower()
        if ext not in ALLOWED_MUSIC_EXTS:
            raise HTTPException(400, f"Unsupported music file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_MUSIC_EXTS))}")

    # ── Normalise other settings ─────────────────────────────────────────────
    enable_music_bool  = enable_bg_music.strip().lower() == "true"
    music_fade_bool    = music_fade.strip().lower() == "true"
    music_vol_clamped  = max(0.0, min(1.0, float(music_volume)))

    text_overlay_enabled_bool = text_overlay_enabled.strip().lower() == "true"
    text_overlay_shadow_bool  = text_overlay_shadow_enabled.strip().lower() == "true"
    text_overlay_stroke_bool  = text_overlay_stroke_enabled.strip().lower() == "true"
    text_overlay_bg_bool      = text_overlay_background_enabled.strip().lower() == "true"

    # Clamp numeric text overlay settings safely
    to_x_pct = max(0.0, min(100.0, float(text_overlay_x_percent)))
    to_y_pct = max(0.0, min(100.0, float(text_overlay_y_percent)))
    to_opacity = max(0.0, min(100.0, float(text_overlay_opacity)))
    to_bg_opacity = max(0.0, min(100.0, float(text_overlay_background_opacity)))
    to_font_size = max(1.0, min(100.0, float(text_overlay_font_size_percent)))
    to_max_width = max(1.0, min(100.0, float(text_overlay_max_width_percent)))

    # Assemble Text Overlay Config
    text_overlay_config = {
        "enabled": text_overlay_enabled_bool,
        "mode": text_overlay_mode,
        "items": [], # Image Timeline legacy endpoint doesn't support timed items or csv columns
        "text": text_overlay_text,
        "font_family": text_overlay_font_family,
        "font_size_percent": to_font_size,
        "font_weight": text_overlay_font_weight,
        "color": text_overlay_color,
        "opacity": to_opacity,
        "x_percent": to_x_pct,
        "y_percent": to_y_pct,
        "align": text_overlay_align,
        "max_width_percent": to_max_width,
        "shadow_enabled": text_overlay_shadow_bool,
        "stroke_enabled": text_overlay_stroke_bool,
        "stroke_color": text_overlay_stroke_color,
        "background_enabled": text_overlay_bg_bool,
        "background_color": text_overlay_background_color,
        "background_opacity": to_bg_opacity,
    }

    # ── Set up job ────────────────────────────────────────────────────────────
    job_id   = uuid.uuid4().hex
    if not acquire_render_lock("direct", "image_timeline", job_id):
        raise HTTPException(409, "Another video is currently rendering. Only one video can be generated at a time.")
    job_temp = TEMP_DIR / job_id
    job_temp.mkdir(parents=True, exist_ok=True)
    # Save optional SRT file
    srt_save_path: Optional[str] = None
    if srt_file is not None and srt_file.filename:
        srt_save_path = str(job_temp / f"captions_{uuid.uuid4().hex}.srt")
        content_srt = await srt_file.read()
        with open(srt_save_path, "wb") as f_srt:
            f_srt.write(content_srt)


    # Save required uploads
    zip_path    = str(job_temp / "images.zip")
    csv_path    = str(job_temp / "timestamps.csv")

    for upload, dest in [(images_zip, zip_path), (timestamp_csv, csv_path)]:
        content = await upload.read()
        with open(dest, "wb") as f:
            f.write(content)

    # ── Prepare main audio via shared helper ──────────────────────────────
    mode = audio_input_mode.strip().lower()
    
    if mode == "single" and audio_file is not None and audio_file.filename:
        try:
            audio_path, _audio_meta = prepare_single_audio(
                await audio_file.read(), audio_file.filename, job_temp
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    elif mode == "zip" and audio_zip is not None and audio_zip.filename:
        try:
            audio_path, _audio_meta = prepare_zip_audio(
                await audio_zip.read(), job_temp
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    elif audio_files is not None and len(audio_files) > 0 and audio_files[0].filename:
        try:
            audio_path, _audio_meta = await prepare_multiple_audio(
                audio_files, job_temp
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    else:
        if mode == "single":
            raise HTTPException(400, "Please upload a main audio file.")
        elif mode == "zip":
            raise HTTPException(400, "Please upload an Audio Parts ZIP.")
        else:
            raise HTTPException(400, "Invalid audio input mode.")

    # Save optional uploads
    intro_path: Optional[str] = None
    if intro_file is not None and intro_file.filename:
        intro_ext  = Path(intro_file.filename).suffix.lower()
        intro_path = str(job_temp / f"intro{intro_ext}")
        content    = await intro_file.read()
        with open(intro_path, "wb") as f:
            f.write(content)

    outro_path: Optional[str] = None
    if outro_file is not None and outro_file.filename:
        outro_ext  = Path(outro_file.filename).suffix.lower()
        outro_path = str(job_temp / f"outro{outro_ext}")
        content    = await outro_file.read()
        with open(outro_path, "wb") as f:
            f.write(content)

    bg_music_path: Optional[str] = None
    if bg_music_file is not None and bg_music_file.filename:
        music_ext     = Path(bg_music_file.filename).suffix.lower()
        bg_music_path = str(job_temp / f"bgmusic{music_ext}")
        content       = await bg_music_file.read()
        with open(bg_music_path, "wb") as f:
            f.write(content)

    # Determine output filename
    output_filename = make_clean_filename(output_name, "video", ".mp4")
    output_path     = str(OUTPUTS_DIR / output_filename)

    # Register job
    state = _new_job(job_id)
    state["temp_dir"]        = str(job_temp)
    state["output_filename"] = output_filename

    def run_job():
        with _jobs_lock:
            state["status"]       = "running"
            state["started_at"]   = time.time()
            state["current_step"] = "Preparing job"
            state["progress"]     = 5

        def progress_callback(pct: int, step: str):
            with _jobs_lock:
                if state["status"] == "running":
                    state["progress"]     = pct
                    state["current_step"] = step

        try:
            # --- PREPARE CAPTIONS ASS ---
            from utils import get_resolution
            target_w, target_h = get_resolution(aspect_ratio, export_resolution)

            caption_ass_path = None
            if caption_source != "none":
                from caption_engine import prepare_captions_ass
                import json
                try:
                    caption_config = json.loads(caption_config_json)
                except:
                    caption_config = {}
                caption_config["caption_source"] = caption_source
                
                def caption_prog(msg, pct):
                    progress_callback(5 + int(pct * 0.1), f"Captions: {msg}")
                try:
                    caption_ass_path = prepare_captions_ass(
                        main_audio_path=audio_path,
                        config=caption_config,
                        width=target_w,
                        height=target_h,
                        progress_callback=caption_prog
                    )
                except Exception as e:
                    logger.error(f"Captions failed: {e}")
                    with _jobs_lock:
                        state["warnings"].append(str(e))

            from utils import Profiler
            profiler = Profiler()
            profiler.start_stage("MoviePy Generate")

            result = generate_video(
                audio_path=audio_path,
                zip_path=zip_path,
                csv_path=csv_path,
                output_path=output_path,
                temp_dir=str(job_temp),
                # Core
                aspect_ratio=aspect_ratio,
                export_resolution=export_resolution,
                fit_mode=fit_mode,
                transition=transition,
                transition_duration=transition_dur_safe,
                zoom_effect=zoom_effect,
                render_profile=render_profile,
                style_preset=style_preset,
                motion_effect=motion_effect_safe,
                motion_intensity=motion_intensity_safe,
                visual_effect=visual_effect_safe,
                effect_strength=effect_strength_safe,
                # Batch 2/6
                intro_path=intro_path,
                outro_path=outro_path,
                bg_music_path=bg_music_path,
                enable_bg_music=enable_music_bool,
                music_volume=music_vol_clamped,
                music_fade=music_fade_bool,
                # Batch 16A — Text Overlay
                text_overlay_config=text_overlay_config,
                # Infra
                cancel_event=state["cancel_event"],
                progress_callback=progress_callback,
                caption_ass_path=caption_ass_path,
            )

            profiler.end_stage()
            timeline_report = _format_timeline(result.get("timeline", []))

            with _jobs_lock:
                state["warnings"]       = result.get("warnings", [])
                state["errors"]         = result.get("errors", [])
                state["timeline_report"] = timeline_report
                state["profiler_report"] = profiler.get_report()
                state["finished_at"]    = time.time()
                is_cancelled = result.get("cancelled")
                is_success = result.get("success", False)

            if is_cancelled:
                with _jobs_lock:
                    state["status"]       = "cancelled"
                    state["current_step"] = "Cancelled"
                    state["progress"]     = 0
            else:
                if is_success and os.path.isfile(output_path):
                    
                    
                    if not _verify_mp4_audio(output_path):
                        with _jobs_lock:
                            state["status"]       = "failed"
                            state["current_step"] = "Failed"
                            state["errors"].append("Final video was created without an audio track. Please check the audio pipeline.")
                        logger.error(f"Job failed audio verification: {output_path}")
                    else:
                        with _jobs_lock:
                            state["status"]            = "completed"
                            state["current_step"]      = "Complete"
                            state["progress"]          = 100
                            state["output_video_url"]  = f"/outputs/{output_filename}"
                        logger.info(f"Final MP4 audio stream verified: true")
                        try:
                            history_store.add_history(
                                tool="image_timeline",
                                tool_label="Image Timeline",
                                output_name=output_filename,
                                output_type="video",
                                output_url=f"/outputs/{output_filename}",
                                file_extension="mp4",
                                duration_seconds=_get_media_duration(output_path) or result.get("duration") or None,
                                resolution=export_resolution,
                                aspect_ratio=aspect_ratio,
                                render_profile=render_profile,
                                file_size_bytes=os.path.getsize(output_path) if os.path.exists(output_path) else None,
                                metadata={
                                    "text_overlay_enabled": str(text_overlay_enabled).strip().lower() == "true",
                                    "text_overlay_mode": text_overlay_mode
                                },
                                credit_cost=credit_cost
                            )
                        except Exception as e:
                            logger.error(f"Failed to add history: {e}")
                else:
                    state["status"]       = "failed"
                    state["current_step"] = "Failed"

        except GenerationCancelled:
            with _jobs_lock:
                state["status"]       = "cancelled"
                state["current_step"] = "Cancelled"
                state["progress"]     = 0
                state["finished_at"]  = time.time()
            if os.path.isfile(output_path):
                try:
                    os.remove(output_path)
                except Exception:
                    pass

        except Exception as exc:
            logger.exception("Unhandled error in job %s", job_id)
            with _jobs_lock:
                state["status"]       = "failed"
                state["current_step"] = "Failed"
                state["errors"]       = [f"Internal server error: {str(exc)}"]
                state["finished_at"]  = time.time()

        finally:
            release_render_lock(job_id)
            try:
                safe_rmtree(str(job_temp), ignore_errors=True)
            except Exception:
                pass
            final_status = state["status"]
            logger.info("Job %s finished → status=%s", job_id, final_status)


    thread = threading.Thread(target=run_job, daemon=True, name=f"job-{job_id[:8]}")
    thread.start()

    logger.info("Job %s queued", job_id)
    return JSONResponse(content={"job_id": job_id})


@app.get("/api/jobs/{job_id}/status")
async def jobs_status(job_id: str):
    state = _get_job(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job not found")

    with _jobs_lock:
        started_at  = state["started_at"]
        finished_at = state["finished_at"]
        progress    = state["progress"]
        status      = state["status"]

    now     = time.time()
    elapsed = round((finished_at or now) - started_at, 1) if started_at else 0.0

    estimated_remaining: Optional[float] = None
    if started_at and progress and progress > 0 and status == "running":
        elapsed_so_far   = now - started_at
        estimated_total  = elapsed_so_far / (progress / 100.0)
        estimated_remaining = round(max(estimated_total - elapsed_so_far, 0), 1)

    with _jobs_lock:
        return JSONResponse(content={
            "job_id":                      job_id,
            "status":                      state["status"],
            "progress":                    state["progress"],
            "current_step":                state["current_step"],
            "elapsed_seconds":             elapsed,
            "estimated_remaining_seconds": estimated_remaining,
            "warnings":                    state["warnings"],
            "errors":                      state["errors"],
            "output_video_url":            state["output_video_url"],
            "output_filename":             state["output_filename"],
            "timeline_report":             state["timeline_report"],
        })


@app.post("/api/jobs/{job_id}/cancel")
async def jobs_cancel(job_id: str):
    state = _get_job(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job not found")

    with _jobs_lock:
        if state["status"] not in ("queued", "running"):
            return JSONResponse(content={"ok": False, "reason": f"Job is already {state['status']}"})
        state["cancel_event"].set()
        state["current_step"] = "Cancelling…"

    logger.info("Cancel requested for job %s", job_id)
    return JSONResponse(content={"ok": True})


# ---------------------------------------------------------------------------
# Routes — Video Timeline job
# ---------------------------------------------------------------------------

@app.post("/api/jobs/start-script-timestamp")
async def jobs_start_script_timestamp(
    audio_file: UploadFile = File(...),
    model_name: str = Form("base"),
    language: str = Form("auto"),
    output_style: str = Form("standard"),
    segmentation_intensity: str = Form("detailed"),
    output_format: str = Form("simple"),
    original_script: Optional[str] = Form(None),
    target_segment_length: Optional[str] = Form(None),
    max_words_per_line: Optional[str] = Form(None),
    split_on_punctuation: Optional[bool] = Form(True),
    avoid_very_short_lines: Optional[bool] = Form(True),
    credit_cost: Optional[int] = Form(None)
):
    job_id = f"st_{uuid.uuid4().hex[:8]}"
    state = _new_job(job_id)

    job_temp = TEMP_DIR / job_id
    job_temp.mkdir(parents=True, exist_ok=True)
    state["temp_dir"] = str(job_temp)
    
    # Save uploaded file
    ext = Path(audio_file.filename).suffix.lower() if audio_file.filename else ".mp3"
    audio_path = str(job_temp / f"input{ext}")
    
    with open(audio_path, "wb") as f:
        f.write(await audio_file.read())

    def _worker():
        try:
            logger.info(
                f"Job {job_id} Script Timestamp Started. "
                f"file={audio_file.filename}, "
                f"model_name={model_name}, "
                f"language={language}, "
                f"output_style={output_style}, "
                f"segmentation_intensity={segmentation_intensity}, "
                f"output_format={output_format}, "
                f"original_script_used={bool(original_script and original_script.strip())}"
            )
            with _jobs_lock:
                state["status"] = "running"
                state["started_at"] = time.time()
                state["current_step"] = "Queued for transcription"
                state["progress"] = 0

            def _progress_cb(step: str, pct: int):
                with _jobs_lock:
                    if state["cancel_event"].is_set():
                        raise GenerationCancelled("Job cancelled by user.")
                    state["current_step"] = step
                    state["progress"] = pct

            advanced = {
                "target_segment_length": target_segment_length,
                "max_words_per_line": max_words_per_line,
                "split_on_punctuation": split_on_punctuation,
                "avoid_very_short_lines": avoid_very_short_lines
            }

            res = transcribe_audio_backend(
                audio_path=audio_path,
                model_name=model_name,
                language=language if language != "auto" else None,
                output_style=output_style,
                segmentation_intensity=segmentation_intensity,
                original_script=original_script,
                advanced_settings=advanced,
                progress_callback=_progress_cb
            )

            with _jobs_lock:
                state["current_step"] = "Formatting output…"
                state["progress"] = 98

            final_text = format_output(res["segments"], output_format)
            
            # Save file to outputs
            ext = "csv" if output_format == "csv" else "srt" if output_format == "srt" else "txt"
            out_name = make_clean_filename("", "transcript", f".{ext}")
            out_dir = OUTPUTS_DIR / "text"
            out_dir.mkdir(exist_ok=True)
            out_path = out_dir / out_name
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(final_text)

            try:
                history_store.add_history(
                    tool="script_timestamp",
                    tool_label="Script Timestamp",
                    output_name=out_name,
                    output_type="text",
                    output_url=f"/outputs/text/{out_name}",
                    file_extension=ext,
                    duration_seconds=res.get("duration") or None,
                    file_size_bytes=os.path.getsize(out_path),
                    metadata={
                        "segments_count": len(res.get("segments", [])),
                        "language": res.get("language", language),
                        "model_name": res.get("model_name", model_name),
                        "output_format": output_format
                    },
                    credit_cost=credit_cost
                )
            except Exception as e:
                logger.error(f"Failed to add history: {e}")

            with _jobs_lock:
                state["status"] = "completed"
                state["progress"] = 100
                state["current_step"] = "Complete"
                state["finished_at"] = time.time()
                # Store results in timeline_report so frontend can read it via status
                state["timeline_report"] = [
                    {
                        "type": "script_timestamp_result",
                        "text": final_text,
                        "segments": res.get("segments", []),
                        "model": res.get("model_name", model_name),
                        "model_name": res.get("model_name", model_name),
                        "model_label": res.get("model_name", model_name),
                        "language": res.get("language", language),
                        "output_style": output_style,
                        "segmentation_intensity": segmentation_intensity,
                        "output_format": output_format,
                        "original_script_used": res.get("original_script_used", False),
                        "duration_seconds": res.get("duration", 0),
                        "processing_seconds": round(time.time() - state["started_at"], 2),
                        "segments_count": res.get("segments_count", 0),
                        "average_segment_seconds": res.get("avg_segment_length", 0)
                    }
                ]
                logger.info(f"Script Timestamp result keys: {list(res.keys())}")
                logger.info(f"Script Timestamp metadata keys: {list(state['timeline_report'][0].keys())}")
                
                logger.info(
                    f"Job {job_id} Script Timestamp Complete. "
                    f"model_name={model_name}, "
                    f"segments_count={res.get('segments_count', 0)}, "
                    f"processing_time={round(time.time() - state['started_at'], 2)}s"
                )

        except GenerationCancelled as e:
            logger.info(f"Job {job_id} cancelled.")
            with _jobs_lock:
                state["status"] = "cancelled"
                state["current_step"] = str(e)
                state["finished_at"] = time.time()
        except Exception as e:
            logger.exception(f"Job {job_id} failed.")
            with _jobs_lock:
                state["status"] = "error"
                state["current_step"] = f"Error: {str(e)}"
                state["errors"].append(str(e))
                state["finished_at"] = time.time()
        finally:
            # Cleanup temp
            try:
                safe_rmtree(state["temp_dir"], ignore_errors=True)
            except:
                pass

    threading.Thread(target=_worker, daemon=True).start()
    return JSONResponse(content={"job_id": job_id})


@app.post("/api/jobs/start-video-timeline")
async def jobs_start_video_timeline(
    # Audio — mode selector + two upload slots
    audio_input_mode: str = Form("single"),          # 'single' | 'zip'
    audio_file:       Optional[UploadFile] = File(None),
    audio_zip:        Optional[UploadFile] = File(None),
    audio_files:      Optional[List[UploadFile]] = File(None),
    # Required uploads
    videos_zip:   UploadFile = File(...),
    timeline_csv: UploadFile = File(...),
    # Optional uploads
    intro_file:   Optional[UploadFile] = File(None),
    outro_file:   Optional[UploadFile] = File(None),
    # Core settings
    aspect_ratio:      str = Form("9:16"),
    export_resolution: str = Form("1080p"),
    fit_mode:          str = Form("cover"),
    fill_mode:         str = Form("loop"),
    render_profile:    str = Form("balanced"),
    output_name:       Optional[str] = Form(None),
    # Batch 10C — styling
    transition:          str   = Form("none"),
    transition_duration: float = Form(0.5),
    visual_effect:       str   = Form("none"),
    effect_strength:     str   = Form("medium"),
    # Batch 10C — watermark
    # Batch 12A — motion
    motion_style:            str   = Form("none"),
    motion_intensity:        str   = Form("medium"),
    # Background Music
    background_music_file:   Optional[UploadFile] = File(None),
    background_music_volume: float = Form(15.0),
    background_music_loop:   bool  = Form(True),
    background_music_fade:   bool  = Form(True),
    # Batch 16A — Text Overlay
    text_overlay_enabled: str = Form("false"),
    text_overlay_text: str = Form(""),
    text_overlay_font_family: str = Form("Inter"),
    text_overlay_font_size_percent: float = Form(5.0),
    text_overlay_font_weight: str = Form("Bold"),
    text_overlay_color: str = Form("#FFFFFF"),
    text_overlay_opacity: float = Form(100.0),
    text_overlay_x_percent: float = Form(50.0),
    text_overlay_y_percent: float = Form(90.0),
    text_overlay_align: str = Form("center"),
    text_overlay_max_width_percent: float = Form(80.0),
    text_overlay_shadow_enabled: str = Form("true"),
    text_overlay_stroke_enabled: str = Form("true"),
    text_overlay_stroke_color: str = Form("#000000"),
    text_overlay_background_enabled: str = Form("false"),
    text_overlay_background_color: str = Form("#000000"),
    text_overlay_background_opacity: float = Form(50.0),
    text_overlay_mode: str = Form("whole_video"),
    text_overlay_items: str = Form("[]"),
    # Captions
    caption_source: str = Form("none"),
    caption_config_json: str = Form("{}"),
    caption_preset: str = Form("viral_bold"),
    caption_layout: str = Form("auto"),
    caption_font_scale: float = Form(1.0),
    caption_max_words: int = Form(5),
    caption_max_lines: int = Form(2),
    caption_max_width: int = Form(85),
    caption_vertical_offset: int = Form(0),
    caption_line_spacing: str = Form("normal"),
    caption_style: str = Form(""),
    caption_position: str = Form("lower_center"),
    caption_size: str = Form("large"),
    caption_appearance: str = Form("outline"),
    caption_primary_color: str = Form("#FFFFFF"),
    caption_highlight_color: str = Form("#FFE600"),
    srt_file: Optional[UploadFile] = File(None),
    credit_cost: Optional[int] = Form(None),
):
    """
    Accept uploaded files and settings for Video Timeline mode (Batch 10B + 10C).
    Creates a background job; client polls GET /api/jobs/{job_id}/status.
    """

    text_overlay_enabled_bool = text_overlay_enabled.strip().lower() == "true"
    import json
    try:
        parsed_items = json.loads(text_overlay_items)
    except:
        parsed_items = []
        
    text_overlay_config = {
        "mode": text_overlay_mode,
        "items": parsed_items,
        "enabled": text_overlay_enabled_bool,
        "text": text_overlay_text,
        "font_family": text_overlay_font_family,
        "font_size_percent": text_overlay_font_size_percent,
        "font_weight": text_overlay_font_weight,
        "color": text_overlay_color,
        "opacity": text_overlay_opacity,
        "x_percent": text_overlay_x_percent,
        "y_percent": text_overlay_y_percent,
        "align": text_overlay_align,
        "max_width_percent": text_overlay_max_width_percent,
        "shadow_enabled": text_overlay_shadow_enabled.strip().lower() == "true",
        "stroke_enabled": text_overlay_stroke_enabled.strip().lower() == "true",
        "stroke_color": text_overlay_stroke_color,
        "background_enabled": text_overlay_background_enabled.strip().lower() == "true",
        "background_color": text_overlay_background_color,
        "background_opacity": text_overlay_background_opacity,
    }

    # Validate
    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise HTTPException(400, f"Invalid aspect_ratio '{aspect_ratio}'.")
    if export_resolution not in VALID_EXPORT_RESOLUTIONS:
        raise HTTPException(400, f"Invalid export_resolution '{export_resolution}'.")
    if render_profile not in VALID_RENDER_PROFILES:
        raise HTTPException(400, f"Invalid render_profile '{render_profile}'.")
    fill_mode_safe = fill_mode if fill_mode in VALID_FILL_MODES else "loop"

    # Set up job temp dir
    job_id   = uuid.uuid4().hex
    if not acquire_render_lock("direct", "video_timeline", job_id):
        raise HTTPException(409, "Another video is currently rendering. Only one video can be generated at a time.")
    job_temp = TEMP_DIR / job_id
    job_temp.mkdir(parents=True, exist_ok=True)
    # Save optional SRT file
    srt_save_path: Optional[str] = None
    if srt_file is not None and srt_file.filename:
        srt_save_path = str(job_temp / f"captions_{uuid.uuid4().hex}.srt")
        content_srt = await srt_file.read()
        with open(srt_save_path, "wb") as f_srt:
            f_srt.write(content_srt)


    # Save required uploads
    zip_path   = str(job_temp / "videos.zip")
    csv_path   = str(job_temp / "timeline.csv")

    for upload, dest in [
        (videos_zip, zip_path),
        (timeline_csv, csv_path),
    ]:
        content = await upload.read()
        with open(dest, "wb") as f:
            f.write(content)

    # ── Prepare main audio via shared helper ──────────────────────────────
    vt_mode = audio_input_mode.strip().lower()

    if vt_mode == "single" and audio_file is not None and audio_file.filename:
        try:
            audio_path, _audio_meta = prepare_single_audio(
                await audio_file.read(), audio_file.filename, job_temp
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    elif vt_mode == "zip" and audio_zip is not None and audio_zip.filename:
        try:
            audio_path, _audio_meta = prepare_zip_audio(
                await audio_zip.read(), job_temp
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    elif audio_files is not None and len(audio_files) > 0 and audio_files[0].filename:
        try:
            audio_path, _audio_meta = await prepare_multiple_audio(
                audio_files, job_temp
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    else:
        if vt_mode == "single":
            raise HTTPException(400, "Please upload a main audio file.")
        elif vt_mode == "zip":
            raise HTTPException(400, "Please upload an Audio Parts ZIP.")
        else:
            raise HTTPException(400, "Invalid audio input mode.")

    # Save optional intro/outro
    intro_path: Optional[str] = None
    outro_path: Optional[str] = None

    if intro_file and intro_file.filename:
        intro_ext  = Path(intro_file.filename).suffix or ".mp4"
        intro_path = str(job_temp / f"intro{intro_ext}")
        intro_data = await intro_file.read()
        if intro_data:
            with open(intro_path, "wb") as f:
                f.write(intro_data)
        else:
            intro_path = None

    if outro_file and outro_file.filename:
        outro_ext  = Path(outro_file.filename).suffix or ".mp4"
        outro_path = str(job_temp / f"outro{outro_ext}")
        outro_data = await outro_file.read()
        if outro_data:
            with open(outro_path, "wb") as f:
                f.write(outro_data)
        else:
            outro_path = None

    # Save optional background music
    bg_music_path: Optional[str] = None
    if background_music_file and background_music_file.filename:
        bg_ext = Path(background_music_file.filename).suffix or ".mp3"
        bg_music_path = str(job_temp / f"bg_music{bg_ext}")
        bg_data = await background_music_file.read()
        if bg_data:
            with open(bg_music_path, "wb") as f:
                f.write(bg_data)
        else:
            bg_music_path = None

    # Output filename
    output_filename = make_clean_filename(output_name, "video_timeline", ".mp4")
    output_path     = str(OUTPUTS_DIR / output_filename)

    # Register job
    state = _new_job(job_id)
    state["temp_dir"]        = str(job_temp)
    state["output_filename"] = output_filename

    def run_job():
        with _jobs_lock:
            state["status"]       = "running"
            state["started_at"]   = time.time()
            state["current_step"] = "Starting video timeline job"
            state["progress"]     = 3

        def progress_callback(pct: int, step: str):
            with _jobs_lock:
                if state["status"] == "running":
                    state["progress"]     = pct
                    state["current_step"] = step

        try:
            # --- PREPARE CAPTIONS ASS ---
            from utils import get_resolution
            target_w, target_h = get_resolution(aspect_ratio, export_resolution)

            caption_ass_path = None
            if caption_source != "none":
                from caption_engine import prepare_captions_ass
                import json
                try:
                    caption_config = json.loads(caption_config_json)
                except:
                    caption_config = {}
                caption_config["caption_source"] = caption_source
                
                def caption_prog(msg, pct):
                    progress_callback(5 + int(pct * 0.1), f"Captions: {msg}")
                try:
                    caption_ass_path = prepare_captions_ass(
                        main_audio_path=audio_path,
                        config=caption_config,
                        width=target_w,
                        height=target_h,
                        progress_callback=caption_prog
                    )
                except Exception as e:
                    logger.error(f"Captions failed: {e}")
                    with _jobs_lock:
                        state["warnings"].append(str(e))

            from utils import Profiler
            profiler = Profiler()
            profiler.start_stage("MoviePy Generate")

            result = generate_video_timeline(
                audio_path=audio_path,
                zip_path=zip_path,
                csv_path=csv_path,
                output_path=output_path,
                temp_dir=str(job_temp),
                aspect_ratio=aspect_ratio,
                export_resolution=export_resolution,
                fit_mode=fit_mode,
                fill_mode=fill_mode_safe,
                render_profile=render_profile,
                transition=transition,
                transition_duration=transition_duration,
                visual_effect=visual_effect,
                effect_strength=effect_strength,
                motion_style=motion_style,
                motion_intensity=motion_intensity,
                background_music_path=bg_music_path,
                background_music_volume=background_music_volume,
                background_music_loop=background_music_loop,
                background_music_fade=background_music_fade,
                text_overlay_config=text_overlay_config,
                intro_path=intro_path,
                outro_path=outro_path,
                cancel_event=state["cancel_event"],
                progress_callback=progress_callback,
                caption_ass_path=caption_ass_path,
            )

            profiler.end_stage()
            timeline_report = _format_timeline(result.get("timeline", []))

            with _jobs_lock:
                state["warnings"]        = result.get("warnings", [])
                state["errors"]          = result.get("errors", [])
                state["timeline_report"] = timeline_report
                state["profiler_report"] = profiler.get_report()
                state["finished_at"]     = time.time()
                is_cancelled = result.get("cancelled")
                is_success = result.get("success", False)

            if is_cancelled:
                with _jobs_lock:
                    state["status"]       = "cancelled"
                    state["current_step"] = "Cancelled"
                    state["progress"]     = 0
            else:
                if is_success and os.path.isfile(output_path):
                    
                    
                    if not _verify_mp4_audio(output_path):
                        with _jobs_lock:
                            state["status"]       = "failed"
                            state["current_step"] = "Failed"
                            state["errors"].append("Final video was created without an audio track. Please check the audio pipeline.")
                        logger.error(f"Job failed audio verification: {output_path}")
                    else:
                        with _jobs_lock:
                            state["status"]           = "completed"
                            state["current_step"]     = "Complete"
                            state["progress"]         = 100
                            state["output_video_url"] = f"/outputs/{output_filename}"
                        logger.info(f"Final MP4 audio stream verified: true")
                        try:
                            history_store.add_history(
                                tool="video_timeline",
                                tool_label="Video Timeline",
                                output_name=output_filename,
                                output_type="video",
                                output_url=f"/outputs/{output_filename}",
                                file_extension="mp4",
                                duration_seconds=_get_media_duration(output_path) or result.get("visual_duration") or result.get("audio_duration") or None,
                                resolution=export_resolution,
                                aspect_ratio=aspect_ratio,
                                render_profile=render_profile,
                                file_size_bytes=os.path.getsize(output_path) if os.path.exists(output_path) else None,
                                metadata={
                                    "text_overlay_enabled": str(text_overlay_enabled).strip().lower() == "true",
                                    "text_overlay_mode": text_overlay_mode
                                },
                                credit_cost=credit_cost
                            )
                        except Exception as e:
                            logger.error(f"Failed to add history: {e}")
                else:
                    state["status"]       = "failed"
                    state["current_step"] = "Failed"

        except VideoTimelineCancelled:
            with _jobs_lock:
                state["status"]       = "cancelled"
                state["current_step"] = "Cancelled"
                state["progress"]     = 0
                state["finished_at"]  = time.time()
            if os.path.isfile(output_path):
                try: os.remove(output_path)
                except Exception: pass

        except Exception as exc:
            logger.exception("Unhandled error in video timeline job %s", job_id)
            with _jobs_lock:
                state["status"]       = "failed"
                state["current_step"] = "Failed"
                state["errors"]       = [f"Internal server error: {str(exc)}"]
                state["finished_at"]  = time.time()

        finally:
            release_render_lock(job_id)
            try:
                safe_rmtree(str(job_temp), ignore_errors=True)
            except Exception:
                pass
            final_status = state["status"]
            logger.info("Video timeline job %s finished → status=%s", job_id, final_status)


    thread = threading.Thread(target=run_job, daemon=True, name=f"vtl-{job_id[:8]}")
    thread.start()

    logger.info("Video timeline job %s queued", job_id)
    return JSONResponse(content={"job_id": job_id})


# ---------------------------------------------------------------------------
# Route — Media Timeline (Batch 11B)
# ---------------------------------------------------------------------------

@app.post("/api/jobs/start-media-timeline")
async def jobs_start_media_timeline(
    # Audio — mode selector + two upload slots
    audio_input_mode: str = Form("single"),          # 'single' | 'zip'
    audio_file:       Optional[UploadFile] = File(None),
    audio_zip:        Optional[UploadFile] = File(None),
    audio_files:      Optional[List[UploadFile]] = File(None),
    # Required uploads
    media_zip:    UploadFile = File(...),
    timeline_csv: UploadFile = File(...),
    # Core settings
    aspect_ratio:      str = Form("9:16"),
    export_resolution: str = Form("1080p"),
    fit_mode:          str = Form("cover"),
    fill_mode:         str = Form("loop"),
    render_profile:    str = Form("balanced"),
    output_name:       Optional[str] = Form(None),
    # Batch 11C — Text Styling
    text_position:     str = Form("bottom_center"),
    text_size:         str = Form("medium"),
    text_color:        str = Form("white"),
    text_background:   str = Form("soft_shadow"),
    text_width:        str = Form("wide"),
    text_alignment:    str = Form("center"),
    # Batch 11D — Enhancements
    transition:              str   = Form("none"),
    transition_duration:     float = Form(0.5),
    visual_effect:           str   = Form("none"),
    effect_strength:         str   = Form("medium"),
    # Batch 11D — Watermark
    # Batch 12A — motion
    motion_style:            str   = Form("none"),
    motion_intensity:        str   = Form("medium"),
    # Background Music
    background_music_file:   Optional[UploadFile] = File(None),
    background_music_volume: float = Form(15.0),
    background_music_loop:   bool  = Form(True),
    background_music_fade:   bool  = Form(True),
    # Batch 11D — Intro / Outro
    intro_file:              Optional[UploadFile] = File(None),
    outro_file:              Optional[UploadFile] = File(None),
    # Batch 16A — Text Overlay
    text_overlay_enabled: str = Form("false"),
    text_overlay_text: str = Form(""),
    text_overlay_font_family: str = Form("Inter"),
    text_overlay_font_size_percent: float = Form(5.0),
    text_overlay_font_weight: str = Form("Bold"),
    text_overlay_color: str = Form("#FFFFFF"),
    text_overlay_opacity: float = Form(100.0),
    text_overlay_x_percent: float = Form(50.0),
    text_overlay_y_percent: float = Form(90.0),
    text_overlay_align: str = Form("center"),
    text_overlay_max_width_percent: float = Form(80.0),
    text_overlay_shadow_enabled: str = Form("true"),
    text_overlay_stroke_enabled: str = Form("true"),
    text_overlay_stroke_color: str = Form("#000000"),
    text_overlay_background_enabled: str = Form("false"),
    text_overlay_background_color: str = Form("#000000"),
    text_overlay_background_opacity: float = Form(50.0),
    text_overlay_mode: str = Form("whole_video"),
    text_overlay_items: str = Form("[]"),
    # Captions
    caption_source: str = Form("none"),
    caption_config_json: str = Form("{}"),
    caption_preset: str = Form("viral_bold"),
    caption_layout: str = Form("auto"),
    caption_font_scale: float = Form(1.0),
    caption_max_words: int = Form(5),
    caption_max_lines: int = Form(2),
    caption_max_width: int = Form(85),
    caption_vertical_offset: int = Form(0),
    caption_line_spacing: str = Form("normal"),
    caption_style: str = Form(""),
    caption_position: str = Form("lower_center"),
    caption_size: str = Form("large"),
    caption_appearance: str = Form("outline"),
    caption_primary_color: str = Form("#FFFFFF"),
    caption_highlight_color: str = Form("#FFE600"),
    srt_file: Optional[UploadFile] = File(None),
    credit_cost: Optional[int] = Form(None),
):
    """
    Accept uploaded files and settings for Media Timeline mode (Batch 11B).
    Creates a background job; client polls GET /api/jobs/{job_id}/status.
    """

    text_overlay_enabled_bool = text_overlay_enabled.strip().lower() == "true"
    import json
    try:
        parsed_items = json.loads(text_overlay_items)
    except:
        parsed_items = []
        
    text_overlay_config = {
        "mode": text_overlay_mode,
        "items": parsed_items,
        "enabled": text_overlay_enabled_bool,
        "text": text_overlay_text,
        "font_family": text_overlay_font_family,
        "font_size_percent": text_overlay_font_size_percent,
        "font_weight": text_overlay_font_weight,
        "color": text_overlay_color,
        "opacity": text_overlay_opacity,
        "x_percent": text_overlay_x_percent,
        "y_percent": text_overlay_y_percent,
        "align": text_overlay_align,
        "max_width_percent": text_overlay_max_width_percent,
        "shadow_enabled": text_overlay_shadow_enabled.strip().lower() == "true",
        "stroke_enabled": text_overlay_stroke_enabled.strip().lower() == "true",
        "stroke_color": text_overlay_stroke_color,
        "background_enabled": text_overlay_background_enabled.strip().lower() == "true",
        "background_color": text_overlay_background_color,
        "background_opacity": text_overlay_background_opacity,
    }

    # Validate
    if aspect_ratio not in VALID_ASPECT_RATIOS:
        raise HTTPException(400, f"Invalid aspect_ratio '{aspect_ratio}'.")
    if export_resolution not in VALID_EXPORT_RESOLUTIONS:
        raise HTTPException(400, f"Invalid export_resolution '{export_resolution}'.")
    if render_profile not in VALID_RENDER_PROFILES:
        raise HTTPException(400, f"Invalid render_profile '{render_profile}'.")
    fill_mode_safe = fill_mode if fill_mode in VALID_FILL_MODES else "loop"

    # Set up job temp dir
    job_id   = uuid.uuid4().hex

    if not acquire_render_lock("direct", "media_timeline", job_id):
        raise HTTPException(409, "A video is currently generating in the Studio. Please wait for it to finish before starting a new one.")

    job_temp = TEMP_DIR / job_id
    job_temp.mkdir(parents=True, exist_ok=True)
    # Save optional SRT file
    srt_save_path: Optional[str] = None
    if srt_file is not None and srt_file.filename:
        srt_save_path = str(job_temp / f"captions_{uuid.uuid4().hex}.srt")
        content_srt = await srt_file.read()
        with open(srt_save_path, "wb") as f_srt:
            f_srt.write(content_srt)


    # Save required uploads
    zip_path   = str(job_temp / "media.zip")
    csv_path   = str(job_temp / "timeline.csv")

    for upload, dest in [
        (media_zip, zip_path),
        (timeline_csv, csv_path),
    ]:
        content = await upload.read()
        with open(dest, "wb") as f:
            f.write(content)

    # ── Prepare main audio via shared helper ──────────────────────────────
    mt_mode = audio_input_mode.strip().lower()

    if mt_mode == "single" and audio_file is not None and audio_file.filename:
        try:
            audio_path, _audio_meta = prepare_single_audio(
                await audio_file.read(), audio_file.filename, job_temp
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    elif mt_mode == "zip" and audio_zip is not None and audio_zip.filename:
        try:
            audio_path, _audio_meta = prepare_zip_audio(
                await audio_zip.read(), job_temp
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    elif audio_files is not None and len(audio_files) > 0 and audio_files[0].filename:
        try:
            audio_path, _audio_meta = await prepare_multiple_audio(
                audio_files, job_temp
            )
        except ValueError as e:
            raise HTTPException(400, str(e))
    else:
        if mt_mode == "single":
            raise HTTPException(400, "Please upload a main audio file.")
        elif mt_mode == "zip":
            raise HTTPException(400, "Please upload an Audio Parts ZIP.")
        else:
            raise HTTPException(400, "Invalid audio input mode.")

    # Save optional intro/outro
    intro_path, outro_path = None, None
    if intro_file and intro_file.filename:
        intro_ext  = Path(intro_file.filename).suffix or ".mp4"
        intro_path = str(job_temp / f"intro{intro_ext}")
        with open(intro_path, "wb") as f:
            f.write(await intro_file.read())

    if outro_file and outro_file.filename:
        outro_ext  = Path(outro_file.filename).suffix or ".mp4"
        outro_path = str(job_temp / f"outro{outro_ext}")
        with open(outro_path, "wb") as f:
            f.write(await outro_file.read())

    # Save optional background music
    bg_music_path: Optional[str] = None
    if background_music_file and background_music_file.filename:
        bg_ext = Path(background_music_file.filename).suffix or ".mp3"
        bg_music_path = str(job_temp / f"bg_music{bg_ext}")
        bg_data = await background_music_file.read()
        if bg_data:
            with open(bg_music_path, "wb") as f:
                f.write(bg_data)
        else:
            bg_music_path = None

    # Output filename
    output_filename = make_clean_filename(output_name, "media_timeline", ".mp4")
    output_path     = str(OUTPUTS_DIR / output_filename)

    # Register job
    state = _new_job(job_id)
    state["temp_dir"]        = str(job_temp)
    state["output_filename"] = output_filename

    def run_job():
        with _jobs_lock:
            state["status"]       = "running"
            state["started_at"]   = time.time()
            state["current_step"] = "Starting media timeline job"
            state["progress"]     = 3

        def progress_callback(pct: int, step: str):
            with _jobs_lock:
                if state["status"] == "running":
                    state["progress"]     = pct
                    state["current_step"] = step

        try:
            # --- PREPARE CAPTIONS ASS ---
            from utils import get_resolution
            target_w, target_h = get_resolution(aspect_ratio, export_resolution)

            caption_ass_path = None
            if caption_source != "none":
                from caption_engine import prepare_captions_ass
                import json
                try:
                    caption_config = json.loads(caption_config_json)
                except:
                    caption_config = {}
                caption_config["caption_source"] = caption_source
                
                def caption_prog(msg, pct):
                    progress_callback(5 + int(pct * 0.1), f"Captions: {msg}")
                try:
                    caption_ass_path = prepare_captions_ass(
                        main_audio_path=audio_path,
                        config=caption_config,
                        width=target_w,
                        height=target_h,
                        progress_callback=caption_prog
                    )
                except Exception as e:
                    logger.error(f"Captions failed: {e}")
                    with _jobs_lock:
                        state["warnings"].append(str(e))

            from utils import Profiler
            profiler = Profiler()
            profiler.start_stage("MoviePy Generate")

            result = generate_media_timeline(
                audio_path=audio_path,
                zip_path=zip_path,
                csv_path=csv_path,
                output_path=output_path,
                temp_dir=str(job_temp),
                aspect_ratio=aspect_ratio,
                export_resolution=export_resolution,
                fit_mode=fit_mode,
                fill_mode=fill_mode_safe,
                render_profile=render_profile,
                text_position=text_position,
                text_size=text_size,
                text_color=text_color,
                text_background=text_background,
                text_width=text_width,
                text_alignment=text_alignment,
                transition=transition,
                transition_duration=transition_duration,
                visual_effect=visual_effect,
                effect_strength=effect_strength,
                motion_style=motion_style,
                motion_intensity=motion_intensity,
                background_music_path=bg_music_path,
                background_music_volume=background_music_volume,
                background_music_loop=background_music_loop,
                background_music_fade=background_music_fade,
                text_overlay_config=text_overlay_config,
                intro_path=intro_path,
                outro_path=outro_path,
                cancel_event=state["cancel_event"],
                progress_callback=progress_callback,
                caption_ass_path=caption_ass_path,
            )

            profiler.end_stage()
            timeline_report = _format_timeline(result.get("timeline", []))

            with _jobs_lock:
                state["warnings"]        = result.get("warnings", [])
                state["errors"]          = result.get("errors", [])
                state["timeline_report"] = timeline_report
                state["profiler_report"] = profiler.get_report()
                state["finished_at"]     = time.time()
                is_cancelled = result.get("cancelled")
                is_success = result.get("success", False)

            if is_cancelled:
                with _jobs_lock:
                    state["status"]       = "cancelled"
                    state["current_step"] = "Cancelled"
                    state["progress"]     = 0
            else:
                if is_success and os.path.isfile(output_path):
                    
                    
                    if not _verify_mp4_audio(output_path):
                        with _jobs_lock:
                            state["status"]       = "failed"
                            state["current_step"] = "Failed"
                            state["errors"].append("Final video was created without an audio track. Please check the audio pipeline.")
                        logger.error(f"Job failed audio verification: {output_path}")
                    else:
                        with _jobs_lock:
                            state["status"]           = "completed"
                            state["current_step"]     = "Complete"
                            state["progress"]         = 100
                            state["output_video_url"] = f"/outputs/{output_filename}"
                        logger.info(f"Final MP4 audio stream verified: true")
                        try:
                            history_store.add_history(
                                tool="media_timeline",
                                tool_label="Media Timeline",
                                output_name=output_filename,
                                output_type="video",
                                output_url=f"/outputs/{output_filename}",
                                file_extension="mp4",
                                duration_seconds=_get_media_duration(output_path) or result.get("visual_duration") or result.get("audio_duration") or None,
                                resolution=export_resolution,
                                aspect_ratio=aspect_ratio,
                                render_profile=render_profile,
                                file_size_bytes=os.path.getsize(output_path) if os.path.exists(output_path) else None,
                                metadata={
                                    "text_overlay_enabled": str(text_overlay_enabled).strip().lower() == "true",
                                    "text_overlay_mode": text_overlay_mode
                                },
                                credit_cost=credit_cost
                            )
                        except Exception as e:
                            logger.error(f"Failed to add history: {e}")
                else:
                    state["status"]       = "failed"
                    state["current_step"] = "Failed"

        except MediaTimelineCancelled:
            with _jobs_lock:
                state["status"]       = "cancelled"
                state["current_step"] = "Cancelled"
                state["progress"]     = 0
                state["finished_at"]  = time.time()
            if os.path.isfile(output_path):
                try: os.remove(output_path)
                except Exception: pass

        except Exception as exc:
            logger.exception("Unhandled error in media timeline job %s", job_id)
            with _jobs_lock:
                state["status"]       = "failed"
                state["current_step"] = "Failed"
                state["errors"]       = [f"Internal server error: {str(exc)}"]
                state["finished_at"]  = time.time()

        finally:
            release_render_lock(job_id)
            try:
                safe_rmtree(str(job_temp), ignore_errors=True)
            except Exception:
                pass
            final_status = state["status"]
            logger.info("Media timeline job %s finished → status=%s", job_id, final_status)


    thread = threading.Thread(target=run_job, daemon=True, name=f"mtl-{job_id[:8]}")
    thread.start()

    logger.info("Media timeline job %s queued", job_id)
    return JSONResponse(content={"job_id": job_id})


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _format_timeline(rows: list[dict]) -> list[dict]:
    result = []
    for row in rows:
        result.append({
            "image":    row.get("image", ""),
            "start":    seconds_to_mmss(row.get("start", 0)),
            "end":      seconds_to_mmss(row.get("end", 0)),
            "duration": f"{row.get('duration', 0):.3f}s",
            "text":     row.get("text", ""),
            "status":   row.get("status", "ok"),
        })
    return result


# ---------------------------------------------------------------------------
# Routes — legacy synchronous generate (backward compat)
# ---------------------------------------------------------------------------

@app.post("/api/generate")
async def generate(
    audio_file:    UploadFile = File(...),
    images_zip:    UploadFile = File(...),
    timestamp_csv: UploadFile = File(...),
    video_format:  str   = Form("16:9"),
    fit_mode:      str   = Form("cover"),
    transition:    str   = Form("none"),
    zoom_effect:   str   = Form("none"),
    output_name:   Optional[str] = Form(None),
):
    """
    Legacy synchronous endpoint — kept for backward compatibility.
    Uses 1080p resolution and balanced profile.
    New clients should use POST /api/jobs/start for full Batch 3 features.
    """
    job_id   = uuid.uuid4().hex
    job_temp = TEMP_DIR / job_id
    job_temp.mkdir(parents=True, exist_ok=True)
    start_ts = time.time()
    logger.info("Starting legacy job %s", job_id)

    try:
        audio_ext  = Path(audio_file.filename).suffix if audio_file.filename else ".mp3"
        audio_path = str(job_temp / f"audio{audio_ext}")
        zip_path   = str(job_temp / "images.zip")
        csv_path   = str(job_temp / "timestamps.csv")

        for upload, dest in [(audio_file, audio_path), (images_zip, zip_path), (timestamp_csv, csv_path)]:
            content = await upload.read()
            with open(dest, "wb") as f:
                f.write(content)

        safe_name       = output_name.strip() if output_name and output_name.strip() else "video"
        safe_name       = "".join(c for c in safe_name if c.isalnum() or c in "-_ ")
        safe_name       = safe_name.strip().replace(" ", "_") or "video"
        timestamp_str   = time.strftime("%Y%m%d_%H%M%S")
        output_filename = f"{safe_name}_{timestamp_str}.mp4"
        output_path     = str(OUTPUTS_DIR / output_filename)

        # Map old video_format → aspect_ratio; always use 1080p
        aspect = video_format if video_format in ("9:16", "16:9", "1:1") else "16:9"

        result = generate_video(
            audio_path=audio_path,
            zip_path=zip_path,
            csv_path=csv_path,
            output_path=output_path,
            temp_dir=str(job_temp),
            aspect_ratio=aspect,
            export_resolution="1080p",
            fit_mode=fit_mode,
            transition=transition,
            zoom_effect=zoom_effect,
            render_profile="balanced",
        )

        elapsed = round(time.time() - start_ts, 2)
        logger.info("Legacy job %s finished in %.2fs  success=%s", job_id, elapsed, result["success"])

        timeline_report = _format_timeline(result.get("timeline", []))

        response: dict = {
            "success":          result["success"],
            "job_id":           job_id,
            "elapsed_seconds":  elapsed,
            "timeline_report":  timeline_report,
            "warnings":         result.get("warnings", []),
            "errors":           result.get("errors", []),
        }
        if result["success"] and os.path.isfile(output_path):
            response["output_video_url"]  = f"/outputs/{output_filename}"
            response["output_filename"]   = output_filename
        else:
            response["output_video_url"]  = None
            response["output_filename"]   = None

        return JSONResponse(content=response)

    except Exception as e:
        logger.exception("Unhandled error in legacy job %s", job_id)
        return JSONResponse(
            status_code=500,
            content={"success": False, "errors": [f"Internal server error: {str(e)}"], "warnings": [], "timeline_report": []},
        )
    finally:
        try:
            safe_rmtree(str(job_temp), ignore_errors=True)
        except Exception:
            pass



# ---------------------------------------------------------------------------
# Audio Merger Route
# ---------------------------------------------------------------------------

@app.post("/api/tools/audio-merge")
async def audio_merge(
    audio_parts: List[UploadFile] = File(...),
    output_format: str = Form("wav"),
    output_filename: str = Form("merged_audio"),
    credit_cost: Optional[int] = Form(None)
):
    import time
    job_id = f"audio_merge_{uuid.uuid4().hex[:8]}"
    job_temp = TEMP_DIR / job_id
    job_temp.mkdir(parents=True, exist_ok=True)
    
    try:
        # Save parts in exact array order
        audio_paths = []
        for i, part in enumerate(audio_parts):
            content = await part.read()
            ext = Path(part.filename).suffix.lower() if part.filename else ".mp3"
            if ext not in {".mp3", ".wav", ".m4a", ".aac"}:
                ext = ".mp3"
            
            # Save safely
            part_path = str(job_temp / f"part_{i:03d}{ext}")
            with open(part_path, "wb") as f:
                f.write(content)
            audio_paths.append(part_path)
            
        fmt = "wav" if output_format.lower() == "wav" else "mp3"
        final_filename = make_clean_filename(output_filename, "merged_audio", f".{fmt}")
        
        output_dir = OUTPUTS_DIR / "audio"
        output_dir.mkdir(exist_ok=True)
        final_path = str(output_dir / final_filename)
        
        duration, meta = merge_audio_parts_in_order(audio_paths, final_path, fmt)
        
        try:
            history_store.add_history(
                tool="audio_merger",
                tool_label="Audio Merger",
                output_name=final_filename,
                output_type="audio",
                output_url=f"/outputs/audio/{final_filename}",
                file_extension=fmt,
                duration_seconds=duration or None,
                file_size_bytes=os.path.getsize(final_path) if os.path.exists(final_path) else None,
                metadata={"parts_merged": meta["parts_merged"]},
                credit_cost=credit_cost
            )
        except Exception as e:
            logger.error(f"Failed to add history: {e}")

        return JSONResponse({
            "url": f"/outputs/audio/{final_filename}",
            "filename": final_filename,
            "duration": duration,
            "parts_merged": meta["parts_merged"],
            "output_format": fmt.upper()
        })
        
    except Exception as e:
        logger.exception(f"Audio merge failed for {job_id}")
        return JSONResponse(status_code=500, content={"detail": str(e)})
    finally:
        try:
            safe_rmtree(str(job_temp), ignore_errors=True)
        except:
            pass
# ---------------------------------------------------------------------------
# HISTORY ROUTES
# ---------------------------------------------------------------------------

@app.get("/api/history")
def get_history():
    try:
        return JSONResponse(content={"records": history_store.get_all_history()})
    except Exception as e:
        logger.error(f"Error getting history: {e}")
        return JSONResponse(status_code=500, content={"detail": "Failed to load history"})

@app.get("/api/history/stats")
def get_history_stats():
    try:
        return JSONResponse(content=history_store.get_stats())
    except Exception as e:
        logger.error(f"Error getting history stats: {e}")
        return JSONResponse(status_code=500, content={"detail": "Failed to load history stats"})

@app.delete("/api/history/{history_id}")
def delete_history_item(history_id: str):
    try:
        deleted = history_store.delete_history_item(history_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="History item not found")
        return JSONResponse(content={"success": True})
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting history item: {e}")
        return JSONResponse(status_code=500, content={"detail": "Failed to delete history item"})

@app.delete("/api/history")
def clear_all_history():
    try:
        history_store.clear_history()
        return JSONResponse(content={"success": True})
    except Exception as e:
        logger.error(f"Error clearing history: {e}")
        return JSONResponse(status_code=500, content={"detail": "Failed to clear history"})

# ---------------------------------------------------------------------------
# Batch Queue APIs
# ---------------------------------------------------------------------------

@app.post("/api/batch/jobs/image-timeline")
async def api_batch_job_image_timeline(
    # Audio — mode selector + two upload slots
    audio_input_mode: str = Form("single"),
    audio_file:       Optional[UploadFile] = File(None),
    audio_zip:        Optional[UploadFile] = File(None),
    # Required uploads
    images_zip:      UploadFile = File(...),
    timestamp_csv:   UploadFile = File(...),
    # Core video settings
    aspect_ratio:      str   = Form("9:16"),
    export_resolution: str   = Form("1080p"),
    fit_mode:          str   = Form("cover"),
    transition:        str   = Form("fade"),
    transition_duration: float = Form(0.5),
    zoom_effect:       str   = Form("none"),
    render_profile:    str   = Form("balanced"),
    output_name:       Optional[str] = Form(None),
    # Batch 9A — motion & style
    motion_effect:    str = Form("slow_zoom_in"),
    motion_intensity: str = Form("medium"),
    visual_effect:    str = Form("none"),
    effect_strength:  str = Form("medium"),
    style_preset:     str = Form("clean_default"),
    # Batch 16A — Text Overlay
    text_overlay_enabled: str = Form("false"),
    text_overlay_text: str = Form(""),
    text_overlay_font_family: str = Form("Inter"),
    text_overlay_font_size_percent: float = Form(5.0),
    text_overlay_font_weight: str = Form("Medium"),
    text_overlay_color: str = Form("#FFFFFF"),
    text_overlay_opacity: float = Form(100.0),
    text_overlay_x_percent: float = Form(50.0),
    text_overlay_y_percent: float = Form(88.0),
    text_overlay_align: str = Form("center"),
    text_overlay_max_width_percent: float = Form(90.0),
    text_overlay_shadow_enabled: str = Form("true"),
    text_overlay_stroke_enabled: str = Form("false"),
    text_overlay_stroke_color: str = Form("#000000"),
    text_overlay_background_enabled: str = Form("false"),
    text_overlay_background_color: str = Form("#000000"),
    text_overlay_background_opacity: float = Form(50.0),
    text_overlay_mode: str = Form("whole_video"),
    text_overlay_items: str = Form("[]"),
    # Optional intro/outro
    intro_file:    Optional[UploadFile] = File(None),
    outro_file:    Optional[UploadFile] = File(None),
    # Optional background music
    bg_music_file:     Optional[UploadFile] = File(None),
    enable_bg_music:   str   = Form("false"),
    music_volume:      float = Form(0.12),
    music_fade:        str   = Form("true"),
    cjid:              Optional[str] = Form(None),
    # Captions
    caption_source: str = Form("none"),
    caption_config_json: str = Form("{}"),
    caption_preset: str = Form("viral_bold"),
    caption_layout: str = Form("auto"),
    caption_font_scale: float = Form(1.0),
    caption_max_words: int = Form(5),
    caption_max_lines: int = Form(2),
    caption_max_width: int = Form(85),
    caption_vertical_offset: int = Form(0),
    caption_line_spacing: str = Form("normal"),
    caption_style: str = Form(""),
    caption_position: str = Form(""),
    caption_size: str = Form(""),
    caption_appearance: str = Form(""),
    caption_primary_color: str = Form(""),
    caption_highlight_color: str = Form(""),
    srt_file: Optional[UploadFile] = File(None),
    credit_cost:       Optional[float] = Form(None),
    credit_reserved:   Optional[str] = Form(None),
    credit_tool_name:  Optional[str] = Form(None),
    duration_seconds:  Optional[float] = Form(None),
):
    # Create job ID and job dir
    import uuid
    import json
    job_id = f"batch_{uuid.uuid4().hex[:12]}"
    job_dir = batch_queue_store.DATA_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    saved_assets = {}
    
    # Helper to save upload file safely
    async def save_upload(file_obj: Optional[UploadFile], key_name: str):
        if file_obj and file_obj.filename:
            safe_name = "".join(c for c in file_obj.filename if c.isalnum() or c in ".-_")
            path = job_dir / safe_name
            content = await file_obj.read()
            with open(path, "wb") as f:
                f.write(content)
            saved_assets[key_name] = safe_name

    try:
        await save_upload(audio_file, "audio_file")
        await save_upload(audio_zip, "audio_zip")
        await save_upload(images_zip, "images_zip")
        await save_upload(timestamp_csv, "timestamp_csv")
        await save_upload(intro_file, "intro_file")
        await save_upload(outro_file, "outro_file")
        await save_upload(bg_music_file, "bg_music_file")
        await save_upload(srt_file, "srt_file")
        
        config = {
        "caption_source": caption_source,
        "caption_config_json": caption_config_json,
        "caption_preset": caption_preset,
        "caption_layout": caption_layout,
        "caption_font_scale": caption_font_scale,
        "caption_max_words": caption_max_words,
        "caption_max_lines": caption_max_lines,
        "caption_max_width": caption_max_width,
        "caption_vertical_offset": caption_vertical_offset,
        "caption_line_spacing": caption_line_spacing,
                            "caption_layout": caption_layout,
                            "caption_font_scale": caption_font_scale,
                            "caption_max_words": caption_max_words,
                            "caption_max_lines": caption_max_lines,
                            "caption_max_width": caption_max_width,
                            "caption_vertical_offset": caption_vertical_offset,
                            "caption_line_spacing": caption_line_spacing,
        "caption_style": caption_style,
        "caption_position": caption_position,
        "caption_size": caption_size,
        "caption_appearance": caption_appearance,
        "caption_primary_color": caption_primary_color,
        "caption_highlight_color": caption_highlight_color,
        "srt_file": saved_assets.get("srt_file", ""),
            "audio_input_mode": audio_input_mode,
            "aspect_ratio": aspect_ratio,
            "export_resolution": export_resolution,
            "fit_mode": fit_mode,
            "transition": transition,
            "transition_duration": float(transition_duration),
            "zoom_effect": zoom_effect,
            "render_profile": render_profile,
            "output_name": output_name,
            "motion_effect": motion_effect,
            "motion_intensity": motion_intensity,
            "visual_effect": visual_effect,
            "effect_strength": effect_strength,
            "style_preset": style_preset,
            "enable_bg_music": enable_bg_music == "true",
            "music_volume": music_volume,
            "music_fade": music_fade == "true",
            "text_overlay_enabled": str(text_overlay_enabled).strip().lower() == "true",
            "text_overlay_text": text_overlay_text,
            "text_overlay_font_family": text_overlay_font_family,
            "text_overlay_font_size_percent": float(text_overlay_font_size_percent),
            "text_overlay_font_weight": text_overlay_font_weight,
            "text_overlay_color": text_overlay_color,
            "text_overlay_opacity": float(text_overlay_opacity),
            "text_overlay_x_percent": float(text_overlay_x_percent),
            "text_overlay_y_percent": float(text_overlay_y_percent),
            "text_overlay_align": text_overlay_align,
            "text_overlay_max_width_percent": float(text_overlay_max_width_percent),
            "text_overlay_shadow_enabled": str(text_overlay_shadow_enabled).strip().lower() == "true",
            "text_overlay_stroke_enabled": str(text_overlay_stroke_enabled).strip().lower() == "true",
            "text_overlay_stroke_color": text_overlay_stroke_color,
            "text_overlay_background_enabled": str(text_overlay_background_enabled).strip().lower() == "true",
            "text_overlay_background_color": text_overlay_background_color,
            "text_overlay_background_opacity": float(text_overlay_background_opacity),
            "text_overlay_mode": text_overlay_mode,
            "text_overlay_items": text_overlay_items,
            "cjid": cjid,
            "credit_cost": credit_cost,
            "credit_reserved": str(credit_reserved).strip().lower() == "true" if credit_reserved is not None else False,
            "credit_tool_name": credit_tool_name,
            "duration_seconds": duration_seconds,
        }
        
        # Save config.json
        with open(job_dir / "config.json", "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
            
        clean_out_name = make_clean_filename(output_name, "batch_image_timeline", ".mp4")
        
        # Add to queue
        job = batch_queue_store.add_job(
            source_tool="image_timeline",
            source_tool_label="Image Timeline",
            title=f"Image Timeline: {clean_out_name}",
            output_name=clean_out_name,
            output_type="video",
            export_preset=style_preset,
            aspect_ratio=aspect_ratio,
            resolution=export_resolution,
            render_profile=render_profile,
            config=config,
            assets=saved_assets
        )
        
        # update ID to match our physical folder id so we can find it later easily
        job = batch_queue_store.update_job(job["id"], {"id": job_id})
        
        return JSONResponse(content={"job": job})
        
    except Exception as e:
        logger.error(f"Error saving batch job: {e}")
        import shutil
        safe_rmtree(job_dir, ignore_errors=True)
        return JSONResponse(status_code=500, content={"detail": str(e)})


@app.post("/api/batch/jobs/video-timeline")
async def api_batch_job_video_timeline(
    audio_input_mode: str = Form("single"),
    audio_file:       Optional[UploadFile] = File(None),
    audio_zip:        Optional[UploadFile] = File(None),
    videos_zip:      UploadFile = File(...),
    timeline_csv:    UploadFile = File(...),
    aspect_ratio:      str   = Form("9:16"),
    export_resolution: str   = Form("1080p"),
    fit_mode:          str   = Form("cover"),
    fill_mode:         str   = Form("loop"),
    render_profile:    str   = Form("balanced"),
    output_name:       Optional[str] = Form(None),
    transition:          str   = Form("none"),
    transition_duration: float = Form(0.5),
    visual_effect:       str   = Form("none"),
    effect_strength:     str   = Form("medium"),
    motion_style:        str   = Form("none"),
    motion_intensity:    str   = Form("medium"),
    background_music_file:   Optional[UploadFile] = File(None),
    background_music_volume: float = Form(15.0),
    background_music_loop:   bool  = Form(True),
    background_music_fade:   bool  = Form(True),
    # Batch 16A — Text Overlay
    text_overlay_enabled: str = Form("false"),
    text_overlay_text: str = Form(""),
    text_overlay_font_family: str = Form("Inter"),
    text_overlay_font_size_percent: float = Form(5.0),
    text_overlay_font_weight: str = Form("Bold"),
    text_overlay_color: str = Form("#FFFFFF"),
    text_overlay_opacity: float = Form(100.0),
    text_overlay_x_percent: float = Form(50.0),
    text_overlay_y_percent: float = Form(90.0),
    text_overlay_align: str = Form("center"),
    text_overlay_max_width_percent: float = Form(80.0),
    text_overlay_shadow_enabled: str = Form("true"),
    text_overlay_stroke_enabled: str = Form("true"),
    text_overlay_stroke_color: str = Form("#000000"),
    text_overlay_background_enabled: str = Form("false"),
    text_overlay_background_color: str = Form("#000000"),
    text_overlay_background_opacity: float = Form(50.0),
    text_overlay_mode: str = Form("whole_video"),
    text_overlay_items: str = Form("[]"),
    intro_file:    Optional[UploadFile] = File(None),
    outro_file:    Optional[UploadFile] = File(None),
    cjid:              Optional[str] = Form(None),
    # Captions
    caption_source: str = Form("none"),
    caption_config_json: str = Form("{}"),
    caption_preset: str = Form("viral_bold"),
    caption_layout: str = Form("auto"),
    caption_font_scale: float = Form(1.0),
    caption_max_words: int = Form(5),
    caption_max_lines: int = Form(2),
    caption_max_width: int = Form(85),
    caption_vertical_offset: int = Form(0),
    caption_line_spacing: str = Form("normal"),
    caption_style: str = Form(""),
    caption_position: str = Form(""),
    caption_size: str = Form(""),
    caption_appearance: str = Form(""),
    caption_primary_color: str = Form(""),
    caption_highlight_color: str = Form(""),
    srt_file: Optional[UploadFile] = File(None),
    credit_cost:       Optional[float] = Form(None),
    credit_reserved:   Optional[str] = Form(None),
    credit_tool_name:  Optional[str] = Form(None),
    duration_seconds:  Optional[float] = Form(None),
):
    import uuid
    import json
    job_id = f"batch_{uuid.uuid4().hex[:12]}"
    job_dir = batch_queue_store.DATA_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    saved_assets = {}
    
    async def save_upload(file_obj: Optional[UploadFile], key_name: str):
        if file_obj and file_obj.filename:
            safe_name = "".join(c for c in file_obj.filename if c.isalnum() or c in ".-_")
            path = job_dir / safe_name
            content = await file_obj.read()
            with open(path, "wb") as f:
                f.write(content)
            saved_assets[key_name] = safe_name

    try:
        await save_upload(audio_file, "audio_file")
        await save_upload(audio_zip, "audio_zip")
        await save_upload(videos_zip, "videos_zip")
        await save_upload(timeline_csv, "timestamp_csv")
        await save_upload(intro_file, "intro_file")
        await save_upload(outro_file, "outro_file")
        await save_upload(background_music_file, "background_music_file")
        await save_upload(srt_file, "srt_file")
        

        config = {
        "caption_source": caption_source,
        "caption_config_json": caption_config_json,
        "caption_preset": caption_preset,
        "caption_layout": caption_layout,
        "caption_font_scale": caption_font_scale,
        "caption_max_words": caption_max_words,
        "caption_max_lines": caption_max_lines,
        "caption_max_width": caption_max_width,
        "caption_vertical_offset": caption_vertical_offset,
        "caption_line_spacing": caption_line_spacing,
                            "caption_layout": caption_layout,
                            "caption_font_scale": caption_font_scale,
                            "caption_max_words": caption_max_words,
                            "caption_max_lines": caption_max_lines,
                            "caption_max_width": caption_max_width,
                            "caption_vertical_offset": caption_vertical_offset,
                            "caption_line_spacing": caption_line_spacing,
        "caption_style": caption_style,
        "caption_position": caption_position,
        "caption_size": caption_size,
        "caption_appearance": caption_appearance,
        "caption_primary_color": caption_primary_color,
        "caption_highlight_color": caption_highlight_color,
        "srt_file": saved_assets.get("srt_file", ""),
            "audio_input_mode": audio_input_mode,
            "aspect_ratio": aspect_ratio,
            "export_resolution": export_resolution,
            "fit_mode": fit_mode,
            "fill_mode": fill_mode,
            "render_profile": render_profile,
            "output_name": output_name,
            "transition": transition,
            "transition_duration": float(transition_duration),
            "visual_effect": visual_effect,
            "effect_strength": effect_strength,
            "motion_style": motion_style,
            "motion_intensity": motion_intensity,
            "background_music_volume": background_music_volume,
            "background_music_loop": background_music_loop,
            "background_music_fade": background_music_fade,
            "text_overlay_enabled": str(text_overlay_enabled).strip().lower() == "true",
            "text_overlay_text": text_overlay_text,
            "text_overlay_font_family": text_overlay_font_family,
            "text_overlay_font_size_percent": float(text_overlay_font_size_percent),
            "text_overlay_font_weight": text_overlay_font_weight,
            "text_overlay_color": text_overlay_color,
            "text_overlay_opacity": float(text_overlay_opacity),
            "text_overlay_x_percent": float(text_overlay_x_percent),
            "text_overlay_y_percent": float(text_overlay_y_percent),
            "text_overlay_align": text_overlay_align,
            "text_overlay_max_width_percent": float(text_overlay_max_width_percent),
            "text_overlay_shadow_enabled": str(text_overlay_shadow_enabled).strip().lower() == "true",
            "text_overlay_stroke_enabled": str(text_overlay_stroke_enabled).strip().lower() == "true",
            "text_overlay_stroke_color": text_overlay_stroke_color,
            "text_overlay_background_enabled": str(text_overlay_background_enabled).strip().lower() == "true",
            "text_overlay_background_color": text_overlay_background_color,
            "text_overlay_background_opacity": float(text_overlay_background_opacity),
            "text_overlay_mode": text_overlay_mode,
            "text_overlay_items": text_overlay_items,
            "cjid": cjid,
            "credit_cost": credit_cost,
            "credit_reserved": str(credit_reserved).strip().lower() == "true" if credit_reserved is not None else False,
            "credit_tool_name": credit_tool_name,
            "duration_seconds": duration_seconds,
        }

        with open(job_dir / "config.json", "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
            
        clean_out_name = make_clean_filename(output_name, "batch_video_timeline", ".mp4")
        
        job = batch_queue_store.add_job(
            source_tool="video_timeline",
            source_tool_label="Video Timeline",
            title=f"Video Timeline: {clean_out_name}",
            output_name=clean_out_name,
            output_type="video",
            export_preset=visual_effect,
            aspect_ratio=aspect_ratio,
            resolution=export_resolution,
            render_profile=render_profile,
            config=config,
            assets=saved_assets
        )
        
        job = batch_queue_store.update_job(job["id"], {"id": job_id})
        
        return JSONResponse(content={"job": job})
        
    except Exception as e:
        logger.error(f"Error saving batch job: {e}")
        import shutil
        safe_rmtree(job_dir, ignore_errors=True)
        return JSONResponse(status_code=500, content={"detail": str(e)})


@app.post("/api/batch/jobs/media-timeline")
async def api_batch_job_media_timeline(
    audio_input_mode: str = Form("single"),
    audio_file:       Optional[UploadFile] = File(None),
    audio_zip:        Optional[UploadFile] = File(None),
    media_zip:      UploadFile = File(...),
    timeline_csv:    UploadFile = File(...),
    aspect_ratio:      str   = Form("9:16"),
    export_resolution: str   = Form("1080p"),
    fit_mode:          str   = Form("cover"),
    fill_mode:         str   = Form("loop"),
    render_profile:    str   = Form("balanced"),
    output_name:       Optional[str] = Form(None),
    # Batch 16A — Text Overlay
    text_overlay_enabled: str = Form("false"),
    text_overlay_text: str = Form(""),
    text_overlay_font_family: str = Form("Inter"),
    text_overlay_font_size_percent: float = Form(5.0),
    text_overlay_font_weight: str = Form("Medium"),
    text_overlay_color: str = Form("#FFFFFF"),
    text_overlay_opacity: float = Form(100.0),
    text_overlay_x_percent: float = Form(50.0),
    text_overlay_y_percent: float = Form(88.0),
    text_overlay_align: str = Form("center"),
    text_overlay_max_width_percent: float = Form(90.0),
    text_overlay_shadow_enabled: str = Form("true"),
    text_overlay_stroke_enabled: str = Form("false"),
    text_overlay_stroke_color: str = Form("#000000"),
    text_overlay_background_enabled: str = Form("false"),
    text_overlay_background_color: str = Form("#000000"),
    text_overlay_background_opacity: float = Form(50.0),
    text_overlay_mode: str = Form("whole_video"),
    text_overlay_items: str = Form("[]"),
    transition:          str   = Form("none"),
    transition_duration: float = Form(0.5),
    visual_effect:       str   = Form("none"),
    effect_strength:     str   = Form("medium"),
    motion_style:        str   = Form("none"),
    motion_intensity:    str   = Form("medium"),
    background_music_file:   Optional[UploadFile] = File(None),
    background_music_volume: float = Form(15.0),
    background_music_loop:   bool  = Form(True),
    background_music_fade:   bool  = Form(True),
    intro_file:    Optional[UploadFile] = File(None),
    outro_file:    Optional[UploadFile] = File(None),
    cjid:              Optional[str] = Form(None),
    # Captions
    caption_source: str = Form("none"),
    caption_config_json: str = Form("{}"),
    caption_preset: str = Form("viral_bold"),
    caption_layout: str = Form("auto"),
    caption_font_scale: float = Form(1.0),
    caption_max_words: int = Form(5),
    caption_max_lines: int = Form(2),
    caption_max_width: int = Form(85),
    caption_vertical_offset: int = Form(0),
    caption_line_spacing: str = Form("normal"),
    caption_style: str = Form(""),
    caption_position: str = Form(""),
    caption_size: str = Form(""),
    caption_appearance: str = Form(""),
    caption_primary_color: str = Form(""),
    caption_highlight_color: str = Form(""),
    srt_file: Optional[UploadFile] = File(None),
    credit_cost:       Optional[float] = Form(None),
    credit_reserved:   Optional[str] = Form(None),
    credit_tool_name:  Optional[str] = Form(None),
    duration_seconds:  Optional[float] = Form(None),
):
    import uuid
    import json
    job_id = f"batch_{uuid.uuid4().hex[:12]}"
    job_dir = batch_queue_store.DATA_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    saved_assets = {}
    
    async def save_upload(file_obj: Optional[UploadFile], key_name: str):
        if file_obj and file_obj.filename:
            safe_name = "".join(c for c in file_obj.filename if c.isalnum() or c in ".-_")
            path = job_dir / safe_name
            content = await file_obj.read()
            with open(path, "wb") as f:
                f.write(content)
            saved_assets[key_name] = safe_name

    try:
        await save_upload(audio_file, "audio_file")
        await save_upload(audio_zip, "audio_zip")
        await save_upload(media_zip, "media_zip")
        await save_upload(timeline_csv, "timestamp_csv")
        await save_upload(intro_file, "intro_file")
        await save_upload(outro_file, "outro_file")
        await save_upload(background_music_file, "background_music_file")
        await save_upload(srt_file, "srt_file")
        
        config = {
        "caption_source": caption_source,
        "caption_config_json": caption_config_json,
        "caption_preset": caption_preset,
        "caption_layout": caption_layout,
        "caption_font_scale": caption_font_scale,
        "caption_max_words": caption_max_words,
        "caption_max_lines": caption_max_lines,
        "caption_max_width": caption_max_width,
        "caption_vertical_offset": caption_vertical_offset,
        "caption_line_spacing": caption_line_spacing,
                            "caption_layout": caption_layout,
                            "caption_font_scale": caption_font_scale,
                            "caption_max_words": caption_max_words,
                            "caption_max_lines": caption_max_lines,
                            "caption_max_width": caption_max_width,
                            "caption_vertical_offset": caption_vertical_offset,
                            "caption_line_spacing": caption_line_spacing,
        "caption_style": caption_style,
        "caption_position": caption_position,
        "caption_size": caption_size,
        "caption_appearance": caption_appearance,
        "caption_primary_color": caption_primary_color,
        "caption_highlight_color": caption_highlight_color,
        "srt_file": saved_assets.get("srt_file", ""),
            "audio_input_mode": audio_input_mode,
            "aspect_ratio": aspect_ratio,
            "export_resolution": export_resolution,
            "fit_mode": fit_mode,
            "fill_mode": fill_mode,
            "render_profile": render_profile,
            "output_name": output_name,
            "transition": transition,
            "transition_duration": float(transition_duration),
            "visual_effect": visual_effect,
            "effect_strength": effect_strength,
            "motion_style": motion_style,
            "motion_intensity": motion_intensity,
            "background_music_volume": background_music_volume,
            "background_music_loop": background_music_loop,
            "background_music_fade": background_music_fade,
            "text_overlay_enabled": str(text_overlay_enabled).strip().lower() == "true",
            "text_overlay_text": text_overlay_text,
            "text_overlay_font_family": text_overlay_font_family,
            "text_overlay_font_size_percent": float(text_overlay_font_size_percent),
            "text_overlay_font_weight": text_overlay_font_weight,
            "text_overlay_color": text_overlay_color,
            "text_overlay_opacity": float(text_overlay_opacity),
            "text_overlay_x_percent": float(text_overlay_x_percent),
            "text_overlay_y_percent": float(text_overlay_y_percent),
            "text_overlay_align": text_overlay_align,
            "text_overlay_max_width_percent": float(text_overlay_max_width_percent),
            "text_overlay_shadow_enabled": str(text_overlay_shadow_enabled).strip().lower() == "true",
            "text_overlay_stroke_enabled": str(text_overlay_stroke_enabled).strip().lower() == "true",
            "text_overlay_stroke_color": text_overlay_stroke_color,
            "text_overlay_background_enabled": str(text_overlay_background_enabled).strip().lower() == "true",
            "text_overlay_background_color": text_overlay_background_color,
            "text_overlay_background_opacity": float(text_overlay_background_opacity),
            "text_overlay_mode": text_overlay_mode,
            "text_overlay_items": text_overlay_items,
            "cjid": cjid,
            "credit_cost": credit_cost,
            "credit_reserved": str(credit_reserved).strip().lower() == "true" if credit_reserved is not None else False,
            "credit_tool_name": credit_tool_name,
            "duration_seconds": duration_seconds,
        }

        with open(job_dir / "config.json", "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
            
        clean_out_name = make_clean_filename(output_name, "batch_media_timeline", ".mp4")
        
        job = batch_queue_store.add_job(
            source_tool="media_timeline",
            source_tool_label="Media Timeline",
            title=f"Media Timeline: {clean_out_name}",
            output_name=clean_out_name,
            output_type="video",
            export_preset=visual_effect,
            aspect_ratio=aspect_ratio,
            resolution=export_resolution,
            render_profile=render_profile,
            config=config,
            assets=saved_assets
        )
        
        job = batch_queue_store.update_job(job["id"], {"id": job_id})
        
        return JSONResponse(content={"job": job})
        
    except Exception as e:
        logger.error(f"Error saving batch job: {e}")
        import shutil
        safe_rmtree(job_dir, ignore_errors=True)
        return JSONResponse(status_code=500, content={"detail": str(e)})


@app.get("/api/batch/jobs")
def api_get_batch_jobs():
    try:
        jobs = batch_queue_store.get_all_jobs()
        return JSONResponse(content={"jobs": jobs})
    except Exception as e:
        logger.error(f"Error getting batch jobs: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})

@app.get("/api/batch/stats")
def api_get_batch_stats():
    try:
        stats = batch_queue_store.get_stats()
        return JSONResponse(content={"stats": stats})
    except Exception as e:
        logger.error(f"Error getting batch stats: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})

class CreateBatchJobReq(BaseModel):
    source_tool: str
    source_tool_label: str
    title: str
    output_name: str
    export_preset: str = ""
    aspect_ratio: str = ""
    resolution: str = ""
    render_profile: str = ""
    config: dict = {}
    metadata: dict = {}

@app.post("/api/batch/jobs")
def api_create_batch_job(req: CreateBatchJobReq):
    try:
        job = batch_queue_store.add_job(
            source_tool=req.source_tool,
            source_tool_label=req.source_tool_label,
            title=req.title,
            output_name=req.output_name,
            export_preset=req.export_preset,
            aspect_ratio=req.aspect_ratio,
            resolution=req.resolution,
            render_profile=req.render_profile,
            config=req.config,
            metadata=req.metadata
        )
        return JSONResponse(content={"job": job})
    except Exception as e:
        logger.error(f"Error creating batch job: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})

@app.get("/api/batch/jobs/{job_id}")
def api_get_batch_job(job_id: str):
    job = batch_queue_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse(content={"job": job})

class UpdateBatchJobReq(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    message: Optional[str] = None
    progress: Optional[int] = None
    metadata: Optional[dict] = None

@app.patch("/api/batch/jobs/{job_id}")
def api_update_batch_job(job_id: str, req: UpdateBatchJobReq):
    updates = {}
    if req.title is not None: updates["title"] = req.title
    if req.status is not None: updates["status"] = req.status
    if req.message is not None: updates["message"] = req.message
    if req.progress is not None: updates["progress"] = req.progress
    if req.metadata is not None: updates["metadata"] = req.metadata
    
    job = batch_queue_store.update_job(job_id, updates)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse(content={"job": job})

@app.delete("/api/batch/jobs/completed")
def api_clear_completed_batch_jobs():
    cleared = batch_queue_store.clear_completed_jobs()
    return JSONResponse(content={"cleared": cleared})

@app.delete("/api/batch/jobs/failed")
def api_clear_failed_batch_jobs():
    cleared = batch_queue_store.clear_failed_jobs()
    return JSONResponse(content={"cleared": cleared})

@app.delete("/api/batch/jobs/cancelled")
def api_clear_cancelled_batch_jobs():
    cleared = batch_queue_store.clear_cancelled_jobs()
    return JSONResponse(content={"cleared": cleared})

@app.delete("/api/batch/jobs")
def api_clear_all_batch_jobs():
    cleared = batch_queue_store.clear_all_jobs()
    return JSONResponse(content={"cleared": cleared})

@app.delete("/api/batch/jobs/{job_id}")
def api_delete_batch_job(job_id: str):
    success = batch_queue_store.delete_job(job_id)
    if not success:
        raise HTTPException(status_code=404, detail="Job not found")
    return JSONResponse(content={"success": True})

@app.post("/api/batch/jobs/{job_id}/move-up")
def api_move_job_up(job_id: str):
    success = batch_queue_store.move_job_up(job_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot move job up")
    return JSONResponse(content={"success": True})

@app.post("/api/batch/jobs/{job_id}/move-down")
def api_move_job_down(job_id: str):
    success = batch_queue_store.move_job_down(job_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot move job down")
    return JSONResponse(content={"success": True})

@app.post("/api/batch/jobs/{job_id}/duplicate")
def api_duplicate_batch_job(job_id: str):
    new_job = batch_queue_store.duplicate_job(job_id)
    if not new_job:
        raise HTTPException(status_code=404, detail="Job not found or could not be duplicated")
    return JSONResponse(content={"job": new_job})

# ── Batch Queue Control Endpoints ─────────────────────────────────────────────

@app.get("/api/batch/state")
def api_get_batch_state():
    state = batch_queue_runner.get_state()
    return JSONResponse(content=state)

@app.post("/api/batch/start")
def api_start_batch_queue():
    # ── Placeholder Backend Access Control ────────────────────────
    # In the future, parse authorization JWT here to get user_id & plan.
    access = check_access(
        user_id="placeholder_user",
        plan_id="pro", # Mocking as pro
        tool="batch_video",
        options={"is_batch": True}
    )
    if not access["allowed"]:
        raise HTTPException(403, access["reason"])

    lock_status = get_render_lock_status()
    if lock_status["locked"] and lock_status["source"] == "direct":
        raise HTTPException(409, "A video is currently generating in the Studio. Please wait for it to finish before starting a batch.")

    res = batch_queue_runner.start_runner()
    return JSONResponse(content=res)

@app.post("/api/batch/pause-after-current")
def api_pause_batch_queue():
    res = batch_queue_runner.pause_after_current()
    return JSONResponse(content=res)

@app.post("/api/batch/stop")
def api_stop_batch_queue():
    res = batch_queue_runner.stop_runner()
    return JSONResponse(content=res)

@app.post("/api/batch/retry-failed")
def api_retry_failed_batch_jobs():
    count = batch_queue_store.retry_failed_jobs()
    return JSONResponse(content={"retried_count": count})

@app.post("/api/batch/jobs/{job_id}/retry")
def api_retry_single_batch_job(job_id: str):
    success = batch_queue_store.retry_job(job_id)
    if not success:
        raise HTTPException(status_code=400, detail="Only failed or cancelled jobs can be retried.")
    return JSONResponse(content={"success": True})





@app.get("/outputs/{path:path}")
async def serve_output(path: str):
    import mimetypes
    file_path = OUTPUTS_DIR / path
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
        
    mime_type, _ = mimetypes.guess_type(str(file_path))
    if not mime_type:
        if path.endswith(".mp4"):
            mime_type = "video/mp4"
        elif path.endswith(".mp3"):
            mime_type = "audio/mpeg"
        elif path.endswith(".csv"):
            mime_type = "text/csv"
        elif path.endswith(".txt") or path.endswith(".srt"):
            mime_type = "text/plain"
        else:
            mime_type = "audio/wav"
        
    return FileResponse(str(file_path), media_type=mime_type)
