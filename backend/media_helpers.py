import numpy as np
from PIL import Image, ImageFilter
from moviepy.editor import VideoClip, ColorClip, CompositeVideoClip, ImageClip, AudioFileClip, CompositeAudioClip
from moviepy.audio.fx.all import audio_fadein, audio_fadeout, volumex, audio_loop

# Map intensity to factor
INTENSITY_FACTOR = {
    "low": 0.5,
    "medium": 1.0,
    "high": 1.5,
}

def resolve_watermark_position(
    x: int,
    y: int,
    coordinate_mode: str,
    aspect_ratio: str,
    final_width: int,
    final_height: int,
    position_preset: str
):
    """
    Returns (final_x, final_y) tuple for watermark placement.
    Handles 'design_canvas' scaling, 'final_pixels' fallback, and presets.
    """
    if position_preset != "custom":
        if position_preset == "white_default":
            # For white_default, we usually handle it inside the generator but returning raw names is fine if generator parses strings
            return ("center", int(final_height * 0.85))
        elif position_preset == "bottom_right":
            return ("right", "bottom")
        elif position_preset == "bottom_left":
            return ("left", "bottom")
        elif position_preset == "top_right":
            return ("right", "top")
        elif position_preset == "top_left":
            return ("left", "top")
        elif position_preset == "center":
            return ("center", "center")
        
        # Fallback for unknown preset
        return ("right", "bottom")
    
    if coordinate_mode == "design_canvas":
        # Determine reference canvas
        if aspect_ratio == "9:16":
            design_w, design_h = 1080, 1920
        elif aspect_ratio == "16:9":
            design_w, design_h = 1920, 1080
        elif aspect_ratio == "1:1":
            design_w, design_h = 1080, 1080
        else:
            # Fallback
            design_w, design_h = final_width, final_height
        
        final_x = int(x / design_w * final_width)
        final_y = int(y / design_h * final_height)
        return (final_x, final_y)
    else:
        # final_pixels
        return (x, y)

def mix_background_music(
    main_audio_clip,
    music_path: str,
    final_duration: float,
    volume: float,
    loop: bool,
    fade: bool
):
    try:
        bg_clip = AudioFileClip(music_path)
    except Exception as e:
        raise ValueError("Background music file could not be processed. Please upload MP3, WAV, M4A, or AAC.")
        
    try:
        vol_factor = max(0.0, min(1.0, volume / 100.0))
        bg_clip = volumex(bg_clip, vol_factor)
        
        if loop and bg_clip.duration < final_duration:
            bg_clip = audio_loop(bg_clip, duration=final_duration)
        else:
            if bg_clip.duration > final_duration:
                bg_clip = bg_clip.subclip(0, final_duration)
                
        # Fix duration just in case
        bg_clip = bg_clip.set_duration(final_duration)
        
        if fade:
            fade_dur = 1.5
            if final_duration > fade_dur * 2:
                bg_clip = audio_fadein(bg_clip, fade_dur)
                bg_clip = audio_fadeout(bg_clip, fade_dur)
                
        final_audio = CompositeAudioClip([main_audio_clip.set_duration(final_duration), bg_clip])
        final_audio = final_audio.set_duration(final_duration)
        
        return final_audio, bg_clip
    except Exception as e:
        try: bg_clip.close()
        except: pass
        raise ValueError(f"Failed to mix background music.")


def pad_clip_to_size(clip, target_w: int, target_h: int):
    """
    Pads a clip to target_w x target_h with a black background if it does not already match.
    """
    if clip.w == target_w and clip.h == target_h:
        return clip
    bg = ColorClip(size=(target_w, target_h), color=(0, 0, 0)).set_duration(clip.duration)
    return CompositeVideoClip([bg, clip.set_position("center")])


