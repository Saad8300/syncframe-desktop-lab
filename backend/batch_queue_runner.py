"""
batch_queue_runner.py
Background thread responsible for running batch jobs from the queue safely.
"""

import threading
import time
import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import Optional, Dict, Any

import batch_queue_store
import history_store
from utils import make_clean_filename
from video_generator import generate_video, GenerationCancelled
from video_timeline_generator import generate_video_timeline, VideoTimelineCancelled
from media_timeline_generator import generate_media_timeline, MediaTimelineCancelled
from audio_helpers import prepare_single_audio, prepare_zip_audio

logger = logging.getLogger(__name__)

# Base directories (same as main.py)
BASE_DIR = Path(__file__).resolve().parent
TEMP_DIR = BASE_DIR / "temp"
OUTPUTS_DIR = BASE_DIR / "outputs"

class BatchQueueRunnerState:
    def __init__(self):
        self.is_running = False
        self.current_job_id: Optional[str] = None
        self.started_at: Optional[str] = None
        self.paused_after_current = False
        self.stopping = False
        self.message = "Idle"
        self._thread: Optional[threading.Thread] = None
        # Cancel event for the current job if it supports it
        self.current_cancel_event = threading.Event()
        self.lock = threading.Lock()

runner_state = BatchQueueRunnerState()

def _runner_loop():
    logger.info("Batch queue runner started.")
    try:
        while True:
            with runner_state.lock:
                if runner_state.stopping:
                    runner_state.is_running = False
                    runner_state.message = "Stopped"
                    break
                
                if runner_state.paused_after_current and runner_state.current_job_id is None:
                    runner_state.is_running = False
                    runner_state.message = "Paused"
                    runner_state.paused_after_current = False
                    break

            # Find next queued job
            jobs = batch_queue_store.get_all_jobs()
            queued_jobs = [j for j in jobs if j.get("status") == "queued"]
            
            if not queued_jobs:
                with runner_state.lock:
                    runner_state.is_running = False
                    runner_state.message = "Queue finished"
                    runner_state.current_job_id = None
                break
                
            job = queued_jobs[0]
            job_id = job["id"]
            
            with runner_state.lock:
                runner_state.current_job_id = job_id
                runner_state.message = f"Running job: {job_id}"
                runner_state.current_cancel_event.clear()
            
            # Run the job
            try:
                _process_job(job)
            except Exception as e:
                logger.error(f"Job {job_id} crashed: {e}")
                batch_queue_store.update_job(job_id, {"status": "failed", "message": f"Runner error: {str(e)}"})
            finally:
                with runner_state.lock:
                    runner_state.current_job_id = None
                    
            # Check if we should stop/pause is handled at loop start
            time.sleep(1) # tiny breathing room between jobs

    except Exception as e:
        logger.error(f"Queue runner loop crashed: {e}")
        with runner_state.lock:
            runner_state.is_running = False
            runner_state.message = f"Crashed: {e}"
            runner_state.current_job_id = None

def _process_job(job: Dict[str, Any]):
    job_id = job["id"]
    source_tool = job.get("source_tool")
    
    logger.info(f"Processing batch job {job_id} via {source_tool}")
    batch_queue_store.update_job(job_id, {"status": "running", "progress": 0, "message": "Starting rendering"})
    
    if source_tool not in ("image_timeline", "video_timeline", "media_timeline"):
        batch_queue_store.update_job(job_id, {"status": "failed", "message": f"Batch rendering for '{source_tool}' is not supported yet."})
        return
        
    job_dir = batch_queue_store.DATA_DIR / job_id
    if not job_dir.exists():
        batch_queue_store.update_job(job_id, {"status": "failed", "message": "Job directory missing."})
        return
        
    config = job.get("config", {})
    assets = job.get("assets", {})
    
    # Extract asset paths
    audio_file_name = assets.get("audio_file")
    audio_zip_name = assets.get("audio_zip")
    images_zip_name = assets.get("images_zip")
    videos_zip_name = assets.get("videos_zip")
    media_zip_name = assets.get("media_zip")
    timestamp_csv_name = assets.get("timestamp_csv")
    intro_file_name = assets.get("intro_file")
    outro_file_name = assets.get("outro_file")
    bg_music_file_name = assets.get("bg_music_file")
    
    if not timestamp_csv_name:
        batch_queue_store.update_job(job_id, {"status": "failed", "message": "Missing required timestamp CSV in job."})
        return
        
    # Set up temp dir for this run
    run_temp = TEMP_DIR / f"run_{job_id}_{uuid.uuid4().hex[:6]}"
    run_temp.mkdir(parents=True, exist_ok=True)
    
    try:
        def update_progress(prog: int, msg: str):
            # Only update DB occasionally or it spams write operations
            # Real-time can be expensive on JSON files, but we'll just write it
            batch_queue_store.update_job(job_id, {"progress": prog, "message": msg})
            
        # Audio preparation
        audio_input_mode = config.get("audio_input_mode", "single")
        try:
            if audio_input_mode == "single" and audio_file_name:
                audio_path_src = job_dir / audio_file_name
                with open(audio_path_src, "rb") as f:
                    audio_path, _ = prepare_single_audio(f.read(), audio_file_name, run_temp)
            elif audio_input_mode == "zip" and audio_zip_name:
                audio_path_src = job_dir / audio_zip_name
                with open(audio_path_src, "rb") as f:
                    audio_path, _ = prepare_zip_audio(f.read(), run_temp)
            else:
                batch_queue_store.update_job(job_id, {"status": "failed", "message": "Missing audio input."})
                return
        except Exception as e:
            batch_queue_store.update_job(job_id, {"status": "failed", "message": f"Audio processing failed: {str(e)}"})
            return
            
        if source_tool == "image_timeline":
            zip_path = str(job_dir / images_zip_name) if images_zip_name else None
        elif source_tool == "video_timeline":
            zip_path = str(job_dir / videos_zip_name) if videos_zip_name else None
        else:
            zip_path = str(job_dir / media_zip_name) if media_zip_name else None
            
        csv_path = str(job_dir / timestamp_csv_name)
        
        intro_path = str(job_dir / intro_file_name) if intro_file_name else None
        outro_path = str(job_dir / outro_file_name) if outro_file_name else None
        bg_music_path = str(job_dir / bg_music_file_name) if bg_music_file_name else None
        
        output_filename = make_clean_filename(job.get("output_name", "batch_output.mp4"), "video", ".mp4")
        
        # Ensure outputs exists
        OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
        output_path = str(OUTPUTS_DIR / output_filename)
        
        
        # Batch 16D Text Overlay Config
        import json
        parsed_items = []
        try:
            parsed_items = json.loads(config.get("text_overlay_items", "[]"))
        except:
            pass
            
        text_overlay_config = {
            "enabled": config.get("text_overlay_enabled", False),
            "mode": config.get("text_overlay_mode", "whole_video"),
            "items": parsed_items,
            "text": config.get("text_overlay_text", ""),
            "font_family": config.get("text_overlay_font_family", "Inter"),
            "font_size_percent": float(config.get("text_overlay_font_size_percent", 5.0)),
            "font_weight": config.get("text_overlay_font_weight", "Bold"),
            "color": config.get("text_overlay_color", "#FFFFFF"),
            "opacity": float(config.get("text_overlay_opacity", 100.0)),
            "x_percent": float(config.get("text_overlay_x_percent", 50.0)),
            "y_percent": float(config.get("text_overlay_y_percent", 88.0)),
            "align": config.get("text_overlay_align", "center"),
            "max_width_percent": float(config.get("text_overlay_max_width_percent", 90.0)),
            "shadow_enabled": str(config.get("text_overlay_shadow_enabled", "true")).lower() == "true",
            "stroke_enabled": str(config.get("text_overlay_stroke_enabled", "false")).lower() == "true",
            "stroke_color": config.get("text_overlay_stroke_color", "#000000"),
            "background_enabled": str(config.get("text_overlay_background_enabled", "false")).lower() == "true",
            "background_color": config.get("text_overlay_background_color", "#000000"),
            "background_opacity": float(config.get("text_overlay_background_opacity", 50.0))
        }
        
        start_time = time.time()
        
        if source_tool == "image_timeline":
            res = generate_video(
                audio_path=audio_path,
                zip_path=zip_path,
                csv_path=csv_path,
                output_path=output_path,
                temp_dir=str(run_temp),
                aspect_ratio=config.get("aspect_ratio", "9:16"),
                export_resolution=config.get("export_resolution", "1080p"),
                fit_mode=config.get("fit_mode", "cover"),
                transition=config.get("transition", "fade"),
                transition_duration=float(config.get("transition_duration", 0.5)),
                zoom_effect=config.get("zoom_effect", "none"),
                render_profile=config.get("render_profile", "balanced"),
                motion_effect=config.get("motion_effect", "slow_zoom_in"),
                motion_intensity=config.get("motion_intensity", "medium"),
                visual_effect=config.get("visual_effect", "none"),
                effect_strength=config.get("effect_strength", "medium"),
                style_preset=config.get("style_preset", "clean_default"),
                intro_path=intro_path,
                outro_path=outro_path,
                bg_music_path=bg_music_path,
                enable_bg_music=config.get("enable_bg_music", False),
                music_volume=float(config.get("music_volume", 0.12)),
                music_fade=config.get("music_fade", True),
                cancel_event=runner_state.current_cancel_event,
                progress_callback=update_progress,
                text_overlay_config=text_overlay_config
            )
        elif source_tool == "video_timeline":
            res = generate_video_timeline(
                audio_path=audio_path,
                zip_path=zip_path,
                csv_path=csv_path,
                output_path=output_path,
                temp_dir=str(run_temp),
                aspect_ratio=config.get("aspect_ratio", "9:16"),
                export_resolution=config.get("export_resolution", "1080p"),
                fit_mode=config.get("fit_mode", "cover"),
                fill_mode=config.get("fill_mode", "loop"),
                render_profile=config.get("render_profile", "balanced"),
                transition=config.get("transition", "none"),
                transition_duration=float(config.get("transition_duration", 0.5)),
                visual_effect=config.get("visual_effect", "none"),
                effect_strength=config.get("effect_strength", "medium"),
                motion_style=config.get("motion_style", "none"),
                motion_intensity=config.get("motion_intensity", "medium"),
                background_music_path=bg_music_path,
                background_music_volume=float(config.get("background_music_volume", 15.0)),
                background_music_loop=config.get("background_music_loop", True),
                background_music_fade=config.get("background_music_fade", True),
                intro_path=intro_path,
                outro_path=outro_path,
                cancel_event=runner_state.current_cancel_event,
                progress_callback=update_progress,
                text_overlay_config=text_overlay_config
            )
        else: # media_timeline
            res = generate_media_timeline(
                audio_path=audio_path,
                zip_path=zip_path,
                csv_path=csv_path,
                output_path=output_path,
                temp_dir=str(run_temp),
                aspect_ratio=config.get("aspect_ratio", "9:16"),
                export_resolution=config.get("export_resolution", "1080p"),
                fit_mode=config.get("fit_mode", "cover"),
                fill_mode=config.get("fill_mode", "loop"),
                render_profile=config.get("render_profile", "balanced"),
                transition=config.get("transition", "none"),
                transition_duration=float(config.get("transition_duration", 0.5)),
                visual_effect=config.get("visual_effect", "none"),
                effect_strength=config.get("effect_strength", "medium"),
                motion_style=config.get("motion_style", "none"),
                motion_intensity=config.get("motion_intensity", "medium"),
                text_position=config.get("text_position", "bottom_center"),
                text_size=config.get("text_size", "medium"),
                text_color=config.get("text_color", "white"),
                text_background=config.get("text_background", "soft_shadow"),
                text_width=config.get("text_width", "wide"),
                text_alignment=config.get("text_alignment", "center"),
                background_music_path=bg_music_path,
                background_music_volume=float(config.get("background_music_volume", 15.0)),
                background_music_loop=config.get("background_music_loop", True),
                background_music_fade=config.get("background_music_fade", True),
                intro_path=intro_path,
                outro_path=outro_path,
                cancel_event=runner_state.current_cancel_event,
                progress_callback=update_progress,
                text_overlay_config=text_overlay_config
            )
        
        elapsed = time.time() - start_time
        
        if res.get("cancelled"):
            batch_queue_store.update_job(job_id, {"status": "cancelled", "message": "Cancelled by user."})
            return
            
        if not res.get("success"):
            err_msg = res.get("errors", ["Unknown error"])[0]
            batch_queue_store.update_job(job_id, {"status": "failed", "message": f"Failed: {err_msg}"})
            return
            
        file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0
            
        # Success! Save to history
        try:
            history_store.add_history(
                tool="batch_video_generator",
                tool_label="Batch Video Generator",
                output_name=output_filename,
                output_type="video",
                output_url=f"/outputs/{output_filename}",
                file_extension="mp4",
                duration_seconds=None,
                file_size_bytes=file_size,
                resolution=config.get("export_resolution", "1080p"),
                aspect_ratio=config.get("aspect_ratio", "9:16"),
                render_profile=config.get("render_profile", "balanced"),
                metadata={
                    "batch_job_id": job_id,
                    "source_tool": source_tool,
                    "generated_via": "batch_queue"
                }
            )
        except Exception as he:
            logger.error(f"Failed to save batch history: {he}")
            
        batch_queue_store.update_job(job_id, {
            "status": "completed", 
            "progress": 100, 
            "message": "Completed successfully",
            "output_url": f"/outputs/{output_filename}"
        })
        
    finally:
        try:
            shutil.rmtree(run_temp, ignore_errors=True)
        except Exception:
            pass