def apply_motion_to_clip(
    clip: VideoClip,
    style: str,
    intensity: str,
    target_w: int,
    target_h: int
) -> VideoClip:
    """
    Applies dynamic motion to a VideoClip. 
    It pad-scales the clip so it can move without showing black borders.
    This works on any clip (VideoFileClip, ImageClip) by modifying its frames.
    """
    if style == "none":
        return clip

    # Motion requires the clip to be slightly larger than the target viewport
    factor = 1.0 + 0.1 * INTENSITY_FACTOR.get(intensity, 1.0)
    
    # First, ensure the base clip fills the target resolution + factor
    src_w, src_h = clip.w, clip.h
    padded_w = int(target_w * factor)
    padded_h = int(target_h * factor)
    
    # Scale clip up so its smallest dimension covers the padded box
    scale_to_pad = max(padded_w / src_w, padded_h / src_h)
    new_w = int(src_w * scale_to_pad)
    new_h = int(src_h * scale_to_pad)
    
    # Resize the clip
    resized_clip = clip.resize((new_w, new_h))
    
    # Center crop it to padded_w x padded_h to ensure it's precisely the bounding box we need
    x_center = (new_w - padded_w) // 2
    y_center = (new_h - padded_h) // 2
    padded_clip = resized_clip.crop(x1=x_center, y1=y_center, width=padded_w, height=padded_h)

    duration = clip.duration

    def fl_motion(get_frame, t):
        frame = get_frame(t)
        if frame.shape[0] != padded_h or frame.shape[1] != padded_w:
            # Fallback if crop didn't match perfectly (edge case with moviepy resize)
            try:
                frame = np.array(Image.fromarray(frame).resize((padded_w, padded_h), Image.LANCZOS))
            except:
                pass
        
        progress = min(t / max(duration, 0.001), 1.0)
        
        # Calculate crop box (crop_w x crop_h) that will be extracted from padded frame
        crop_w = target_w
        crop_h = target_h
        
        x0, y0 = 0, 0

        if style == "slow_zoom_in":
            # Crop box shrinks from padded to target
            curr_scale = 1.0 + (factor - 1.0) * (1.0 - progress)
            crop_w = int(target_w * curr_scale)
            crop_h = int(target_h * curr_scale)
            x0 = (padded_w - crop_w) // 2
            y0 = (padded_h - crop_h) // 2

        elif style == "slow_zoom_out":
            # Crop box grows from target to padded
            curr_scale = 1.0 + (factor - 1.0) * progress
            crop_w = int(target_w * curr_scale)
            crop_h = int(target_h * curr_scale)
            x0 = (padded_w - crop_w) // 2
            y0 = (padded_h - crop_h) // 2
            
        elif style == "pan_left":
            # Crop box moves right to left
            x0 = int((padded_w - target_w) * (1.0 - progress))
            y0 = (padded_h - target_h) // 2
            
        elif style == "pan_right":
            # Crop box moves left to right
            x0 = int((padded_w - target_w) * progress)
            y0 = (padded_h - target_h) // 2
            
        elif style == "pan_up":
            # Crop box moves bottom to top
            x0 = (padded_w - target_w) // 2
            y0 = int((padded_h - target_h) * (1.0 - progress))
            
        elif style == "pan_down":
            # Crop box moves top to bottom
            x0 = (padded_w - target_w) // 2
            y0 = int((padded_h - target_h) * progress)
            
        elif style == "ken_burns":
            # Zoom out and pan up-right slightly
            curr_scale = factor - (factor - 1.0) * progress * 0.5
            crop_w = int(target_w * curr_scale)
            crop_h = int(target_h * curr_scale)
            max_x_shift = padded_w - crop_w
            max_y_shift = padded_h - crop_h
            x0 = int(max_x_shift * progress)
            y0 = int(max_y_shift * (1.0 - progress))
            
        elif style == "dynamic_shorts":
            # Fast zoom in initially, then slow zoom
            ease_prog = 1.0 - (1.0 - progress)**3
            curr_scale = 1.0 + (factor - 1.0) * (1.0 - ease_prog)
            crop_w = int(target_w * curr_scale)
            crop_h = int(target_h * curr_scale)
            x0 = (padded_w - crop_w) // 2
            y0 = (padded_h - crop_h) // 2
            
        elif style == "subtle_random":
            # Gentle shake
            import math
            shake_x = math.sin(t * 2.0) * (padded_w - target_w) / 2
            shake_y = math.cos(t * 1.5) * (padded_h - target_h) / 2
            x0 = int((padded_w - target_w) // 2 + shake_x)
            y0 = int((padded_h - target_h) // 2 + shake_y)
            
        else:
            x0 = (padded_w - target_w) // 2
            y0 = (padded_h - target_h) // 2

        # Ensure bounds
        x0 = max(0, min(x0, padded_w - crop_w))
        y0 = max(0, min(y0, padded_h - crop_h))
        
        # Crop
        cropped = frame[y0:y0+crop_h, x0:x0+crop_w]
        
        # Resize to exactly target_w x target_h
        if cropped.shape[0] != target_h or cropped.shape[1] != target_w:
            img = Image.fromarray(cropped)
            img = img.resize((target_w, target_h), Image.BILINEAR)
            return np.array(img)
            
        return cropped

    return padded_clip.fl(fl_motion)

def apply_ass_filters_with_ffmpeg(
    input_video_path: str,
    output_video_path: str,
    caption_ass_path: str = None,
    overlay_ass_path: str = None,
    preset: str = "fast",
    crf: str = "22"
):
    import subprocess
    import os
    from pathlib import Path
    import logging

    logger = logging.getLogger(__name__)

    # Collect filters
    filters = []
    # Determine a safe working directory where the ASS files live
    cwd = None

    if caption_ass_path and os.path.exists(caption_ass_path):
        cwd = str(Path(caption_ass_path).parent)
        filters.append(f"ass={Path(caption_ass_path).name}")
        
    if overlay_ass_path and os.path.exists(overlay_ass_path):
        # We assume if both exist, they are in the same temp dir
        if not cwd:
            cwd = str(Path(overlay_ass_path).parent)
        filters.append(f"ass={Path(overlay_ass_path).name}")

    if not filters:
        # Just copy if no filters
        import shutil
        shutil.copy2(input_video_path, output_video_path)
        return

    from caption_engine import get_ffmpeg_cmd
    ffmpeg_cmd = get_ffmpeg_cmd()

    cmd = [
        ffmpeg_cmd, "-y",
        "-i", input_video_path,
        "-vf", ",".join(filters),
        "-c:v", "libx264",
        "-c:a", "copy",
        "-preset", preset,
        "-crf", crf,
        "-movflags", "+faststart",
        output_video_path
    ]

    logger.info(f"Applying ASS filters with FFmpeg: {' '.join(cmd)}")
    
    try:
        subprocess.run(
            cmd,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            cwd=cwd,
            timeout=1200
        )
    except subprocess.CalledProcessError as e:
        err_msg = e.stderr.decode('utf-8', errors='ignore') if e.stderr else str(e)
        logger.error(f"FFmpeg ASS filter application failed: {err_msg}")
        raise RuntimeError("Failed to apply ASS captions via FFmpeg.")
    except subprocess.TimeoutExpired:
        logger.error("FFmpeg ASS filter timed out")
        raise RuntimeError("Caption rendering timed out.")