def start_runner():
    with runner_state.lock:
        if runner_state.is_running:
            return {"status": "already_running"}
            
        jobs = batch_queue_store.get_all_jobs()
        if not any(j.get("status") == "queued" for j in jobs):
            return {"status": "no_queued_jobs"}
            
        runner_state.is_running = True
        runner_state.stopping = False
        runner_state.paused_after_current = False
        runner_state.message = "Starting..."
        runner_state._thread = threading.Thread(target=_runner_loop, daemon=True)
        runner_state._thread.start()
        
        return {"status": "started"}

def pause_after_current():
    with runner_state.lock:
        if not runner_state.is_running:
            return {"status": "not_running"}
        runner_state.paused_after_current = True
        runner_state.message = "Pausing after current job..."
        return {"status": "pausing"}

def stop_runner():
    with runner_state.lock:
        if not runner_state.is_running:
            return {"status": "not_running"}
        runner_state.stopping = True
        runner_state.message = "Stopping queue..."
        return {"status": "stopping"}

def get_state():
    with runner_state.lock:
        return {
            "is_running": runner_state.is_running,
            "current_job_id": runner_state.current_job_id,
            "paused_after_current": runner_state.paused_after_current,
            "stopping": runner_state.stopping,
            "message": runner_state.message
        }

# Recover stuck jobs on startup
def _recover_stuck_jobs():
    try:
        jobs = batch_queue_store.get_all_jobs()
        for j in jobs:
            if j.get("status") == "running":
                logger.info(f"Recovering stuck job {j.get('id')} to failed status.")
                batch_queue_store.update_job(j["id"], {
                    "status": "failed", 
                    "message": "Interrupted by backend restart",
                    "progress": 0
                })
    except Exception as e:
        logger.error(f"Failed to recover stuck jobs: {e}")

_recover_stuck_jobs()
